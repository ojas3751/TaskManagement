import { describe, expect, it } from 'vitest'
import type { Board, Card } from '../api/types'
import {
  isSamePlace,
  orderedIdsWithout,
  resolveDropTarget,
  toListDroppableId,
} from './dropTarget'

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
  it('タスクに重なったら、そのタスクの手前に入る', () => {
    // 別の列から運んできた場合。todo の並び ['a','b'] の 'b' の手前 = 1
    expect(resolveDropTarget(board, 'b', 'c')).toEqual({ listId: 'todo', index: 1 })
  })

  it('位置は掴んでいるタスクを除いた並びで数える', () => {
    // 'a' を掴んで 'b' の手前へ。'a' を抜いた並びは ['b'] なので 0 になる。
    // 抜かずに数えると 1 になり、toCardIdsForInsert が抜いてから挿すぶん 1 つずれる
    expect(resolveDropTarget(board, 'b', 'a')).toEqual({ listId: 'todo', index: 0 })
  })

  it('列そのものに重なったら末尾に入る', () => {
    expect(resolveDropTarget(board, toListDroppableId('todo'), 'c')).toEqual({
      listId: 'todo',
      index: 2,
    })
  })

  it('末尾も掴んでいるタスクを除いて数える', () => {
    expect(resolveDropTarget(board, toListDroppableId('todo'), 'a')).toEqual({
      listId: 'todo',
      index: 1,
    })
  })

  it('タスクが0件の列にも落とせる', () => {
    // カードが1枚も無い列は、列そのものを受け口にしないと重なる相手が存在しない
    expect(resolveDropTarget(board, toListDroppableId('done'), 'a')).toEqual({
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
    expect(resolveDropTarget(shuffled, 'y', 'a')).toEqual({ listId: 'doing', index: 1 })
  })

  it('知らない id なら落ちる先が決まらない', () => {
    expect(resolveDropTarget(board, 'unknown', 'a')).toBeNull()
    expect(resolveDropTarget(board, toListDroppableId('unknown'), 'a')).toBeNull()
  })
})

describe('isSamePlace', () => {
  it('並びが変わらないなら true', () => {
    expect(isSamePlace(board, 'a', { listId: 'todo', index: 0 })).toBe(true)
    expect(isSamePlace(board, 'b', { listId: 'todo', index: 1 })).toBe(true)
  })

  it('並びが変わるなら false', () => {
    expect(isSamePlace(board, 'a', { listId: 'todo', index: 1 })).toBe(false)
  })

  it('別の列なら false', () => {
    expect(isSamePlace(board, 'a', { listId: 'doing', index: 0 })).toBe(false)
  })
})

describe('orderedIdsWithout', () => {
  it('掴んでいるタスクを除き、position の昇順で返す', () => {
    expect(orderedIdsWithout(board, 'todo', 'a')).toEqual(['b'])
  })

  it('掴んでいるタスクが別の列にいるなら、そのまま全部返す', () => {
    expect(orderedIdsWithout(board, 'todo', 'c')).toEqual(['a', 'b'])
  })

  it('知らない列なら空', () => {
    expect(orderedIdsWithout(board, 'unknown', 'a')).toEqual([])
  })
})
