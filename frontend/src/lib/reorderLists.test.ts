import { describe, expect, it } from 'vitest'
import type { Board, TaskList } from '../api/types'
import { listIdsInOrder, withListOrder, withSwappedList } from './reorderLists'

const list = (id: string, position: number, isFixedLast = false): TaskList => ({
  id,
  title: id,
  is_default: false,
  is_fixed_last: isFixedLast,
  position,
  cards: [],
})

/** 並びは todo → doing → design → done。position は昇順に振ってある */
const board: Board = {
  id: 'board',
  title: 'マイタスク',
  lists: [list('todo', 0), list('doing', 1), list('design', 2), list('done', 3, true)],
}

describe('listIdsInOrder', () => {
  it('position の昇順で返す', () => {
    expect(listIdsInOrder(board)).toEqual(['todo', 'doing', 'design', 'done'])
  })

  it('配列の順序ではなく position で決まる', () => {
    // API は昇順で返す約束だが、そこに依存しないことを確かめる
    const shuffled: Board = { ...board, lists: [...board.lists].reverse() }

    expect(listIdsInOrder(shuffled)).toEqual(['todo', 'doing', 'design', 'done'])
  })
})

describe('withSwappedList', () => {
  it('左へ動かすと直前と入れ替わる', () => {
    expect(withSwappedList(board, 'design', -1)).toEqual(['todo', 'design', 'doing', 'done'])
  })

  it('右へ動かすと直後と入れ替わる', () => {
    expect(withSwappedList(board, 'todo', 1)).toEqual(['doing', 'todo', 'design', 'done'])
  })

  it('左端の列を左へ動かしても変わらない', () => {
    expect(withSwappedList(board, 'todo', -1)).toEqual(['todo', 'doing', 'design', 'done'])
  })

  it('末尾の列を右へ動かしても変わらない', () => {
    expect(withSwappedList(board, 'done', 1)).toEqual(['todo', 'doing', 'design', 'done'])
  })

  it('存在しない id では変わらない', () => {
    expect(withSwappedList(board, 'nowhere', 1)).toEqual(['todo', 'doing', 'design', 'done'])
  })

  it('完了列より右へ行けることは、ここでは止めない', () => {
    // 判断の正本はサーバー（409）で、画面はボタンを出さないことで表す。
    // ここに条件を足すと、片方だけ直したときに食い違う
    expect(withSwappedList(board, 'design', 1)).toEqual(['todo', 'doing', 'done', 'design'])
  })

  it('元の board は変更しない', () => {
    withSwappedList(board, 'todo', 1)

    expect(board.lists.map((l) => l.position)).toEqual([0, 1, 2, 3])
  })
})

describe('withListOrder', () => {
  it('受け取った並びのとおりに position を振り直す', () => {
    const next = withListOrder(board, ['doing', 'todo', 'design', 'done'])
    const sorted = [...next.lists].sort((a, b) => a.position - b.position)

    expect(sorted.map((l) => l.id)).toEqual(['doing', 'todo', 'design', 'done'])
    expect(sorted.map((l) => l.position)).toEqual([0, 1, 2, 3])
  })

  it('リストの中身は触らない', () => {
    const next = withListOrder(board, ['done', 'todo', 'doing', 'design'])

    expect(next.lists.map((l) => l.title).sort()).toEqual(['design', 'doing', 'done', 'todo'])
    expect(next.lists.find((l) => l.id === 'done')?.is_fixed_last).toBe(true)
  })

  it('並びに無いリストの position は変えない', () => {
    const next = withListOrder(board, ['doing', 'todo'])

    expect(next.lists.find((l) => l.id === 'design')?.position).toBe(2)
  })

  it('元の board は変更しない', () => {
    withListOrder(board, ['done', 'design', 'doing', 'todo'])

    expect(board.lists.map((l) => l.position)).toEqual([0, 1, 2, 3])
  })
})
