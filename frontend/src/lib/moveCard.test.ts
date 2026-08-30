import { describe, expect, it } from 'vitest'
import type { Board, Card } from '../api/types'
import {
  toCardIdsForAppend,
  toCardIdsForInsert,
  withMovedCard,
  withReorderedCard,
} from './moveCard'

const card = (id: string, position: number): Card => ({
  id,
  title: id,
  description: '',
  due_at: null,
  has_due_time: false,
  position,
})

const board: Board = {
  id: 'board',
  title: 'マイタスク',
  lists: [
    {
      id: 'todo',
      title: 'TODO',
      is_default: true,
      is_fixed_last: false,
      position: 0,
      cards: [card('a', 0), card('b', 1)],
    },
    {
      id: 'doing',
      title: '進行中',
      is_default: true,
      is_fixed_last: false,
      position: 1,
      cards: [card('c', 0)],
    },
    {
      id: 'done',
      title: '完了',
      is_default: true,
      is_fixed_last: true,
      position: 2,
      cards: [],
    },
  ],
}

describe('toCardIdsForAppend', () => {
  it('移動先の既存の並びの末尾に足す', () => {
    expect(toCardIdsForAppend(board, 'a', 'doing')).toEqual(['c', 'a'])
  })

  it('空のリストへ移すときは移動するタスクだけになる', () => {
    expect(toCardIdsForAppend(board, 'a', 'done')).toEqual(['a'])
  })

  it('既に移動先にいるタスクは二重に入れない', () => {
    // 二重に入れるとサーバーに CARD_IDS_MISMATCH で弾かれる
    expect(toCardIdsForAppend(board, 'a', 'todo')).toEqual(['a', 'b'])
  })

  it('position の昇順で並べる。配列の添字がそのまま position になるため', () => {
    const shuffled: Board = {
      ...board,
      lists: board.lists.map((list) =>
        list.id === 'doing' ? { ...list, cards: [card('y', 1), card('x', 0)] } : list,
      ),
    }
    expect(toCardIdsForAppend(shuffled, 'a', 'doing')).toEqual(['x', 'y', 'a'])
  })
})

/** 同じ列の中での並び替え（F-13）を見るには 3 件要る。2 件だと「間に挿す」が作れない */
const threeInTodo: Board = {
  ...board,
  lists: board.lists.map((list) =>
    list.id === 'todo'
      ? { ...list, cards: [card('a', 0), card('b', 1), card('c2', 2)] }
      : list,
  ),
}

describe('toCardIdsForInsert', () => {
  it('同じ列の中で、指定した位置へ動かす', () => {
    expect(toCardIdsForInsert(threeInTodo, 'a', 'todo', 1)).toEqual(['b', 'a', 'c2'])
  })

  it('同じ列で後ろへ動かすとき、掴んだタスクを抜いたあとの位置で数える', () => {
    // dnd-kit が返す添字をそのまま渡せるようにするための約束。抜かずに数えると
    // 「末尾へ落としたのに 1 つ手前に入る」というずれ方をする
    expect(toCardIdsForInsert(threeInTodo, 'a', 'todo', 2)).toEqual(['b', 'c2', 'a'])
  })

  it('同じ列のタスクを二重に入れない', () => {
    // 抜かずに挿すとサーバーに CARD_IDS_MISMATCH で弾かれる
    expect(toCardIdsForInsert(threeInTodo, 'a', 'todo', 0)).toEqual(['a', 'b', 'c2'])
  })

  it('別の列の指定した位置へ入れる', () => {
    expect(toCardIdsForInsert(board, 'a', 'doing', 0)).toEqual(['a', 'c'])
  })

  it('空の列へ入れると、そのタスクだけになる', () => {
    expect(toCardIdsForInsert(board, 'a', 'done', 0)).toEqual(['a'])
  })

  it('範囲を超えた添字を受け取っても並びを壊さない', () => {
    // 負の添字は splice が「末尾から数える」と解釈するので、切っておかないと意図しない位置に入る
    expect(toCardIdsForInsert(threeInTodo, 'a', 'todo', -1)).toEqual(['a', 'b', 'c2'])
    expect(toCardIdsForInsert(threeInTodo, 'a', 'todo', 99)).toEqual(['b', 'c2', 'a'])
  })

  it('position の昇順で並べる。配列の添字がそのまま position になるため', () => {
    const shuffled: Board = {
      ...board,
      lists: board.lists.map((list) =>
        list.id === 'doing' ? { ...list, cards: [card('y', 1), card('x', 0)] } : list,
      ),
    }
    expect(toCardIdsForInsert(shuffled, 'a', 'doing', 1)).toEqual(['x', 'a', 'y'])
  })
})

describe('withReorderedCard', () => {
  it('同じ列の中で並び替える', () => {
    const moved = withReorderedCard(threeInTodo, 'a', 'todo', 2)

    expect(moved.lists[0].cards.map((c) => c.id)).toEqual(['b', 'c2', 'a'])
  })

  it('移動先の position を 0 から振り直す', () => {
    // 間に割り込む場合、既存のタスクとの間に置ける整数が無いことがある。
    // 「誰よりも大きい値を 1 つ置く」（withMovedCard）では表現できない
    const moved = withReorderedCard(threeInTodo, 'c2', 'todo', 1)

    expect(moved.lists[0].cards.map((c) => c.position)).toEqual([0, 1, 2])
    expect(moved.lists[0].cards.map((c) => c.id)).toEqual(['a', 'c2', 'b'])
  })

  it('別の列の指定した位置へ動かすと、移動元から消える', () => {
    const moved = withReorderedCard(board, 'a', 'doing', 0)

    expect(moved.lists[0].cards.map((c) => c.id)).toEqual(['b'])
    expect(moved.lists[1].cards.map((c) => c.id)).toEqual(['a', 'c'])
  })

  it('タスクの中身は移動しても失われない', () => {
    const moved = withReorderedCard(board, 'a', 'doing', 0)

    expect(moved.lists[1].cards[0].title).toBe('a')
  })

  it('元の board は変更しない', () => {
    withReorderedCard(threeInTodo, 'a', 'todo', 2)

    expect(threeInTodo.lists[0].cards.map((c) => c.id)).toEqual(['a', 'b', 'c2'])
  })

  it('知らないタスクを渡されたら何もしない', () => {
    expect(withReorderedCard(board, 'unknown', 'doing', 0)).toBe(board)
  })
})

describe('withMovedCard', () => {
  it('移動元から消えて移動先の末尾に付く', () => {
    const moved = withMovedCard(board, card('a', 0), 'doing')

    expect(moved.lists[0].cards.map((c) => c.id)).toEqual(['b'])
    expect(moved.lists[1].cards.map((c) => c.id)).toEqual(['c', 'a'])
  })

  it('移動してきたタスクにはその列の誰よりも大きい position を置く', () => {
    // 並び順は position の昇順で決まるので、末尾に来ることだけを表現できればよい。
    // 正しい連番は応答で入るため、サーバーと同じ採番を再現しない
    const moved = withMovedCard(board, card('a', 0), 'doing')
    const doing = moved.lists[1].cards

    expect(doing[doing.length - 1].id).toBe('a')
    expect(doing[doing.length - 1].position).toBeGreaterThan(doing[0].position)
  })

  it('元の board は変更しない', () => {
    withMovedCard(board, card('a', 0), 'doing')

    expect(board.lists[0].cards.map((c) => c.id)).toEqual(['a', 'b'])
    expect(board.lists[1].cards.map((c) => c.id)).toEqual(['c'])
  })
})
