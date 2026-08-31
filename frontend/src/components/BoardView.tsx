import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { Fragment, useState } from 'react'
import type { Board } from '../api/types'
import {
  createCardKeyboardCoordinateGetter,
  createDropCollisionDetection,
  isSamePlace,
  resolveDropTarget,
  type DropTarget,
} from '../lib/dropTarget'
import {
  createListDropCollisionDetection,
  createListKeyboardCoordinateGetter,
  fromColumnDraggableId,
  isSameListPlace,
  movableListIds,
  resolveListDropIndex,
  toColumnDraggableId,
  withMovedList,
} from '../lib/listDropTarget'
import { InsertionLine } from './InsertionLine'
import { ListColumn } from './ListColumn'
import { TaskCardOverlay } from './TaskCard'

type Props = {
  board: Board
  /**
   * リストの編集モード（F-24）。**リストへの操作の入口を出すかどうかを決める。**
   *
   * モード中は逆に、タスクへの操作をすべて止める（機能仕様書 1.6）。
   */
  isEditingLists: boolean
  /** リストの追加モーダルを開く（F-02）。モーダル自体は App が出す */
  onStartAddList: () => void
  onOpenList: (listId: string) => void
  onMoveList: (listId: string, direction: -1 | 1) => void
  onAddCard: (listId: string, title: string) => void
  onOpenCard: (cardId: string) => void
  onDeleteCard: (cardId: string) => void
  onBulkDeleteCards: (cardIds: string[]) => void
  /** タスクを移動する（F-13）。toIndex は移動先リストの中での位置 */
  onMoveCard: (cardId: string, toListId: string, toIndex: number) => void
  /**
   * 列を並び替える（F-21）。**並べ終わった id を丸ごと渡す。**
   *
   * `[←] [→]`（F-05）と送り先は同じ `PATCH /api/lists/reorder`。入力手段が違うだけで、
   * 送るものは同じ（機能仕様書 1.6）。
   */
  onReorderLists: (listIds: string[]) => void
  /** 応答待ちの間はタスクを掴ませない */
  isDragDisabled: boolean
}

/**
 * 掴んでいる列の、ポインタに追従する本体（F-21）。
 *
 * **中のタスクまでは描かず、リスト名と件数だけにする。** 列をそのまま複製すると、
 * 運んでいる間ずっと画面の広い面積が塞がり、**落ち先の線が隠れる。** 何を掴んでいるかは
 * 名前で分かるので、それ以上は要らない。
 *
 * 幅は列と揃える。落ちたときの大きさと違うと、置ける場所を見誤る。
 */
function ColumnOverlay({ title, count }: { title: string; count: number }) {
  return (
    <div className="w-75 cursor-grabbing rounded-card bg-list-bg p-2.5 shadow-lg">
      <h2 className="m-0 truncate text-center text-sm/5 font-bold">{title}</h2>
      <p className="m-0 text-center text-ink-sub">タスク{count}件</p>
    </div>
  )
}

/**
 * ボードの本体。列を横に並べる（画面設計 1章）。
 *
 * 列が増えると横幅に収まらなくなるので、はみ出した分は横スクロールで見せる。
 * 列を縮めて詰め込むと 1 列あたりのタスクが読めなくなるため。
 *
 * **縦は自分ではスクロールしない（F-25）。** 縦を担うのは各列であって盤面ではない。
 * これは指定しないと成立しない。CSS では **overflow-x に auto を与えると、
 * overflow-y の visible が auto に格上げされる**ため、黙っていると盤面自身も縦の
 * スクロール領域になる。
 */
