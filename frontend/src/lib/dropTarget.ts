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

/** 落ちる先。`index` は移動先リストの中で何番目に入るか */
export type DropTarget = {
  listId: string
  index: number
}

/**
 * dnd-kit が返す `over` の id から、落ちる先を求める（F-13）。
 *
 * 重なった相手は 2 種類ある。
 *
 * - **タスク**（そのタスクの位置に入る）
 * - **列そのもの**（末尾に入る）。タスクが 0 件の列に落とせるのはこの経路。
 *   件数があっても、カードの無い余白に重なればこちらになる
 *
 * **同じ列の中で動かす場合も、重なったタスクが「いま」何番目かをそのまま返す。**
 * 掴んだタスクを抜いたぶんのずれを足し引きしないのは、`toCardIdsForInsert` が
 * 「抜いてから挿す」手順で dnd-kit の `arrayMove` と同じ数え方に揃えてあるため。
 *
 * 落ちる先が決まらない場合は null を返す。呼び出し側は移動しない。
 */
export function resolveDropTarget(board: Board, overId: string): DropTarget | null {
  if (overId.startsWith(LIST_PREFIX)) {
    const listId = overId.slice(LIST_PREFIX.length)
    const list = board.lists.find((l) => l.id === listId)
    return list ? { listId, index: list.cards.length } : null
  }

  const list = board.lists.find((l) => l.cards.some((card) => card.id === overId))
  if (!list) return null

  const ordered = [...list.cards].sort((a, b) => a.position - b.position)
  return { listId: list.id, index: ordered.findIndex((card) => card.id === overId) }
}

/**
 * その移動が盤面を変えるかどうか。
 *
 * 同じ列の同じ位置へ落としただけなら送らない。**送っても結果は同じだが、失敗しうる
 * 通信を 1 本増やし、その間ずっと盤面を触れなくする**ことになる。
 */
export function isSamePlace(board: Board, cardId: string, target: DropTarget): boolean {
  const list = board.lists.find((l) => l.cards.some((card) => card.id === cardId))
  if (!list || list.id !== target.listId) return false

  const ordered = [...list.cards].sort((a, b) => a.position - b.position)
  return ordered.findIndex((card) => card.id === cardId) === target.index
}
