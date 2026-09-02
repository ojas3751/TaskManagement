import type { CollisionDetection } from '@dnd-kit/core'
import { describe, expect, it } from 'vitest'
import type { Board, TaskList } from '../api/types'
import {
  createListDropCollisionDetection,
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

describe('キーボードで動かしているときの落ち先', () => {
  /**
   * ポインタが無い経路（キーボード）を通すための引数。**矩形を渡す口だけが本題**なので、
   * dnd-kit が渡す他の項目は使われない。型は満たさないため、この関数の中だけで押さえる。
   */
  const keyboardArgs = (
    draggingId: string,
    rects: Map<string, { left: number; width: number }>,
  ) =>
    ({
      active: { id: toColumnDraggableId(draggingId) },
      collisionRect: { left: 0, width: 300 },
      droppableRects: rects,
      pointerCoordinates: null,
    }) as unknown as Parameters<CollisionDetection>[0]

  it('列の矩形が1つも取れなくても、落ち先を返す（例外にしない）', () => {
    // 掴んでいる最中に矩形が取れないことは起こりうる。ここで未定義の識別子を参照しており、
    // 到達すると ReferenceError になっていた（#103）。落ち先は末尾＝完了列
    const detect = createListDropCollisionDetection(board)

    expect(detect(keyboardArgs('todo', new Map()))).toEqual([
      { id: toColumnDraggableId('done') },
    ])
  })

  it('完了列が無ければ、落ち先を返さない', () => {
    // 末尾の目印が無いので決めようがない。そのまま離しても移動しない
    const noFixedLast: Board = { ...board, lists: [list('todo', 0), list('doing', 1)] }
    const detect = createListDropCollisionDetection(noFixedLast)

    expect(detect(keyboardArgs('todo', new Map()))).toEqual([])
  })

  it('矩形が取れるときは、いちばん近い列で決まる', () => {
    // design を掴んで todo の場所まで運んだ。todo は自分より左なので「その手前」に入る。
    // design を抜いた並び ['todo', 'doing'] の 0 番＝ todo の手前
    const detect = createListDropCollisionDetection(board)
    const rects = new Map([
      [toColumnDraggableId('todo'), { left: 0, width: 300 }],
      [toColumnDraggableId('doing'), { left: 300, width: 300 }],
      [toColumnDraggableId('design'), { left: 600, width: 300 }],
    ])

    // collisionRect の中心 150 が todo の中心 150 と一致する
    expect(detect(keyboardArgs('design', rects))).toEqual([{ id: toColumnDraggableId('todo') }])
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
