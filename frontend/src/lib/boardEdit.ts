import type { Board, Card, TaskList } from '../api/types'

/**
 * 詳細モーダルで編集できる項目のうち、PATCH /api/cards/{id} が受け取る 4 項目
 * （docs/design/api.md 3.7）。移動先のリストは別の API が担うのでここには含めない。
 */
export type CardEditFields = Pick<Card, 'title' | 'description' | 'due_at' | 'has_due_time'>

/**
 * リストを「完了」列の左隣に足した新しい board を返す（元の board は変更しない）。
 *
 * サーバーの採番は再現しない。完了列の直前に並べば十分なので、**完了列より 0.5 だけ
 * 小さい値**を置く。サーバーの position は整数なので、これで「完了列の1つ手前」に
 * 確実に入る。正しい連番は応答で入る（withoutCard と同じ考え方）。
 *
 * 完了列と同じ値にしないのは、そのとき並びが配列の順序と並べ替えの安定性に依存して
 * しまうため。値だけで順序が決まる方が、どこから呼んでも同じ結果になる。
 *
 * 完了列が無い場合は末尾に置く。seed で必ず存在するので通常は起きないが、
 * 見つからないことを理由に追加そのものを失わせる方が困る。
 */
export function withList(board: Board, id: string, title: string): Board {
  const fixedLast = board.lists.find((list) => list.is_fixed_last)

  const newList: TaskList = {
    id,
    title,
    is_default: false,
    is_fixed_last: false,
    position: fixedLast ? fixedLast.position - 0.5 : board.lists.length,
    cards: [],
  }

  return { ...board, lists: [...board.lists, newList] }
}

/**
 * 1つのリストを取り除いた新しい board を返す（元の board は変更しない）。
 *
 * 残ったリストの position は詰め直さない（withoutCard と同じ理由）。
 */
export function withoutList(board: Board, listId: string): Board {
  return { ...board, lists: board.lists.filter((list) => list.id !== listId) }
}

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