export function BoardView({
  board,
  isEditingLists,
  onStartAddList,
  onOpenList,
  onMoveList,
  onAddCard,
  onOpenCard,
  onDeleteCard,
  onBulkDeleteCards,
  onMoveCard,
  onReorderLists,
  isDragDisabled,
}: Props) {
  const lists = [...board.lists].sort((a, b) => a.position - b.position)

  /**
   * ドラッグの入力手段（F-13）。
   *
   * **PointerSensor に距離のしきい値を置く。** これが無いと、カードを押した時点で
   * ドラッグが始まり、タイトルのクリックで詳細を開く操作（F-07）と削除アイコン（F-08）が
   * 効かなくなる。5px 動かすまでは、ただのクリックとして扱う。
   *
   * **KeyboardSensor も入れる。** カードにフォーカスして Space で掴み、矢印で動かし、
   * もう一度 Space で置ける。ドラッグ&ドロップはマウスを専有する操作なので、
   * これが無いとキーボードだけの利用者には F-23（詳細モーダル）しか残らない。
   */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      /**
       * **掴む・置くは `Space` だけにする**（#95）。
       *
       * dnd-kit の既定では `Enter` も割り当たっているが、**`Enter` は詳細を開く操作
       * （F-07）に使う。** 以前はタイトルを `<button>` にして開いていたので衝突しなかったが、
       * カード全体で受けるようにした結果、同じキーの取り合いになった。
       *
       * `Escape` の取り消しは既定のまま。掴んでいる間の `Esc` は移動の取り消しで、
       * 編集モードから抜ける `Esc`（App）とはこの順で棲み分ける。
       */
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
      // **列を動かすときだけ、座標の求め方を差し替える**（F-21）。dnd-kit の既定は
      // 「次の受け口の矩形へ飛ばす」作りで、**中身なりの高さで形が揃わない列では
      // 縦方向の移動が混ざる**（listDropTarget.ts の createListKeyboardCoordinateGetter）
      coordinateGetter: isEditingLists
        ? createListKeyboardCoordinateGetter(board)
        : createCardKeyboardCoordinateGetter(board),
    }),
  )

  /**
   * 落ち先の求め方（F-13 / F-21）。**モードによって掴めるものが入れ替わる。**
   *
   * 編集モード中に掴めるのは列だけ（タスクの領域は inert）で、モード外に掴めるのは
   * タスクだけ（列は `disabled`）。**同時に両方が掴まれることはない**ので、
   * `DndContext` は 1 つのまま、判定だけを差し替える。
   *
   * どちらもポインタの座標で決める。**違うのは軸だけ**で、タスクはY、列はX。
   */
  const collisionDetection = isEditingLists
    ? createListDropCollisionDetection(board)
    : createDropCollisionDetection(board)

  /**
   * ドラッグ中のタスク（F-13）。ポインタに追従する本体を描くために持つ。
   *
   * 「完了」列に在るかどうかも一緒に控える。カードの色分けは列で決まる（機能仕様書 2.7）
   * ので、これが無いと浮かせた本体だけ色が変わる。
   */
  const [dragging, setDragging] = useState<{ cardId: string; isDone: boolean } | null>(null)

  const draggingCard = dragging
    ? lists.flatMap((list) => list.cards).find((card) => card.id === dragging.cardId)
    : undefined

  /**
   * いま落ちる位置（F-13）。**線を引くために持つ。**
   *
   * `over` から毎回引き直すのではなく状態に控えるのは、**線を引くのが列（ListColumn）
   * だから。** dnd-kit の `over` は `DndContext` の中でしか読めない。
   *
   * **dnd-kit が決めた落ち先から作る。** ポインタのY座標から線の位置を直接計算すると、
   * キーボードで掴んで矢印で動かしているときに線が出ない（ポインタが存在しないため）。
   */
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)

  /**
   * 掴んでいる列（F-21）。タスクと同じく、追従する本体を描くために持つ。
   *
   * **タスクとは別に持つ。** 掴めるのはどちらか一方だけだが、1つにまとめると
   * 「いま入っているのはどちらか」を毎回確かめることになる。
   */
  const [draggingListId, setDraggingListId] = useState<string | null>(null)
  const draggingList = draggingListId ? lists.find((list) => list.id === draggingListId) : undefined

  /** いま列が落ちる位置（F-21）。**掴んでいる列を除いた、動かせる列の並びでの添字** */
  const [listDropIndex, setListDropIndex] = useState<number | null>(null)

  const handleDragStart = (event: DragStartEvent) => {
    const activeId = String(event.active.id)

    const listId = fromColumnDraggableId(activeId)
    if (listId !== null) {
      setDraggingListId(listId)
      return
    }

    const list = lists.find((l) => l.cards.some((card) => card.id === activeId))
    if (list) setDragging({ cardId: activeId, isDone: list.is_fixed_last })
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    const activeId = String(active.id)

    const listId = fromColumnDraggableId(activeId)
    if (listId !== null) {
      setListDropIndex(over ? resolveListDropIndex(board, String(over.id), listId) : null)
      return
    }

    setDropTarget(over ? resolveDropTarget(board, String(over.id), activeId) : null)
  }

  const clearDrag = () => {
    setDragging(null)
    setDropTarget(null)
    setDraggingListId(null)
    setListDropIndex(null)
  }

  /**
   * 落とされたときに移動を確定する。
   *
   * 同じ列の中でも、列をまたいでも通り道は同じ。**移動先と位置を求める役は
   * `resolveDropTarget` が持ち、ここはその結果を渡すだけ**にしてある。
   * 「完了」列も他の列と区別しないので、入れることも差し戻すこともできる（UC-03）。
   *
   * `over` が null になるのは、ドロップを受け付ける範囲の外で指を離した場合。
   * このときは移動しない（画面設計 3章）。
   */
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    clearDrag()
    if (!over) return

    // 列を落とした場合（F-21）。**求める役は listDropTarget.ts が持ち、ここは
    // 並べ終わった id を渡すだけ**にしてある。タスクのときと同じ形
    const listId = fromColumnDraggableId(String(active.id))
    if (listId !== null) {
      const index = resolveListDropIndex(board, String(over.id), listId)
      if (index === null || isSameListPlace(board, listId, index)) return

      onReorderLists(withMovedList(board, listId, index))
      return
    }

    const cardId = String(active.id)
    const target = resolveDropTarget(board, String(over.id), cardId)
    if (!target || isSamePlace(board, cardId, target)) return

    onMoveCard(cardId, target.listId, target.index)
  }

  /**
   * ホバーでの完了操作（F-22）。**「完了」列の先頭へ移す。**
   *
   * 先頭にするのは F-06（追加したタスクは列の先頭に入る）と揃えるため。完了列が長くても、
   * スクロールせずに「いま完了にしたもの」が見える。
   *
   * **移動そのものは F-13 と同じ `onMoveCard` に流す。** 行き先が1つに決まっている
   * ぶん近道になっているだけで、やっていることは同じ移動であり、送り先も同じ
   * `PATCH /api/cards/move`（api.md 2.1）。
   *
   * 完了列がどれかを知っているのは並びを持つここだけなので、列には渡さず解決してから渡す。
   */
  const handleCompleteCard = (cardId: string) => {
    const done = lists.find((list) => list.is_fixed_last)
    if (!done) return

    onMoveCard(cardId, done.id, 0)
  }

  /**
   * 縦の線をどの列の手前に引くか（F-21）。末尾に引く場合は null。
   *
   * `listDropIndex` は**掴んでいる列を除いた並び**で数えられているので、同じ並びから
   * 引く。ListColumn がカードに対してやっていることと同じ。
   */
  const beforeListId =
    listDropIndex === null
      ? null
      : (movableListIds(board).filter((id) => id !== draggingListId)[listDropIndex] ?? null)

  // 末尾（完了列の手前）に引くのは、落ち先が決まっていて、手前に引く相手がいないとき
  const showLineAtListEnd = listDropIndex !== null && beforeListId === null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      // 範囲の外で離した場合も、浮かせた本体と線は片付ける（画面設計 3章）
      onDragCancel={clearDrag}
      // **ドラッグ中の自動スクロールは持たない**（画面設計 3章）。落としたい位置が
      // 見えていない場合は、掴む前にその列をスクロールしておく（F-25）。
      // 既定では有効なので、明示的に切らないと文書と実装が食い違う
      autoScroll={false}
    >
      {/* items-start は残す。列を中身なりの高さに保つため（ListColumn の max-h-full 参照） */}
      <div className="flex h-full items-start gap-3 overflow-x-auto overflow-y-hidden px-5 pb-8 pt-4">
      {/* 列の並び替えの範囲（F-21）。**items は表示順の id**。ここも ListColumn の
          カードと同じで、**実際に担っているのはキーボード操作の移動先計算と id の管理だけ**
          （ブラッシュアップ案 C-2）。落ち先は線で示し、他の列は動かさないので、
          `horizontalListSortingStrategy` の「ずらす計算」は使われない。

          **完了列も items に入れる。** 掴めはしない（ListColumn 側で `disabled`）が、
          除くと並びに穴が空き、キーボードでの移動先計算がずれる */}
      <SortableContext
        items={lists.map((list) => toColumnDraggableId(list.id))}
        strategy={horizontalListSortingStrategy}
      >
      {lists.map((list, index) => (
        <Fragment key={list.id}>
          {/* 落ち先の縦線（F-21）。**動かせる列の並びで数えた位置に引く。**
              掴んでいる列は場所だけ残して透明なので、その列を除いた並びで数える */}
          {listDropIndex !== null && beforeListId === list.id && (
            <InsertionLine orientation="vertical" />
          )}

          {/* 末尾（＝完了列の手前）に落ちる場合の線。完了列より右へは行けないので、
              動かせる列の末尾はここになる */}
          {list.is_fixed_last && showLineAtListEnd && <InsertionLine orientation="vertical" />}

        <ListColumn
          list={list}
          // 動かせるかは並びを知っているここで判断する（F-05）。列は自分の位置を知らない。
          //
          // 右へ動かせるのは「隣が完了列でないとき」だけ。完了列は常に最右なので、
          // その手前の列は右へ行けない。**サーバーも 409 で断る**が、押す前に分かる方がよい
          canMoveLeft={index > 0}
          canMoveRight={index < lists.length - 1 && !lists[index + 1].is_fixed_last}
          isEditingLists={isEditingLists}
          onOpenList={onOpenList}
          onMoveList={onMoveList}
          onAddCard={onAddCard}
          onOpenCard={onOpenCard}
          onDeleteCard={onDeleteCard}
          onBulkDeleteCards={onBulkDeleteCards}
          onCompleteCard={handleCompleteCard}
          // 編集モード中はタスクを掴ませない（F-24）。列の inert でも触れなくなるが、
          // dnd-kit 側にも伝えておく（応答待ちのときと同じ扱い）
          isDragDisabled={isDragDisabled || isEditingLists}
          draggingCardId={dragging?.cardId ?? null}
          // 運んでいる間は、どのカードの詳細も開かせない（#97）。キーボードで掴んで
          // いるときはポインタが自由に動くので、掴んだカード以外を押せてしまう
          isDragActive={dragging !== null || draggingListId !== null}
          // 線を出すのは落ち先の列だけ。他の列には出さない
          dropIndex={dropTarget?.listId === list.id ? dropTarget.index : null}
        />
        </Fragment>
      ))}
      </SortableContext>

      {/* 列の右端に置く（F-02）。画面設計 1章の図では盤面の下だが、列は横スクロール
          するので、下に置くとスクロール位置によって列との関係が読めなくなる。
          点線にしている理由は [+ タスク追加] と同じ。

          **出すのは編集モード中だけ**（画面設計 1.2）。ここだけモード外に残すと、
          「リストへの操作はモードの中」という原則に例外が1つできる。列と同じ 300px を
          常時使ってもいる。**デフォルトの3列は必ず在る**ので、行き止まりにはならない */}
      {isEditingLists && (
        <button
          type="button"
          onClick={onStartAddList}
          // 列を運んでいる最中は押せない（#97）。移動の途中に別の更新を挟ませない
          disabled={draggingListId !== null}
          // 幅は列に合わせる（ListColumn の w-75 と同じ値にすること）
          className="w-75 shrink-0 cursor-pointer rounded-card border border-dashed border-ink-sub bg-list-bg px-2 py-2 text-left text-ink-sub hover:text-ink disabled:cursor-default disabled:opacity-40 disabled:hover:text-ink-sub"
        >
          ＋ リスト追加
        </button>
      )}
      </div>

      {/* ポインタに追従する本体（画面設計 3章）。**盤面の外側に描かれる**ので、
          列のスクロール領域に切り取られず、列をまたいで運べる。**列を掴んだときも同じ**で、
          盤面は横スクロールするため、内側に描くと端で切り取られる */}
      <DragOverlay>
        {draggingList ? (
          <ColumnOverlay title={draggingList.title} count={draggingList.cards.length} />
        ) : draggingCard && dragging ? (
          <TaskCardOverlay card={draggingCard} isDone={dragging.isDone} />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
