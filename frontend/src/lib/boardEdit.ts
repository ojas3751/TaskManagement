import type { Board, Card } from '../api/types'

/**
 * 詳細モーダルで編集できる項目のうち、PATCH /api/cards/{id} が受け取る 4 項目
 * （docs/design/api.md 3.7）。移動先のリストは別の API が担うのでここには含めない。
 */
export type CardEditFields = Pick<Card, 'title' | 'description' | 'due_at' | 'has_due_time'>

/** 1つのリストの cards を差し替えた新しい board を返す（元の board は変更しない） */
export function withCards(board: Board, listId: string, cards: Card[]): Board {
  return {
    ...board,
    lists: board.lists.map((list) => (list.id === listId ? { ...list, cards } : list)),
  }
}

/** 1枚のタスクの内容を差し替えた新しい board を返す（元の board は変更しない） */
export function withUpdatedCard(board: Board, cardId: string, input: CardEditFields): Board {
  return {
    ...board,
    lists: board.lists.map((list) => ({
      ...list,
      cards: list.cards.map((card) => (card.id === cardId ? { ...card, ...input } : card)),
    })),
  }
}

/**
 * 1枚のタスクを取り除いた新しい board を返す（元の board は変更しない）。
 *
 * 残ったタスクの position は詰め直さない。並び順は position の昇順で決まるので、
 * 番号に穴が空いていても見た目は変わらない。正しい連番は応答で入るため、ここで
 * 詰めるとサーバーと同じ採番を画面が持つことになる。
 *
 * どのリストにいるかは呼び出し側の関心事ではないので、全リストを見て取り除く。
 */
export function withoutCard(board: Board, cardId: string): Board {
  return {
    ...board,
    lists: board.lists.map((list) => ({
      ...list,
      cards: list.cards.filter((card) => card.id !== cardId),
    })),
  }
}
