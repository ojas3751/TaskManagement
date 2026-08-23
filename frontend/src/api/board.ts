import type { ApiError, Board, Card } from './types'

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
  const res = await fetch('/api/board')

  if (!res.ok) throw await toApiError(res, 'ボードを取得できませんでした')

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
 */
export async function createCard(input: {
  id: string
  list_id: string
  title: string
}): Promise<Card> {
  const res = await fetch('/api/cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) throw await toApiError(res, 'タスクを追加できませんでした')

  return (await res.json()) as Card
}
