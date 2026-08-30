import { describe, expect, it } from 'vitest'
import type { Board, Card } from '../api/types'
import { isSamePlace, resolveDropTarget, toListDroppableId } from './dropTarget'

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
    { id: 'done', title: '完了', is_default: true, is_fixed_last: true, position: 2, cards: [] },
  ],
}

describe('toListDroppableId', () => {
  it('タスクの id と衝突しない形にする', () => {
    // タスクの id は UUID でコロンを含まないので、接頭辞だけで区別できる
    expect(toListDroppableId('todo')).toBe('list:todo')
  })
})

describe('resolveDropTarget', () => {
  it('タスクに重なったら、そのタスクの位置に入る', () => {
    expect(resolveDropTarget(board, 'b')).toEqual({ listId: 'todo', index: 1 })
  })

  it('列そのものに重なったら末尾に入る', () => {
    expect(resolveDropTarget(board, toListDroppableId('todo'))).toEqual({
      listId: 'todo',
      index: 2,
    })
  })

  it('タスクが0件の列にも落とせる', () => {
    // カードが1枚も無い列は、列そのものを受け口にしないと重なる相手が存在しない
    expect(resolveDropTarget(board, toListDroppableId('done'))).toEqual({
      listId: 'done',
      index: 0,
    })
  })

  it('位置は position の昇順で数える', () => {
    const shuffled: Board = {
      ...board,
      lists: board.lists.map((list) =>
        list.id === 'doing' ? { ...list, cards: [card('y', 1), card('x', 0)] } : list,
      ),
    }
    expect(resolveDropTarget(shuffled, 'y')).toEqual({ listId: 'doing', index: 1 })
  })

  it('知らない id なら落ちる先が決まらない', () => {
    expect(resolveDropTarget(board, 'unknown')).toBeNull()
    expect(resolveDropTarget(board, toListDroppableId('unknown'))).toBeNull()
  })
})

describe('isSamePlace', () => {
  it('同じ列の同じ位置なら true', () => {
    expect(isSamePlace(board, 'a', { listId: 'todo', index: 0 })).toBe(true)
  })

  it('同じ列でも位置が違えば false', () => {
    expect(isSamePlace(board, 'a', { listId: 'todo', index: 1 })).toBe(false)
  })

  it('別の列なら false', () => {
    expect(isSamePlace(board, 'a', { listId: 'doing', index: 0 })).toBe(false)
  })
})
