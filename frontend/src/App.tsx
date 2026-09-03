import { useCallback, useEffect, useState } from 'react'
import {
  BoardApiError,
  bulkDeleteCards,
  createCard,
  createList,
  deleteCard,
  deleteList,
  fetchBoard,
  moveCard,
  reorderLists,
  updateCard,
  updateList,
} from './api/board'
import type { Board, Card, TaskList } from './api/types'
import {
  withCards,
  withList,
  withRenamedList,
  withUpdatedCard,
  withoutCard,
  withoutCards,
  withoutList,
} from './lib/boardEdit'
import {
  toCardIdsForAppend,
  toCardIdsForInsert,
  withMovedCard,
  withReorderedCard,
} from './lib/moveCard'
import { withListOrder, withSwappedList } from './lib/reorderLists'
import { BoardView } from './components/BoardView'
import { CardDetailModal, type CardDetailInput } from './components/CardDetailModal'
import { ConfirmModal } from './components/ConfirmModal'
import { ListDetailModal } from './components/ListDetailModal'
import { LoadError } from './components/LoadError'
import { NameInputModal } from './components/NameInputModal'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; board: Board }
  | { status: 'error'; title: string; detail: string }

/**
 * 応答待ちの見せ方（#44）。
 *
 * - `idle` … 何も出さない。待っていないか、まだ十分に速い
 * - `slow` … 遅い。処理中であることだけを伝える
 * - `checking` … つながっていない見込み。何を確認しているかまで伝える
 */
type WaitPhase = 'idle' | 'slow' | 'checking'

/** ここまでは何も出さない。正常時（10ms 前後）に表示がチラつかない値 */
const SLOW_AFTER_MS = 200

