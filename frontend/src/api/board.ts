import type { ApiError, Board } from './types'

/**
 * サーバー側が返したエラー。
 * ネットワーク自体の失敗（バックエンド未起動など）とは区別したいので、
 * fetch の reject をそのまま流さず、こちらは独自の型で投げる。
 */
export class BoardApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'BoardApiError'
    this.status = status
    this.code = code
  }
}

/**
 * すべてのリクエストの上限。
 *
 * 画面は応答待ちの間ずっと操作を止める（App.tsx の pending）。解除はリクエストの
 * 決着で行うため、**応答が返らないと操作できないままになる。** fetch には既定の
 * タイムアウトが無いので、ここで上限を置く。
 *
 * DB が止まっている場合、バックエンドは HikariCP の connection-timeout（30秒）を
 * 待ってから 503 を返す。それより十分に長く、かつ画面が固まったままにならない値。
 */
const TIMEOUT_MS = 35_000

/**
 * 上限付きの fetch。
 *
 * 超過すると DOMException（TimeoutError）が投げられる。BoardApiError ではないので
 * App.tsx の isUnreachable が true を返し、「サーバーに接続できませんでした。」として
 * 扱われる。呼び出し側に追加のハンドリングは要らない。
 */
function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
}

/**
 * 失敗レスポンスを BoardApiError に変換する。
 *
 * エラー本体が読めない場合（HTML のエラーページなど）もあるため、
 * 解析の失敗でここが落ちないようにする。
 *
 * @param fallback 本体からメッセージが取れなかったときに出す文言
 */
async function toApiError(res: Response, fallback: string): Promise<BoardApiError> {
  let body: Partial<ApiError> = {}
  try {
    body = (await res.json()) as Partial<ApiError>
  } catch {
    // 解析できなければ status だけで伝える
  }
  return new BoardApiError(
    res.status,
    body.code ?? 'UNKNOWN',
    body.message ?? `${fallback}（HTTP ${res.status}）。`,
  )
}

/**
 * ボード・リスト・タスクを一括で取得する（F-01）。
 *
 * パスは相対にしておく。開発中は Vite の proxy が :8080 へ転送し、
 * 本番でも同一オリジンから配信する前提のため、ホストを書く必要がない。
 */
export async function fetchBoard(): Promise<Board> {
  const res = await apiFetch('/api/board')

  if (!res.ok) throw await toApiError(res, 'ボードを取得できませんでした')

  return (await res.json()) as Board
}

/**
 * リストを「完了」列の左隣に追加する（F-02）。仕様は docs/design/api.md 3.2。
 *
 * 挿入位置は送らない。追加先は完了列の左隣と決まっており、position の採番は
 * サーバーだけが持つ。id を呼び出し側が採番する理由は createCard と同じ。
 */
