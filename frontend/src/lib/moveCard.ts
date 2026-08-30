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
 * 移動後の、移動先リストの並び順を組み立てる（位置を指定する版）。
 *
 * `toCardIdsForAppend` との違いは、**末尾に決め打ちせず添字を受け取る**ことだけ。
 * 送る配列の意味は同じで、添字がそのまま position になる。
 *
 * 同じリストの中で動かす場合、そのタスクは既に並びの中にいる。**先に抜いてから挿す**
 * 必要がある。抜かずに挿すと同じ id が 2 つ並び、サーバーに CARD_IDS_MISMATCH で弾かれる。
 *
 * `toIndex` は**抜いたあとの配列における位置**。掴んだタスクより後ろへ落としたときに
 * 1 つずれるのを呼び出し側で補正しなくて済むよう、dnd-kit が返す添字をそのまま渡せる形に
 * している（dnd-kit の `arrayMove` と同じ約束）。
 */
export function toCardIdsForInsert(
  board: Board,
  cardId: string,
  toListId: string,
  toIndex: number,
): string[] {
  const toList = board.lists.find((list) => list.id === toListId)
  if (!toList) return [cardId]

  const others = [...toList.cards]
    .sort((a, b) => a.position - b.position)
    .map((card) => card.id)
    .filter((id) => id !== cardId)

  // 範囲外の添字を受け取っても並びを壊さないよう、両端で止める。splice は負の値を
  // 「末尾から数える」と解釈するため、下限を 0 に切らないと意図しない位置に入る
  const index = Math.max(0, Math.min(toIndex, others.length))
  return [...others.slice(0, index), cardId, ...others.slice(index)]
}

/**
 * タスクを指定の位置へ動かした盤面を返す（元の board は変更しない）。画面へ先に反映するために使う。
 *
 * `withMovedCard`（末尾へ動かす版）と違い、**移動先の position を 0 から振り直す。**
 * 末尾へ足すだけなら「誰よりも大きい値」を 1 つ置けば済んだが、間に割り込む場合は
 * 既存のタスクとの間に空きが無く、置ける整数が無いことがあるため。
 *
 * ここで振り直した値は表示順を決めるためだけのもので、**正しい連番は応答で入る。**
 * サーバーと同じ結果になるのは、どちらも「配列の添字を position にする」という
 * 同じ約束（api.md 3.9）に従っているため。
 */
export function withReorderedCard(
  board: Board,
  cardId: string,
  toListId: string,
  toIndex: number,
): Board {
  const card = board.lists.flatMap((list) => list.cards).find((c) => c.id === cardId)
  if (!card) return board

  const orderedIds = toCardIdsForInsert(board, cardId, toListId, toIndex)

  return {
    ...board,
    lists: board.lists.map((list) => {
      if (list.id === toListId) {
        const byId = new Map(list.cards.map((c) => [c.id, c]))
        // 移動してきたタスクは移動元にいるので、この列の中からは引けない。別に渡す
        byId.set(cardId, card)
        return {
          ...list,
          cards: orderedIds.map((id, index) => ({ ...byId.get(id)!, position: index })),
        }
      }

      // 移動元。抜けた穴は詰めない。並び順は position の昇順で決まるので、
      // 連番に隙間があっても表示は変わらない（正しい連番は応答で入る）
      return { ...list, cards: list.cards.filter((c) => c.id !== cardId) }
    }),
  }
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
