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
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useState } from 'react'
import type { Board } from '../api/types'
import {
  createDropCollisionDetection,
  isSamePlace,
  resolveDropTarget,
  type DropTarget,
} from '../lib/dropTarget'
import { ListColumn } from './ListColumn'
import { NameInputModal } from './NameInputModal'
import { TaskCardOverlay } from './TaskCard'

type Props = {
  board: Board
  onAddList: (title: string) => void
  onOpenList: (listId: string) => void
  onMoveList: (listId: string, direction: -1 | 1) => void
  onAddCard: (listId: string, title: string) => void
  onOpenCard: (cardId: string) => void
  onDeleteCard: (cardId: string) => void
  onBulkDeleteCards: (cardIds: string[]) => void
  /** タスクを移動する（F-13）。toIndex は移動先リストの中での位置 */
  onMoveCard: (cardId: string, toListId: string, toIndex: number) => void
  /** 応答待ちの間はタスクを掴ませない */
  isDragDisabled: boolean
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
  onAddList,
  onOpenList,
  onMoveList,
  onAddCard,
  onOpenCard,
  onDeleteCard,
  onBulkDeleteCards,
  onMoveCard,
  isDragDisabled,
}: Props) {
  // 開閉はこの画面だけの状態なのでここで持つ（ListColumn の [+ タスク追加] と同じ）
  const [isAdding, setIsAdding] = useState(false)

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
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // 落ち先の求め方は dropTarget.ts に置く（ポインタのY座標で決める）
  const collisionDetection = createDropCollisionDetection(board)

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

  const handleDragStart = (event: DragStartEvent) => {
    const cardId = String(event.active.id)
    const list = lists.find((l) => l.cards.some((card) => card.id === cardId))
    if (list) setDragging({ cardId, isDone: list.is_fixed_last })
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    setDropTarget(over ? resolveDropTarget(board, String(over.id), String(active.id)) : null)
  }

  const clearDrag = () => {
    setDragging(null)
    setDropTarget(null)
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

    const cardId = String(active.id)
    const target = resolveDropTarget(board, String(over.id), cardId)
    if (!target || isSamePlace(board, cardId, target)) return

    onMoveCard(cardId, target.listId, target.index)
  }

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
      {lists.map((list, index) => (
        <ListColumn
          key={list.id}
          list={list}
          // 動かせるかは並びを知っているここで判断する（F-05）。列は自分の位置を知らない。
          //
          // 右へ動かせるのは「隣が完了列でないとき」だけ。完了列は常に最右なので、
          // その手前の列は右へ行けない。**サーバーも 409 で断る**が、押す前に分かる方がよい
          canMoveLeft={index > 0}
          canMoveRight={index < lists.length - 1 && !lists[index + 1].is_fixed_last}
          onOpenList={onOpenList}
          onMoveList={onMoveList}
          onAddCard={onAddCard}
          onOpenCard={onOpenCard}
          onDeleteCard={onDeleteCard}
          onBulkDeleteCards={onBulkDeleteCards}
          isDragDisabled={isDragDisabled}
          draggingCardId={dragging?.cardId ?? null}
          // 線を出すのは落ち先の列だけ。他の列には出さない
          dropIndex={dropTarget?.listId === list.id ? dropTarget.index : null}
        />
      ))}

      {/* 列の右端に置く（F-02）。画面設計 1章の図では盤面の下だが、列は横スクロール
          するので、下に置くとスクロール位置によって列との関係が読めなくなる。
          点線にしている理由は [+ タスク追加] と同じ */}
      <button
        type="button"
        onClick={() => setIsAdding(true)}
        // 幅は列に合わせる（ListColumn の w-75 と同じ値にすること）
        className="w-75 shrink-0 cursor-pointer rounded-card border border-dashed border-ink-sub bg-list-bg px-2 py-2 text-left text-ink-sub hover:text-ink"
      >
        ＋ リスト追加
      </button>

      {isAdding && (
        <NameInputModal
          title="リストの追加"
          label="リスト名"
          maxLength={50}
          submitLabel="追加"
          onSubmit={(title) => {
            setIsAdding(false)
            onAddList(title)
          }}
          onCancel={() => setIsAdding(false)}
        />
      )}
      </div>

      {/* ポインタに追従する本体（画面設計 3章）。**盤面の外側に描かれる**ので、
          列のスクロール領域に切り取られず、列をまたいで運べる */}
      <DragOverlay>
        {draggingCard && dragging ? (
          <TaskCardOverlay card={draggingCard} isDone={dragging.isDone} />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
