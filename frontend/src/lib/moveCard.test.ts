import { describe, expect, it } from 'vitest'
import type { Board, Card } from '../api/types'
import { toCardIdsForAppend, withMovedCard } from './moveCard'

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
