import type { Board, Card } from '../api/types'

/**
 * 移動後の、移動先リストの並び順を組み立てる（docs/design/api.md 3.9）。
 *
 * サーバーはこの配列の添字をそのまま position にする。つまり**この配列が並び順そのもの**で、
 * 送る側が正しい顔ぶれを作る責任を負う。
 *
 * F-23 の移動先は末尾なので、移動先の既存の並びに移動するタスクを足すだけでよい。
 * 位置を選べるようになるのは Step 11（F-13）。
 *
 * 移動元と移動先が同じ場合は、既にその並びの中にいるので足さない。二重に入れると
 * サーバーに CARD_IDS_MISMATCH で弾かれる。
 */
export function toCardIdsForAppend(board: Board, cardId: string, toListId: string): string[] {
  const toList = board.lists.find((list) => list.id === toListId)
  if (!toList) return [cardId]

  const existing = [...toList.cards]
    .sort((a, b) => a.position - b.position)
    .map((card) => card.id)

  return existing.includes(cardId) ? existing : [...existing, cardId]
}

/**
 * タスクを別のリストの末尾へ動かした盤面を返す（元の board は変更しない）。
 *
 * 画面へ先に反映するために使う。position は振り直さない。並び順は position の昇順で
 * 決まるので、移動してきたタスクには**その列の誰よりも大きい値**を置けば末尾に並ぶ。
 * 正しい連番は応答で入るため、ここでサーバーと同じ採番を再現する必要はない。
 */
export function withMovedCard(board: Board, card: Card, toListId: string): Board {
  const toList = board.lists.find((list) => list.id === toListId)
  const lastPosition = toList?.cards.reduce((max, c) => Math.max(max, c.position), -1) ?? -1

  return {
    ...board,
    lists: board.lists.map((list) => {
      if (list.id === toListId) {
        // 同じリストを指定された場合に二重に並ばないよう、先に取り除いてから足す
        const others = list.cards.filter((c) => c.id !== card.id)
        return { ...list, cards: [...others, { ...card, position: lastPosition + 1 }] }
      }
      return { ...list, cards: list.cards.filter((c) => c.id !== card.id) }
    }),
  }
}
