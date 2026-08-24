import { useCallback, useEffect, useState } from 'react'
import { BoardApiError, createCard, fetchBoard } from './api/board'
import type { Board, Card } from './api/types'
import { BoardView } from './components/BoardView'
import { LoadError } from './components/LoadError'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; board: Board }
  | { status: 'error'; title: string; detail: string }

const SERVER_DOWN: LoadState = {
  status: 'error',
  title: 'サーバーが起動していません。',
  detail: '起動してから再読み込みしてください。',
}

/**
 * サーバーに届かなかったのか、届いた上で断られたのかで文言を分ける。
 * 「サーバーが起動していません」を 404 のときにも出すと、利用者は
 * 起動しているサーバーを起動しようとして詰まる。
 *
 * ただしバックエンドが落ちている場合、開発中は fetch が失敗せず
 * **Vite の proxy が 502 を返す**（本番の同一オリジン構成でも、前段に
 * リバースプロキシがあれば同様）。502/503/504 は「向こう側に届かなかった」
 * ことを意味するので、通信失敗と同じ扱いにする。
 */
const UNREACHABLE_STATUS = [502, 503, 504]

function isUnreachable(cause: unknown): boolean {
  return !(cause instanceof BoardApiError) || UNREACHABLE_STATUS.includes(cause.status)
}

function toErrorState(cause: unknown): LoadState {
  if (isUnreachable(cause)) return SERVER_DOWN
  return {
    status: 'error',
    title: (cause as BoardApiError).message,
    detail: '時間をおいて再読み込みしてください。',
  }
}

/** 操作の失敗を伝える文言。読み込みの失敗と違い、盤面は残したまま上部に出す */
function toActionMessage(cause: unknown): string {
  if (isUnreachable(cause)) return 'サーバーに接続できませんでした。'
  return (cause as BoardApiError).message
}

/** 1つのリストの cards を差し替えた新しい board を返す（元の board は変更しない） */
function withCards(board: Board, listId: string, cards: Card[]): Board {
  return {
    ...board,
    lists: board.lists.map((list) => (list.id === listId ? { ...list, cards } : list)),
  }
}

export default function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  // 追加などの操作が失敗したときのメッセージ。LoadState とは別に持つ。
  // 一緒にしてしまうと、追加に失敗しただけで画面全体が LoadError に
  // 置き換わり、まだ読めていたはずの盤面まで消える
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(() => {
    setState({ status: 'loading' })
    setActionError(null)
    fetchBoard().then(
      (board) => setState({ status: 'ready', board }),
      (cause: unknown) => setState(toErrorState(cause)),
    )
  }, [])

  useEffect(load, [load])

  /**
   * タスクを追加する（F-06）。
   *
   * サーバーの応答を待たずに先に画面へ反映する。ID をクライアントで採番して
   * いるのはこのため。成功したら返ってきたボード全体で置き換え、失敗したら
   * 追加前の状態へ戻す。
   *
   * 先に描くのは待たせないため、置き換えるのは position の正解をサーバーだけが
   * 持つようにするためで、この2つは両立する。置き換えの内容は画面が描いたものと
   * 同じになるはずなので、見た目は変化しない。
   *
   * 既存 ID との重複確認はしない。UUID v4 の衝突確率は無視できる上に、
   * 自分の画面に無いデータとは比較できないので確認としても成立しない。
   * 最終的な担保は cards テーブルの主キー制約。
   */
  const handleAddCard = useCallback((listId: string, title: string) => {
    const id = crypto.randomUUID()
    setActionError(null)

    setState((prev) => {
      if (prev.status !== 'ready') return prev

      const list = prev.board.lists.find((l) => l.id === listId)
      if (!list) return prev

      // サーバーの採番は再現しない。この暫定カードが列の先頭に並べば十分なので、
      // 既存のどれよりも小さい値を置くだけにする。正しい position は応答で入る
      const newCard: Card = {
        id,
        title,
        description: '',
        due_at: null,
        has_due_time: false,
        position: -1,
      }

      return { status: 'ready', board: withCards(prev.board, listId, [newCard, ...list.cards]) }
    })

    createCard({ id, list_id: listId, title }).then(
      (board) => setState({ status: 'ready', board }),
      (cause: unknown) => {
        setActionError(toActionMessage(cause))
        // 追加した分を取り除いて元に戻す。既存のカードには触っていないので、
        // 暫定カードを外すだけで追加前の状態に戻る
        setState((prev) => {
          if (prev.status !== 'ready') return prev
          const list = prev.board.lists.find((l) => l.id === listId)
          if (!list) return prev
          const cards = list.cards.filter((c) => c.id !== id)
          return { status: 'ready', board: withCards(prev.board, listId, cards) }
        })
      },
    )
  }, [])

  return (
    <>
      <header className="border-b border-line bg-surface px-5 py-3">
        <h1 className="m-0 text-lg font-bold">
          {state.status === 'ready' ? state.board.title : 'マイタスク'}
        </h1>
      </header>

      {actionError && (
        <div
          role="alert"
          className="mx-5 mt-4 flex items-start justify-between gap-3 rounded-card border border-danger bg-surface px-3 py-2"
        >
          <p className="m-0 text-danger">{actionError}</p>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label="閉じる"
            className="cursor-pointer border-0 bg-transparent px-1 leading-none text-ink-sub hover:text-ink"
          >
            ✕
          </button>
        </div>
      )}

      {state.status === 'loading' && (
        <p className="px-5 py-10 text-center text-ink-sub">読み込み中…</p>
      )}
      {state.status === 'error' && (
        <LoadError title={state.title} detail={state.detail} onRetry={load} />
      )}
      {state.status === 'ready' && <BoardView board={state.board} onAddCard={handleAddCard} />}
    </>
  )
}
