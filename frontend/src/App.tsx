import { useCallback, useEffect, useState } from 'react'
import { BoardApiError, createCard, deleteCard, fetchBoard, updateCard } from './api/board'
import type { Board, Card } from './api/types'
import { BoardView } from './components/BoardView'
import { CardDetailModal, type CardDetailInput } from './components/CardDetailModal'
import { ConfirmModal } from './components/ConfirmModal'
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
 * バックエンドが落ちている場合、開発中は fetch が失敗せず **Vite の proxy が
 * 502 を返す**（本番の同一オリジン構成でも、前段にリバースプロキシがあれば同様）。
 * つまりステータスコードだけでは、バックエンドが答えたのか proxy が答えたのかを
 * 区別できない。
 *
 * **そこで「自前のエラー本体（code）が読めたか」で判定する。** 読めたなら
 * バックエンドは動いており、答えを返している。読めなければ手前で止まっている。
 * DB だけ落ちている状態（E-04）も 503 を返すため、コードで区切ると
 * 「サーバーが起動していません」に吸われてしまう。
 */
function isUnreachable(cause: unknown): boolean {
  return !(cause instanceof BoardApiError) || cause.code === 'UNKNOWN'
}

function toErrorState(cause: unknown): LoadState {
  if (isUnreachable(cause)) return SERVER_DOWN

  const error = cause as BoardApiError
  return {
    status: 'error',
    title: error.message,
    // DB が止まっているだけなら、待っても直らない。起動を促す方に寄せる
    detail:
      error.code === 'DB_UNAVAILABLE'
        ? '起動してから再読み込みしてください。'
        : '時間をおいて再読み込みしてください。',
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

/** 1枚のタスクの内容を差し替えた新しい board を返す（元の board は変更しない） */
function withUpdatedCard(board: Board, cardId: string, input: CardDetailInput): Board {
  return {
    ...board,
    lists: board.lists.map((list) => ({
      ...list,
      cards: list.cards.map((card) => (card.id === cardId ? { ...card, ...input } : card)),
    })),
  }
}

/** id からタスクを探す。どのリストにあるかは呼び出し側の関心事ではないので、ここで畳む */
function findCard(board: Board, cardId: string): Card | undefined {
  return board.lists.flatMap((list) => list.cards).find((card) => card.id === cardId)
}

export default function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  // 詳細モーダルで開いているタスク。カードの実体ではなく id を持つ。実体を持つと、
  // 保存でボードが差し替わったときに古い内容を掴んだままになる
  const [openCardId, setOpenCardId] = useState<string | null>(null)
  // 削除の確認モーダルで対象にしているタスク。開いているタスクとは別に持つ。
  // 削除は詳細モーダルではなくカード上のアイコンから始まるため
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null)
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

  /**
   * タスクの内容を保存する（F-07）。
   *
   * 追加（F-06）と同じ流れ。先に画面へ反映し、成功したら返ってきたボード全体で
   * 置き換え、失敗したら編集前の状態へ戻す。
   *
   * モーダルは通信の結果を待たずに閉じる。保存を押した時点で利用者の操作は
   * 終わっており、待たせる理由がない。失敗したときは盤面が戻り、画面上部に
   * メッセージが出る（E-05）。
   */
  const handleSaveCard = useCallback((cardId: string, input: CardDetailInput) => {
    setActionError(null)
    setOpenCardId(null)

    let before: Card | undefined
    setState((prev) => {
      if (prev.status !== 'ready') return prev
      before = findCard(prev.board, cardId)
      if (!before) return prev
      return { status: 'ready', board: withUpdatedCard(prev.board, cardId, input) }
    })

    updateCard(cardId, input).then(
      (board) => setState({ status: 'ready', board }),
      (cause: unknown) => {
        setActionError(toActionMessage(cause))
        setState((prev) => {
          if (prev.status !== 'ready' || !before) return prev
          return { status: 'ready', board: withUpdatedCard(prev.board, cardId, before) }
        })
      },
    )
  }, [])

  /**
   * タスクを削除する（F-08）。
   *
   * 画面からは取り除くだけで、残ったタスクの position は詰め直さない。並び順は
   * position の昇順で決まるので、番号に穴が空いていても見た目は変わらない。
   * 正しい連番は応答で入る。ここで詰めると、サーバーと同じ採番を画面が持つことになる。
   *
   * 失敗したときは削除前のボードへ丸ごと戻す。取り除いた1枚を元の位置に挿し直すより、
   * 手元に残しておいた盤面を使う方が確実。
   */
  const handleDeleteCard = useCallback((cardId: string) => {
    setActionError(null)
    setDeletingCardId(null)

    let before: Board | undefined
    setState((prev) => {
      if (prev.status !== 'ready') return prev
      before = prev.board
      return {
        status: 'ready',
        board: {
          ...prev.board,
          lists: prev.board.lists.map((list) => ({
            ...list,
            cards: list.cards.filter((card) => card.id !== cardId),
          })),
        },
      }
    })

    deleteCard(cardId).then(
      (board) => setState({ status: 'ready', board }),
      (cause: unknown) => {
        setActionError(toActionMessage(cause))
        if (before) setState({ status: 'ready', board: before })
      },
    )
  }, [])

  const openCard = state.status === 'ready' && openCardId ? findCard(state.board, openCardId) : undefined
  const deletingCard =
    state.status === 'ready' && deletingCardId ? findCard(state.board, deletingCardId) : undefined

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
      {state.status === 'ready' && (
        <BoardView
          board={state.board}
          onAddCard={handleAddCard}
          onOpenCard={setOpenCardId}
          onDeleteCard={setDeletingCardId}
        />
      )}

      {openCard && (
        <CardDetailModal
          card={openCard}
          onSave={(input) => handleSaveCard(openCard.id, input)}
          onCancel={() => setOpenCardId(null)}
        />
      )}

      {deletingCard && (
        <ConfirmModal
          title="削除の確認"
          lines={[`タスク「${deletingCard.title}」を削除します。`, 'この操作は取り消せません。']}
          confirmLabel="削除する"
          onConfirm={() => handleDeleteCard(deletingCard.id)}
          onCancel={() => setDeletingCardId(null)}
        />
      )}
    </>
  )
}
