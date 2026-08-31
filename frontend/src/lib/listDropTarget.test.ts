import { describe, expect, it } from 'vitest'
import type { Board, TaskList } from '../api/types'
import {
  fixedLastListId,
  fromColumnDraggableId,
  isSameListPlace,
  movableListIds,
  movableListIdsWithout,
  resolveListDropIndex,
  toColumnDraggableId,
  withMovedList,
} from './listDropTarget'

const list = (id: string, position: number, isFixedLast = false): TaskList => ({
  id,
  title: id,
  is_default: false,
  is_fixed_last: isFixedLast,
  position,
  cards: [],
})

/** 並びは todo → doing → design → done。done だけが動かせない */
const board: Board = {
  id: 'board',
  title: 'マイタスク',
  lists: [list('todo', 0), list('doing', 1), list('design', 2), list('done', 3, true)],
}

describe('列を掴む id', () => {
  it('列の id を包んで、取り出せる', () => {
    expect(fromColumnDraggableId(toColumnDraggableId('todo'))).toBe('todo')
  })

  it('列を掴む id でなければ null', () => {
    // タスクの id（UUID）や、タスクの落ち先である列の受け口と混ざらないこと
    expect(fromColumnDraggableId('list:todo')).toBeNull()
    expect(fromColumnDraggableId('9f1c0f0e-0000-4000-8000-000000000000')).toBeNull()
  })
})

describe('movableListIds', () => {
  it('完了列を含めない', () => {
    // 完了は常に最右で動かせないので、並び替えの対象そのものから外して数える
    expect(movableListIds(board)).toEqual(['todo', 'doing', 'design'])
  })

  it('掴んでいる列も外せる', () => {
    expect(movableListIdsWithout(board, 'doing')).toEqual(['todo', 'design'])
  })

  it('完了列は id で引ける', () => {
    // 末尾の目印として使うので、どれが完了かを1か所で決める
    expect(fixedLastListId(board)).toBe('done')
  })
})

describe('resolveListDropIndex', () => {
  it('列の上なら、その列の手前に入る', () => {
    // 掴んでいる todo を除くと ['doing', 'design']。design の手前は 1
    expect(resolveListDropIndex(board, toColumnDraggableId('design'), 'todo')).toBe(1)
  })

  it('完了列の上なら、動かせる列の最後に入る', () => {
    // 「完了の手前」が末尾。専用の受け口は作らない（#93）
    expect(resolveListDropIndex(board, toColumnDraggableId('done'), 'todo')).toBe(2)
  })

  it('列ではないものの上では決まらない', () => {
    expect(resolveListDropIndex(board, 'list:todo', 'todo')).toBeNull()
  })
})

describe('withMovedList', () => {
  it('指定の位置へ挿し、完了列は末尾のまま', () => {
    expect(withMovedList(board, 'design', 0)).toEqual(['design', 'todo', 'doing', 'done'])
  })

  it('末尾へ動かしても完了列より右へは行かない', () => {
    expect(withMovedList(board, 'todo', 2)).toEqual(['doing', 'design', 'todo', 'done'])
  })

  it('右へ動かすとき、掴んだ列を抜いてから数える', () => {
    // todo を抜くと ['doing', 'design']。1 は doing と design の間
    expect(withMovedList(board, 'todo', 1)).toEqual(['doing', 'todo', 'design', 'done'])
  })
})

describe('isSameListPlace', () => {
  it('いまと同じ並びになるなら true', () => {
    // todo を抜くと ['doing', 'design']。0 に挿すと元どおり
    expect(isSameListPlace(board, 'todo', 0)).toBe(true)
  })

  it('並びが変わるなら false', () => {
    expect(isSameListPlace(board, 'todo', 1)).toBe(false)
  })
})
