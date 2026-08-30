import { closestCorners, type CollisionDetection } from '@dnd-kit/core'
import type { Board } from '../api/types'

/**
 * 列そのものをドロップの受け口として登録するときの id（F-13）。
 *
 * **タスクの id と衝突しない形にする必要がある。** dnd-kit は受け口を id で区別するので、
 * 列とタスクが同じ名前空間に並ぶ。列の id をそのまま使うと、`over` に返ってきた id が
 * 「列」なのか「タスク」なのか判別できない。
 *
 * タスクの id は UUID（データベース設計）でコロンを含まないため、接頭辞で分けられる。
 */
const LIST_PREFIX = 'list:'

export function toListDroppableId(listId: string): string {
  return `${LIST_PREFIX}${listId}`
}

export function isListDroppableId(id: string): boolean {
  return id.startsWith(LIST_PREFIX)
}

/** 列の受け口の id から列の id を取り出す。列の受け口でなければ null */
export function fromListDroppableId(id: string): string | null {
  return isListDroppableId(id) ? id.slice(LIST_PREFIX.length) : null
}

/** 落ちる先。`index` は移動先リストの中で何番目に入るか */
export type DropTarget = {
  listId: string
  index: number
}

/** 掴んでいるタスクを除いた、その列の並び（position の昇順） */
export function orderedIdsWithout(board: Board, listId: string, draggingId: string): string[] {
  const list = board.lists.find((l) => l.id === listId)
  if (!list) return []

  return [...list.cards]
    .sort((a, b) => a.position - b.position)
    .map((card) => card.id)
    .filter((id) => id !== draggingId)
}

/**
 * dnd-kit が返す `over` の id から、落ちる先を求める（F-13）。
 *
 * 重なった相手は 2 種類ある。
 *
 * - **タスク**（**そのタスクの手前**に入る）
 * - **列そのもの**（末尾に入る）。タスクが 0 件の列に落とせるのはこの経路
 *
 * **位置は「掴んでいるタスクを除いた並び」で数える。** `toCardIdsForInsert` が
 * 抜いてから挿す手順なので、数え方を合わせないと同じ列の中で 1 つずれる。
 *
 * 落ちる先が決まらない場合は null を返す。呼び出し側は移動しない。
 */
export function resolveDropTarget(
  board: Board,
  overId: string,
  draggingId: string,
): DropTarget | null {
  const overListId = fromListDroppableId(overId)
  if (overListId !== null) {
    const list = board.lists.find((l) => l.id === overListId)
    return list
      ? { listId: overListId, index: orderedIdsWithout(board, overListId, draggingId).length }
      : null
  }

  const list = board.lists.find((l) => l.cards.some((card) => card.id === overId))
  if (!list) return null

  const index = orderedIdsWithout(board, list.id, draggingId).indexOf(overId)
  return index < 0 ? null : { listId: list.id, index }
}

/**
 * どこに落ちるかの判定（F-13）。
 *
 * **ポインタのY座標で決める。** 画面設計 3章の「ポインタのY座標が、どのタスクの
 * 前後に入るかを示す」がこれにあたる。中線より上ならそのタスクの手前、どのタスクの
 * 中線にも届かなければ末尾。
 *
 * **dnd-kit が持つ距離ベースの判定（closestCenter / closestCorners）は使えない。**
 * 受け口の重心や四隅との近さで選ぶため、
 *
 * - 列と列の間の余白にポインタがあっても、いちばん近い列が移動先になる（#76）
 * - カードとカードの隙間では、カードではなく列そのものが選ばれ、末尾へ飛ぶ
 *
 * **掴んでいるタスク自身は候補から外す。** 透明にして場所だけ残してあるので、
 * 外さないと自分自身が落ち先になる。空いた場所は隣のタスクの領域として扱われる。
 *
 * **キーボード操作のときだけ距離で決める。** 掴んで矢印で動かす操作にポインタは
 * 存在しないので、Y座標を問えない。
 */
export function createDropCollisionDetection(board: Board): CollisionDetection {
  return (args) => {
    const { active, droppableContainers, droppableRects, pointerCoordinates } = args
    if (!pointerCoordinates) return closestCorners(args)

    const pointer = pointerCoordinates

    // ポインタが載っている列。**どこにも載っていなければ何も返さない。**
    // そのまま離せば移動しない（画面設計 3章）
    const listContainer = droppableContainers.find((container) => {
      if (fromListDroppableId(String(container.id)) === null) return false
      const rect = droppableRects.get(container.id)
      if (!rect) return false
      return (
        pointer.x >= rect.left &&
        pointer.x <= rect.left + rect.width &&
        pointer.y >= rect.top &&
        pointer.y <= rect.top + rect.height
      )
    })
    if (!listContainer) return []

    const listId = fromListDroppableId(String(listContainer.id))
    if (listId === null) return []

    for (const id of orderedIdsWithout(board, listId, String(active.id))) {
      const rect = droppableRects.get(id)
      if (!rect) continue
      if (pointer.y < rect.top + rect.height / 2) return [{ id }]
    }

    return [{ id: listContainer.id }]
  }
}

/**
 * その移動が盤面を変えるかどうか。
 *
 * 同じ列の同じ位置へ落としただけなら送らない。**送っても結果は同じだが、失敗しうる
 * 通信を 1 本増やし、その間ずっと盤面を触れなくする**ことになる。
 *
 * 添字どうしを比べるのではなく、**移動後の並びが今と同じか**で見る。添字の比較は
 * 「抜く前に数えるか、抜いた後に数えるか」を取り違えると静かに間違うが、並びどうしなら
 * 数え方に依らない。
 */
export function isSamePlace(board: Board, cardId: string, target: DropTarget): boolean {
  const list = board.lists.find((l) => l.cards.some((card) => card.id === cardId))
  if (!list || list.id !== target.listId) return false

  const current = [...list.cards].sort((a, b) => a.position - b.position).map((card) => card.id)

  const others = orderedIdsWithout(board, target.listId, cardId)
  const next = [...others.slice(0, target.index), cardId, ...others.slice(target.index)]

  return current.length === next.length && current.every((id, i) => id === next[i])
}