/** ここまで待たされたら「遅い」ではなく「つながっていない」として扱う */
const CHECKING_AFTER_MS = 2_000

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
  // 選択削除（F-15）の確認モーダルで対象にしているタスク。1枚の削除とは別に持つ。
  // 対象が複数あり、件数を文言に出すため
  const [bulkDeletingCardIds, setBulkDeletingCardIds] = useState<string[] | null>(null)
  // 詳細モーダルで開いているリスト（F-03, F-04）。カードと同じく id で持つ。
  // 列ではなく App が持つのは、削除が確認モーダルへ続くため
  const [openListId, setOpenListId] = useState<string | null>(null)
  // 削除の確認モーダルで対象にしているリスト
  const [deletingListId, setDeletingListId] = useState<string | null>(null)
  /**
   * リストの編集モード（F-24）。**リストに関する操作はすべてこの中にある。**
   *
   * 追加・改名・削除・並び替えのどれも、入口を出すのはモード中だけ。**モード外の盤面に
   * 残るのはリスト名とタスクだけになる**（機能仕様書 1.6）。狙いは、頻度の低いリスト操作に
   * 平時の画面を使わせないこと。
   *
   * **盤面ではなく App が持つ。** 出入りのボタンがヘッダーにあり、`Esc` も画面全体で拾うため。
   */
  const [isEditingLists, setIsEditingLists] = useState(false)
  /**
   * リストの追加モーダル（F-02）を開いているか。
   *
   * **列の `[+ タスク追加]` と違い、盤面ではなく App が持つ。** モード中の `Esc` を
   * 「モードを抜ける」に使うため、**モーダルが開いているかを App が知っている必要がある**
   * （下の useEffect を参照）。他のモーダルの状態もすべてここに揃っている
   */
  const [isAddingList, setIsAddingList] = useState(false)
  // 追加などの操作が失敗したときのメッセージ。LoadState とは別に持つ。
  // 一緒にしてしまうと、追加に失敗しただけで画面全体が LoadError に
  // 置き換わり、まだ読めていたはずの盤面まで消える
  const [actionError, setActionError] = useState<string | null>(null)
  // 飛んでいるリクエストの数（#43, #44）。0 より大きい間は盤面を触れなくする。
  //
  // **これが 0 か 1 しか取らないことに、巻き戻しの正しさが乗っている。** 詳しくは
  // handleDeleteCard のコメント。数で持っているのは、将来ロックを緩めたときに
  // 「複数飛びうる」という事実がここに現れるようにするため
  const [pending, setPending] = useState(0)
  const isBusy = pending > 0
  // 応答待ちをどう見せているか。段階の意味は下の useEffect を参照
  const [waitPhase, setWaitPhase] = useState<WaitPhase>('idle')

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
   * 応答待ちの見せ方を2段階に分ける（#44）。
   *
   * すぐには何も出さない。正常時の応答は 10ms 前後で、即座に出すと**操作のたびに
   * 一瞬だけ現れて消える。** チラつきとして見えるだけで、無い方がましになる。
   * 遅らせておけば、速いときは何も出ず、遅いときだけ出る。
   *
   * 2秒まで待たされているなら、それはもう「遅い」ではなく「つながっていない」に
   * 近い。文言を、何が起きているかを言うものに差し替える。
   *
   * 依存は isBusy（真偽値）にする。pending（数）にすると、値が動くたびにタイマーを
   * 張り直してしまう
   */
  useEffect(() => {
    if (!isBusy) {
      setWaitPhase('idle')
      return
    }
    const slow = setTimeout(() => setWaitPhase('slow'), SLOW_AFTER_MS)
    const checking = setTimeout(() => setWaitPhase('checking'), CHECKING_AFTER_MS)
    return () => {
      clearTimeout(slow)
      clearTimeout(checking)
    }
  }, [isBusy])

  /**
   * 開いているモーダルがあるか。**`Esc` の行き先を決めるために使う。**
   *
   * モーダルはどれも `Esc` で閉じる作りで、その待ち受けを `window` に置いている
   * （NameInputModal など）。**モード中の `Esc` を無条件で拾うと、モーダルを閉じる
   * つもりの `Esc` でモードまで抜けてしまう。**
   *
   * **列の `[+ タスク追加]` のモーダルは数に入れていない。** これは ListColumn が
   * 自前で持っており、ここからは見えないため。**モード外では普通に開くので、
   * 「開いていることがない」わけではない。** 数えなくてよい理由は、下の useEffect が
   * `isEditingLists` でないときは何もしないから — モード外の `Esc` はモーダル側だけが拾う。
   */
  const isModalOpen =
    openCardId !== null ||
    deletingCardId !== null ||
    bulkDeletingCardIds !== null ||
    openListId !== null ||
    deletingListId !== null ||
    isAddingList

  /**
   * `Esc` で編集モードを抜ける（F-24）。マウスでもキーボードでも出口を同じにする。
   *
   * **列を掴んでいる最中の `Esc` はここでは扱わない。** dnd-kit がその移動の取り消しに
   * 使うため（画面設計 1.2）。掴んでいる間は dnd-kit 側が先に受け取る。
   */
  useEffect(() => {
    if (!isEditingLists || isModalOpen) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsEditingLists(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isEditingLists, isModalOpen])

  /**
   * リストを追加する（F-02）。
   *
   * 形は handleAddCard と同じ。先に画面へ反映し、成功したら返ってきたボード全体で
   * 置き換え、失敗したら足した分だけ取り除いて戻す。
   *
   * 件数の上限（追加分で10件）は画面では見ない。サーバーが 409 で断り、その文言を
   * そのまま出す。上限の判断をサーバーだけが持つようにするため（api.md 2.3）。
   */
  const handleAddList = useCallback(
    (title: string) => {
      // 応答待ちの間は盤面が inert なのでここには来ないが、保険として置く
      if (isBusy) return

      const id = crypto.randomUUID()
      setActionError(null)

      setState((prev) =>
        prev.status === 'ready'
          ? { status: 'ready', board: withList(prev.board, id, title) }
          : prev,
      )

      setPending((n) => n + 1)
      createList({ id, title })
        .then(
          (board) => setState({ status: 'ready', board }),
          (cause: unknown) => {
            setActionError(toActionMessage(cause))
            // 足した列を取り除くだけで追加前に戻る。既存の列には触っていない
            setState((prev) =>
              prev.status === 'ready'
                ? { status: 'ready', board: withoutList(prev.board, id) }
                : prev,
            )
          },
        )
        .finally(() => setPending((n) => n - 1))
    },
    [isBusy],
  )

  /**
   * リスト名を変える（F-03）。
   *
   * 先に画面へ反映し、失敗したら**変更前の名前**へ戻す。盤面ごと控えないのは、
   * 変わるのが1つの列の名前だけで、他はどこも動かないため。
   *
   * デフォルトの3列かどうかは見ない。改名ボタンをそもそも出しておらず、
   * 最終的な担保はサーバーの 409（api.md 3.3）。
   */
  const handleRenameList = useCallback(
    (listId: string, title: string) => {
      if (state.status !== 'ready' || isBusy) return

      // 巻き戻しに使う値は、setState に渡す関数の中からではなく、いまの状態から取る
      const before = state.board.lists.find((list) => list.id === listId)?.title
      if (before === undefined) return

      setActionError(null)
      setOpenListId(null)
      setState({ status: 'ready', board: withRenamedList(state.board, listId, title) })

      setPending((n) => n + 1)
      updateList(listId, { title })
        .then(
          (board) => setState({ status: 'ready', board }),
          (cause: unknown) => {
            setActionError(toActionMessage(cause))
            setState((prev) =>
              prev.status === 'ready'
                ? { status: 'ready', board: withRenamedList(prev.board, listId, before) }
                : prev,
            )
          },
        )
        .finally(() => setPending((n) => n - 1))
    },
    [state, isBusy],
  )

  /**
   * リストを並び替える（F-05 / F-21）。**並べ終わった id を受け取って送る。**
   *
   * `[←] [→]`（F-05）とドラッグ&ドロップ（F-21）で**入口は違うが、ここから先は同じ。**
   * 「どう並べ替えるか」を求める役は呼び出し側（`withSwappedList` / `withMovedList`）が
   * 持ち、ここは**結果の並びを画面へ描いて送るだけ**にしてある。タスクの移動で F-13 と
   * F-23 を同じ `handleMoveCard` に流しているのと同じ形。
   *
   * 失敗したときは並び替える前の盤面へ戻す。**position は複数の列にまたがって変わる**ので、
   * 1 つの値ではなく盤面ごと控える。
   *
   * 「完了より右へ行けない」は画面では落とせないことで表し、判断の正本はサーバー
   * （409 FIXED_LAST_MUST_BE_LAST）に置く。
   */
  const handleReorderLists = useCallback(
    (listIds: string[]) => {
      if (state.status !== 'ready' || isBusy) return

      const before = state.board

      setActionError(null)
      setState({ status: 'ready', board: withListOrder(before, listIds) })

      setPending((n) => n + 1)
      reorderLists({ list_ids: listIds })
        .then(
          (board) => setState({ status: 'ready', board }),
          (cause: unknown) => {
            setActionError(toActionMessage(cause))
            setState({ status: 'ready', board: before })
          },
        )
        .finally(() => setPending((n) => n - 1))
    },
    [state, isBusy],
  )

  /**
   * リストを隣と入れ替える（F-05）。`[←] [→]` の入口。
   *
   * **入れ替えた並びを求めて `handleReorderLists` に渡すだけ。** 送信も巻き戻しも
   * そちらが持つ。ドラッグ&ドロップ（F-21）との違いは、この1行の求め方だけになる。
   */
  const handleMoveList = useCallback(
    (listId: string, direction: -1 | 1) => {
      if (state.status !== 'ready') return
      handleReorderLists(withSwappedList(state.board, listId, direction))
    },
    [state, handleReorderLists],
  )

  /**
   * リストを、中のタスクごと削除する（F-04）。
   *
   * 失敗したときは削除前のボードへ丸ごと戻す。列が消えるとタスクも一緒に消えるので、
   * 戻す単位も盤面になる。この形が正しい前提（飛んでいるリクエストが常に1本）は
   * handleDeleteCard のコメントを参照。
   */
  const handleDeleteList = useCallback(
    (listId: string) => {
      if (state.status !== 'ready' || isBusy) return

      const before = state.board

      setActionError(null)
      setDeletingListId(null)

      setState({ status: 'ready', board: withoutList(before, listId) })

      setPending((n) => n + 1)
      deleteList(listId)
        .then(
          (board) => setState({ status: 'ready', board }),
          (cause: unknown) => {
            setActionError(toActionMessage(cause))
            setState({ status: 'ready', board: before })
          },
        )
        .finally(() => setPending((n) => n - 1))
    },
    [state, isBusy],
  )

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
  const handleAddCard = useCallback(
    (listId: string, title: string) => {
      // 応答待ちの間は盤面が inert なのでここには来ないが、保険として置く
      if (isBusy) return

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

      setPending((n) => n + 1)
      createCard({ id, list_id: listId, title })
        .then(
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
        .finally(() => setPending((n) => n - 1))
    },
    [isBusy],
  )

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
      if (state.status !== 'ready' || isBusy) return

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

      // 2本投げるが、数えるのは1回だけ。利用者にとっては「保存」という1つの操作で、
      // その全体が終わるまで盤面を触らせない
      setPending((n) => n + 1)

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
        .finally(() => setPending((n) => n - 1))
    },
    [state, isBusy, load],
  )

  /**
   * タスクをドラッグ&ドロップで移動する（F-13）。
   *
   * 送り先は F-23 と**同じ `PATCH /api/cards/move`。** 「タスクを別リストの指定位置へ
   * 移す」という操作は入力手段が違うだけで同一であり、分けると再採番のロジックが
   * 二重化する（api.md 2.1）。違うのは `to_card_ids` の組み立て方だけで、
   * F-23 は末尾に足し、こちらは落とした位置に挿す。
   *
   * 失敗したときは移動前の盤面へ戻す。**position は 2 つの列にまたがって変わる**ので、
   * handleMoveList と同じく盤面ごと控える。
   */
  const handleMoveCard = useCallback(
    (cardId: string, toListId: string, toIndex: number) => {
      if (state.status !== 'ready' || isBusy) return

      const before = state.board
      const fromListId = findListOfCard(before, cardId)?.id
      if (!fromListId) return

      // 送る配列は**移動前の盤面**から作る。画面へ反映したあとの盤面から作っても同じに
      // なるが、送る内容と控えた内容の出どころを 1 つに揃えておく
      const toCardIds = toCardIdsForInsert(before, cardId, toListId, toIndex)

      setActionError(null)
      setState({ status: 'ready', board: withReorderedCard(before, cardId, toListId, toIndex) })

      setPending((n) => n + 1)
      moveCard({
        card_id: cardId,
        from_list_id: fromListId,
        to_list_id: toListId,
        to_card_ids: toCardIds,
      })
        .then(
          (board) => setState({ status: 'ready', board }),
          (cause: unknown) => {
            setActionError(toActionMessage(cause))
            setState({ status: 'ready', board: before })
          },
        )
        .finally(() => setPending((n) => n - 1))
    },
    [state, isBusy],
  )

  /**
   * タスクを削除する（F-08）。
   *
   * 画面からは取り除くだけで、position は詰め直さない（withoutCard 参照）。
   *
   * 失敗したときは削除前のボードへ丸ごと戻す。3つの操作すべてがこの形で、
   * 「操作前の盤面を控えておいて、失敗したらそれで上書きする」で揃えてある。
   *
   * **この形が正しいのは、応答待ちの間は新しい操作を始められないからである。**
   * 飛んでいるリクエストが常に1本なら、控えた盤面は「すべての操作より前」と一致する。
   *
   * 逆に言えば、**ロックを外すとこの前提が崩れる。** 控えているのが盤面「全体」なので、
   * 待っている間に別の操作が入ると、その分まで巻き戻して上書きしてしまう。実際に
   * 「削除の途中で編集すると削除が戻らない」不具合が出ていた（#43）。
   *
   * **ロックは見た目のための機能ではない。** 外すなら、先に巻き戻しの形を作り直すこと。
   */
  const handleDeleteCard = useCallback(
    (cardId: string) => {
      if (state.status !== 'ready' || isBusy) return

      // 巻き戻しに使う盤面は、setState に渡した関数の中からではなく、いまの状態から取る。
      // あの関数を実行するのは React であり、いつ動くかは保証されていない（handleSaveCard 参照）
      const before = state.board

      setActionError(null)
      setDeletingCardId(null)

      setState({ status: 'ready', board: withoutCard(before, cardId) })

      setPending((n) => n + 1)
      deleteCard(cardId)
        .then(
          (board) => setState({ status: 'ready', board }),
          (cause: unknown) => {
            setActionError(toActionMessage(cause))
            setState({ status: 'ready', board: before })
          },
        )
        .finally(() => setPending((n) => n - 1))
    },
    [state, isBusy],
  )

  /**
   * 選択したタスクをまとめて削除する（F-15）。
   *
   * **handleDeleteCard をそのまま複数件に広げただけ。** 操作前の盤面を控えて、失敗したら
   * それで上書きする形も同じ。**この形が正しい前提（飛んでいるリクエストが常に1本）は
   * handleDeleteCard のコメントにある。ロックを外すなら先に巻き戻しの形を作り直すこと。**
   *
   * 部分的な成功を考えなくてよい。サーバーは1件でも見つからなければ1件も削除せず
   * 404 を返すため（api.md 3.10）、結果は「全部消えた」か「何も消えていない」の
   * どちらかにしかならない。
   */
  const handleBulkDeleteCards = useCallback(
    (cardIds: string[]) => {
      if (state.status !== 'ready' || isBusy || cardIds.length === 0) return

      const before = state.board

      setActionError(null)
      setBulkDeletingCardIds(null)

      setState({ status: 'ready', board: withoutCards(before, cardIds) })

      setPending((n) => n + 1)
      bulkDeleteCards(cardIds)
        .then(
          (board) => setState({ status: 'ready', board }),
          (cause: unknown) => {
            setActionError(toActionMessage(cause))
            setState({ status: 'ready', board: before })
          },
        )
        .finally(() => setPending((n) => n - 1))
    },
    [state, isBusy],
  )

  const openCard = state.status === 'ready' && openCardId ? findCard(state.board, openCardId) : undefined
  const openCardList =
    state.status === 'ready' && openCardId ? findListOfCard(state.board, openCardId) : undefined
  const deletingCard =
    state.status === 'ready' && deletingCardId ? findCard(state.board, deletingCardId) : undefined
  // リストも id で持っているので、盤面が差し替わっても常に最新の中身を見る
  const findList = (listId: string) => state.status === 'ready'
    ? state.board.lists.find((list) => list.id === listId)
    : undefined
  const openList = openListId ? findList(openListId) : undefined
  const deletingList = deletingListId ? findList(deletingListId) : undefined

  return (
    /**
     * 画面の高さに固定し、盤面に残りを渡す（F-25）。
     *
     * **ページ全体が縦にスクロールすると、ボード名もリスト名も一緒に流れて隠れる。**
     * 列が多いボードでは、どの列に入れようとしているかが分からなくなる。
     * スクロールする範囲を各列のタスク一覧だけに絞れば、見出しは常に見えたままになる。
     *
     * **列の高さを calc(100vh - 固定値) で決めない。** ヘッダーの余白を変えた瞬間に
     * 静かにずれるうえ、下のエラー表示と待機表示は**出入りする**ので、引くべき値が
     * そもそも一定でない。縦 flex にして残りを渡せば、説明の要る数字が残らない。
     *
     * dvh ではなく vh でよい。dvh はモバイルのブラウザ UI が伸び縮みする対策で、
     * スマートフォン対応は対象外（要件定義書 5.5）。
     */
    <div className="flex h-screen flex-col">
      {/* 以下 3 つは shrink-0。付けないと、空きが足りないときに一緒に縮む。
          縮んでよいのは盤面（main）だけ */}
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-5 py-3">
        <h1 className="m-0 text-lg font-bold">
          {state.status === 'ready' ? state.board.title : 'マイタスク'}
        </h1>

        {/* 編集モードの出入り口（F-24）。**ボード見出しの横に置く**（画面設計 1.2）。
            列ごとではなく盤面全体に効く操作なので、列の中には置けない。

            **読み込めていない間は出さない。** 並べ替える列がまだ無い。

            **同じボタンで出入りする。** 文言が入れ替わるので、いまどちらの状態かは
            ボタン自体が示す。押した後にどうなるかを書く（「編集する」→「終える」） */}
        {state.status === 'ready' && (
          <button
            type="button"
            onClick={() => setIsEditingLists((prev) => !prev)}
            // 押されている状態を支援技術へ伝える。見た目（枠と色）だけでは伝わらない
            aria-pressed={isEditingLists}
            className={`cursor-pointer rounded-card border px-2.5 py-1 ${
              isEditingLists
                ? 'border-primary bg-primary text-primary-ink hover:bg-[#094a8b]'
                : 'border-line bg-surface text-ink-sub hover:text-ink'
            }`}
          >
            {isEditingLists ? 'リストの編集を終える' : 'リストを編集する'}
          </button>
        )}

        {/* モードに入ったこと自体も伝える（F-24）。**ボタンの `aria-pressed` は
            そのボタンへ行かないと読めない**ので、盤面の作法が変わったことは別に伝える。
            role="alert" ではなく status にするのは、読み上げが操作を遮らないため */}
        {isEditingLists && (
          <p role="status" className="m-0 text-ink-sub">
            リストの編集中です。タスクの操作はできません。
          </p>
        )}
      </header>

      {actionError && (
        <div
          role="alert"
          className="mx-5 mt-4 flex shrink-0 items-start justify-between gap-3 rounded-card border border-danger bg-surface px-3 py-2"
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

      {/* エラーの role="alert" と違い status にする。読み上げが操作を遮らない。
          **名前を付けてあるのは、role="status" がこの画面に 2 つあるため。**
          もう 1 つは dnd-kit がドラッグの進行を読み上げるために置く領域（F-13）で、
          そちらには名前が無い。名前で区別できないと、待機表示だけを取り出せない */}
      {waitPhase !== 'idle' && (
        <div
          role="status"
          aria-label="通信の状態"
          className="mx-5 mt-4 flex shrink-0 items-center gap-2 rounded-card border border-line bg-surface px-3 py-2"
        >
          <span
            aria-hidden="true"
            // 動きを減らす設定の利用者には回さない。文言だけで意味は通る
            className="size-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-ink motion-reduce:animate-none"
          />
          <p className="m-0 text-ink-sub">
            {waitPhase === 'checking'
              ? 'データベースの接続をチェック中です…'
              : '更新しています…'}
          </p>
        </div>
      )}

      {/**
       * 可変の領域（F-25）。上の3つが取った残りを、この main が全部受け取る。
       *
       * **min-h-0 が要る。** flex の子は既定で min-height: auto となり中身より
       * 小さくならないため、これが無いと縮まずに画面からはみ出す。
       *
       * 3つの状態を1つに束ねているのは、**可変領域を1箇所にするため。** 並列に
       * 置くと、状態ごとに flex-1 を配ることになり、高さの出所が3つに増える
       */}
      <main className="min-h-0 flex-1">
        {state.status === 'loading' && (
          <p className="px-5 py-10 text-center text-ink-sub">読み込み中…</p>
        )}
        {state.status === 'error' && (
          <LoadError title={state.title} detail={state.detail} onRetry={load} />
        )}
        {state.status === 'ready' && (
        /**
         * 応答待ちの間は盤面を触れなくする（#43, #44）。
         *
         * ボタンごとに disabled を配らず inert でまとめて外すのは、クリックだけでなく
         * **キーボードのフォーカスと支援技術からも外れる**ため。変更も1箇所で済む。
         *
         * **App が持つモーダルはこの div の外に描いているので、ロックの対象にならない。**
         * それで困らないのは、どの操作もリクエストを投げる前にモーダルを閉じるため。
         *
         * **ただし ListColumn の `[+ タスク追加]` のモーダルは、この div の中にある**
         * （`fixed` でも DOM 上は子孫）。こちらも送信前に自分で閉じるので実害は無いが、
         * 「含まれていない」わけではない。
         *
         * 薄くするのは waitPhase が動いてから。ロックと同時に薄くすると、正常時
         * （10ms 前後）に一瞬だけ暗くなってチラつく
         */
          <div
            inert={isBusy}
            // h-full で、main から受け取った高さをそのまま盤面へ渡す（F-25）
            className={`h-full ${waitPhase === 'idle' ? '' : 'opacity-60'}`}
          >
            <BoardView
              board={state.board}
              isEditingLists={isEditingLists}
              onStartAddList={() => setIsAddingList(true)}
              onOpenList={setOpenListId}
              onMoveList={handleMoveList}
              onAddCard={handleAddCard}
              onOpenCard={setOpenCardId}
              onDeleteCard={setDeletingCardId}
              onBulkDeleteCards={setBulkDeletingCardIds}
              onMoveCard={handleMoveCard}
              onReorderLists={handleReorderLists}
              // 応答待ちの間は盤面が inert なので掴めないが、dnd-kit 側にも伝えておく
              isDragDisabled={isBusy}
            />
          </div>
        )}
      </main>

      {/* リストの追加（F-02）。**入口は編集モードの中**（機能仕様書 1.6）だが、
          モーダルそのものは他のモーダルと同じくここで出す。`Esc` の行き先を決めるのに
          開閉を知る必要があるため（isModalOpen 参照） */}
      {isAddingList && (
        <NameInputModal
          title="リストの追加"
          label="リスト名"
          maxLength={50}
          submitLabel="追加"
          onSubmit={(title) => {
            setIsAddingList(false)
            handleAddList(title)
          }}
          onCancel={() => setIsAddingList(false)}
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

      {openList && (
        <ListDetailModal
          list={openList}
          onSave={(title) => handleRenameList(openList.id, title)}
          onDelete={() => {
            // 確認へ進む前に詳細を閉じる。モーダルを2枚重ねない
            setOpenListId(null)
            setDeletingListId(openList.id)
          }}
          onCancel={() => setOpenListId(null)}
        />
      )}

      {deletingList && (
        <ConfirmModal
          title="削除の確認"
          lines={[
            `リスト「${deletingList.title}」を削除します。`,
            // 何が道連れになるかを数で見せる（画面設計 7章）
            deletingList.cards.length === 0
              ? '中にタスクはありません。'
              : `中のタスク${deletingList.cards.length}件も一緒に削除されます。`,
            'この操作は取り消せません。',
          ]}
          confirmLabel="削除する"
          onConfirm={() => handleDeleteList(deletingList.id)}
          onCancel={() => setDeletingListId(null)}
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

      {bulkDeletingCardIds && bulkDeletingCardIds.length > 0 && (
        <ConfirmModal
          title="削除の確認"
          // 個々のタスク名ではなく件数を出す（画面設計 7章）。名前を並べると、
          // 全件選択したときにモーダルが際限なく伸びる
          lines={[
            `選択した${bulkDeletingCardIds.length}件のタスクを削除します。`,
            'この操作は取り消せません。',
          ]}
          confirmLabel="削除する"
          onConfirm={() => handleBulkDeleteCards(bulkDeletingCardIds)}
          onCancel={() => setBulkDeletingCardIds(null)}
        />
      )}
    </div>
  )
}
