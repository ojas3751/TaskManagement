import { describe, expect, it } from 'vitest'
import type { Board, Card } from '../api/types'
import { withCards, withUpdatedCard, withoutCard } from './boardEdit'

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

describe('withCards', () => {
  it('指定したリストの cards だけ差し替える', () => {
    const next = withCards(board, 'todo', [card('z', 0)])

    expect(next.lists[0].cards.map((c) => c.id)).toEqual(['z'])
    expect(next.lists[1].cards.map((c) => c.id)).toEqual(['c'])
  })

  it('リストの他の項目は保つ', () => {
    const next = withCards(board, 'done', [card('z', 0)])

    expect(next.lists[2].title).toBe('完了')
    expect(next.lists[2].is_fixed_last).toBe(true)
  })

  it('存在しないリストを指定しても何も変わらない', () => {
    const next = withCards(board, 'nowhere', [card('z', 0)])

    expect(next.lists.map((l) => l.cards.map((c) => c.id))).toEqual([['a', 'b'], ['c'], []])
  })

  it('元の board は変更しない', () => {
    withCards(board, 'todo', [card('z', 0)])

    expect(board.lists[0].cards.map((c) => c.id)).toEqual(['a', 'b'])
  })
})

describe('withUpdatedCard', () => {
  it('どのリストにあっても該当のタスクを更新する', () => {
    const next = withUpdatedCard(board, 'c', {
      title: '書き換え',
      description: 'メモ',
      due_at: '2026-08-27',
      has_due_time: false,
    })

    expect(next.lists[1].cards[0].title).toBe('書き換え')
    expect(next.lists[1].cards[0].due_at).toBe('2026-08-27')
  })

  it('他のタスクには触らない', () => {
    const next = withUpdatedCard(board, 'a', {
      title: '書き換え',
      description: '',
      due_at: null,
      has_due_time: false,
    })

    expect(next.lists[0].cards[1].title).toBe('b')
    expect(next.lists[1].cards[0].title).toBe('c')
  })

  it('position は 4 項目に含まれないので保たれる', () => {
    const next = withUpdatedCard(board, 'b', {
      title: '書き換え',
      description: '',
      due_at: null,
      has_due_time: false,
    })

    expect(next.lists[0].cards[1].position).toBe(1)
  })

  it('存在しない id では何も変わらない', () => {
    const next = withUpdatedCard(board, 'nowhere', {
      title: '書き換え',
      description: '',
      due_at: null,
      has_due_time: false,
    })

    expect(next.lists.flatMap((l) => l.cards).map((c) => c.title)).toEqual(['a', 'b', 'c'])
  })

  it('元の board は変更しない', () => {
    withUpdatedCard(board, 'a', {
      title: '書き換え',
      description: '',
      due_at: null,
      has_due_time: false,
    })

    expect(board.lists[0].cards[0].title).toBe('a')
  })
})

describe('withoutCard', () => {
  it('どのリストにあっても該当のタスクを取り除く', () => {
    const next = withoutCard(board, 'c')

    expect(next.lists[1].cards).toEqual([])
    expect(next.lists[0].cards.map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('残ったタスクの position は詰め直さない', () => {
    // 並び順は position の昇順で決まるので、番号に穴が空いていても見た目は変わらない。
    // 正しい連番は応答で入る
    const next = withoutCard(board, 'a')

    expect(next.lists[0].cards.map((c) => c.position)).toEqual([1])
  })

  it('存在しない id では何も変わらない', () => {
    const next = withoutCard(board, 'nowhere')

    expect(next.lists.map((l) => l.cards.map((c) => c.id))).toEqual([['a', 'b'], ['c'], []])
  })

  it('元の board は変更しない', () => {
    withoutCard(board, 'a')

    expect(board.lists[0].cards.map((c) => c.id)).toEqual(['a', 'b'])
  })
})