export async function createList(input: { id: string; title: string }): Promise<Board> {
  const res = await apiFetch('/api/lists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) throw await toApiError(res, 'リストを追加できませんでした')

  return (await res.json()) as Board
}

/**
 * リスト名を変える（F-03）。仕様は docs/design/api.md 3.3。
 *
 * デフォルトの3列は 409（LIST_PROTECTED）で断られる。画面側でも改名ボタンを
 * 出さないが、判断はサーバーが持つ。
 */
export async function updateList(id: string, input: { title: string }): Promise<Board> {
  const res = await apiFetch(`/api/lists/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) throw await toApiError(res, 'リスト名を変更できませんでした')

  return (await res.json()) as Board
}

/**
 * リストを並び替える（F-05）。仕様は docs/design/api.md 3.5。
 *
 * list_ids は**変更後の並び順すべて**。配列の添字がそのまま position になる。
 * 完了列が末尾に無い並びは 409（FIXED_LAST_MUST_BE_LAST）で断られる。
 */
export async function reorderLists(input: { list_ids: string[] }): Promise<Board> {
  const res = await apiFetch('/api/lists/reorder', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) throw await toApiError(res, 'リストを並び替えできませんでした')

  return (await res.json()) as Board
}

/**
 * リストを、中のタスクごと削除する（F-04）。仕様は docs/design/api.md 3.4。
 *
 * 返るのはボード全体。削除で変わるのは対象のリストだけではなく、後続のリストの
 * position も詰まるため。
 */
export async function deleteList(id: string): Promise<Board> {
  const res = await apiFetch(`/api/lists/${id}`, { method: 'DELETE' })

  if (!res.ok) throw await toApiError(res, 'リストを削除できませんでした')

  return (await res.json()) as Board
}

/**
 * タスクをリストの先頭に追加する（F-06）。仕様は docs/design/api.md 3.6。
 *
 * id は呼び出し側が採番して渡す。サーバーの応答を待たずに画面へ描くため、
 * 描いた時点で ID が確定している必要がある。
 *
 * 説明文と期限は送らない。追加直後は空文字・期限なしで、編集は詳細モーダル
 * （Step 4 以降）が担当する。
 *
 * 返るのは追加された1件ではなくボード全体（api.md 2.7）。position の再採番で
 * 変わるのは追加したカードだけではないため、呼び出し側はこれで丸ごと置き換える。
 */
export async function createCard(input: {
  id: string
  list_id: string
  title: string
}): Promise<Board> {
  const res = await apiFetch('/api/cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) throw await toApiError(res, 'タスクを追加できませんでした')

  return (await res.json()) as Board
}

/**
 * タスクのタイトル・説明文・期限を更新する（F-07）。仕様は docs/design/api.md 3.7。
 *
 * 4項目すべてを毎回送る。部分更新にしないのは、詳細モーダルが4項目をまとめて
 * 保存するため。編集していない項目も、いま画面が持っている値をそのまま送る。
 *
 * リストの変更（移動）はここではできない。Step 8 の PATCH /api/cards/move が担う。
 */
export async function updateCard(
  id: string,
  input: { title: string; description: string; due_at: string | null; has_due_time: boolean },
): Promise<Board> {
  const res = await apiFetch(`/api/cards/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) throw await toApiError(res, 'タスクを保存できませんでした')

  return (await res.json()) as Board
}

/**
 * タスクを移動する（F-23、Step 11 では F-13 も）。仕様は docs/design/api.md 3.9。
 *
 * to_card_ids は移動後の移動先リストの並び順すべて。配列の添字がそのまま position に
 * なるので、これが並び順そのものになる。移動元の並びは送らない（サーバーが詰め直す）。
 */
export async function moveCard(input: {
  card_id: string
  from_list_id: string
  to_list_id: string
  to_card_ids: string[]
}): Promise<Board> {
  const res = await apiFetch('/api/cards/move', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) throw await toApiError(res, 'タスクを移動できませんでした')

  return (await res.json()) as Board
}

/**
 * タスクを削除する（F-08）。仕様は docs/design/api.md 3.8。
 *
 * 204 ではなくボード全体が返る。削除で変わるのは対象のタスクだけではなく、
 * 同じリストの後続タスクの position も詰まるため。
 */
export async function deleteCard(id: string): Promise<Board> {
  const res = await apiFetch(`/api/cards/${id}`, { method: 'DELETE' })

  if (!res.ok) throw await toApiError(res, 'タスクを削除できませんでした')

  return (await res.json()) as Board
}

/**
 * 選択したタスクをまとめて削除する（F-15）。仕様は docs/design/api.md 3.10。
 *
 * DELETE ではなく POST なのは、削除する ID の一覧を本文で渡すため。
 *
 * **存在しない ID が1つでも混ざっていたら、サーバーは1件も削除せずに 404 を返す。**
 * 部分的に成功することがないので、呼び出し側は成功か失敗かだけを見ればよい。
 */
export async function bulkDeleteCards(cardIds: string[]): Promise<Board> {
  const res = await apiFetch('/api/cards/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ card_ids: cardIds }),
  })

  if (!res.ok) throw await toApiError(res, 'タスクを削除できませんでした')

  return (await res.json()) as Board
}
