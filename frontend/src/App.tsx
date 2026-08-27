import { useCallback, useEffect, useState } from 'react'
import { BoardApiError, createCard, deleteCard, fetchBoard, moveCard, updateCard } from './api/board'
import type { Board, Card, TaskList } from './api/types'
import { withCards, withUpdatedCard, withoutCard } from './lib/boardEdit'
import { toCardIdsForAppend, withMovedCard } from './lib/moveCard'
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

/** id からタスクを探す。どのリストにあるかは呼び出し側の関心事ではないので、ここで畳む */
function findCard(board: Board, cardId: string): Card | undefined {
  return board.lists.flatMap((list) => list.cards).find((card) => card.id === cardId)
}

/** そのタスクが今いるリストを返す */
function findListOfCard(board: Board, cardId: string): TaskList | undefined {
  return board.lists.find((list) => list.cards.some((card) => card.id === cardId))
}

/** 表示順に並べたリスト。選択欄の並びを盤面の並びと揃えるために使う */
function sortedLists(board: Board): TaskList[] {
  return [...board.lists].sort((a, b) => a.position - b.position)
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
        setState((prev) =>
          prev.status === 'ready'
            ? { status: 'ready', board: withoutCard(prev.board, id) }
            : prev,
        )
      },
    )
  }, [])

  /**
   * タスクの内容を保存し、リストが変わっていれば移動もする（F-07, F-23）。
   *
   * 先に画面へ反映し、成功したら返ってきたボード全体で置き換える。モーダルは通信の
   * 結果を待たずに閉じる。保存を押した時点で利用者の操作は終わっており、待たせる
   * 理由がないため。
   *
   * **仕様は「保存で編集と移動が同時に確定する」だが、API は2本に分かれている**
   * （api.md 3.7 と 3.9）。そのため編集だけ成功して移動が失敗する状態が起こりうる。
   * このとき「操作前に戻す」（E-05）は成立しない。編集は既にコミットされており、
   * 画面だけ戻すと DB と食い違うため。
   *
   * 投げたリクエストの数で分ける。
   * - 1本だけ投げて失敗 → 何もコミットされていないので、操作前の状態へ戻す
   * - 1本目が成功して2本目が失敗 → サーバーから取り直す。嘘の状態を見せるより、
   *   DB の実態に合わせる方が安全
   */
  const handleSaveCard = useCallback(
    (cardId: string, input: CardDetailInput) => {
      if (state.status !== 'ready') return

      const { list_id: toListId, ...fields } = input

      // 移動は2つのリストにまたがるので、1枚のカードではなく盤面ごと控える。
      //
      // ここで setState に渡す関数の中から値を取り出さないこと。あの関数を実行するのは
      // React であり、setState を呼んだ直後にはまだ動いていない。以前そう書いたところ、
      // 「リストが変わったか」の判定が常に false になり、移動が送られなかった
      const before = state.board
      const card = findCard(before, cardId)
      const fromListId = findListOfCard(before, cardId)?.id
      if (!card || !fromListId) return

      const listChanged = fromListId !== toListId

      setActionError(null)
      setOpenCardId(null)

      const edited = withUpdatedCard(before, cardId, fields)
      const editedCard = findCard(edited, cardId)
      setState({
        status: 'ready',
        board: listChanged && editedCard ? withMovedCard(edited, editedCard, toListId) : edited,
      })

      // 編集の内容が変わっていなくても送る。変わったかどうかを判定して送信を省いても、
      // 「4項目を毎回送る」という API の約束（api.md 3.7）の方が単純で、
      // 同じ値で上書きするだけなので害がない
      let editCommitted = false

      updateCard(cardId, fields)
        .then((board) => {
          editCommitted = true
          if (!listChanged) return board

          return moveCard({
            card_id: cardId,
            from_list_id: fromListId,
            to_list_id: toListId,
            // 並びは編集後の応答から組み立てる。編集は並び順を変えないが、
            // いちばん新しい状態から作る方が食い違いの余地が少ない
            to_card_ids: toCardIdsForAppend(board, cardId, toListId),
          })
        })
        .then(
          (board) => setState({ status: 'ready', board }),
          (cause: unknown) => {
            setActionError(toActionMessage(cause))

            if (editCommitted) {
              // 編集は通っている。画面を操作前に戻すと DB と食い違うので取り直す
              load()
              return
            }
            setState({ status: 'ready', board: before })
          },
        )
    },
    [state, load],
  )

  /**
   * タスクを削除する（F-08）。
   *
   * 画面からは取り除くだけで、position は詰め直さない（withoutCard 参照）。
   *
   * 失敗したときは削除前のボードへ丸ごと戻す。
   *
   * **ただしこの形は、操作が重なると壊れる。** 控えているのが盤面「全体」なので、
   * 待っている間に別の操作が入ると、その分まで巻き戻して上書きしてしまう。
   * 実際に「削除の途中で編集すると削除が戻らない」不具合が出ている（#43）。
   * どの形に揃えるかはそちらで決めるため、ここでは読むタイミングだけ直してある。
   */
  const handleDeleteCard = useCallback(
    (cardId: string) => {
      if (state.status !== 'ready') return

      // 巻き戻しに使う盤面は、setState に渡した関数の中からではなく、いまの状態から取る。
      // あの関数を実行するのは React であり、いつ動くかは保証されていない（handleSaveCard 参照）
      const before = state.board

      setActionError(null)
      setDeletingCardId(null)

      setState({ status: 'ready', board: withoutCard(before, cardId) })

      deleteCard(cardId).then(
        (board) => setState({ status: 'ready', board }),
        (cause: unknown) => {
          setActionError(toActionMessage(cause))
          setState({ status: 'ready', board: before })
        },
      )
    },
    [state],
  )

  const openCard = state.status === 'ready' && openCardId ? findCard(state.board, openCardId) : undefined
  const openCardList =
    state.status === 'ready' && openCardId ? findListOfCard(state.board, openCardId) : undefined
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

      {openCard && openCardList && state.status === 'ready' && (
        <CardDetailModal
          card={openCard}
          currentList={openCardList}
          lists={sortedLists(state.board)}
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
