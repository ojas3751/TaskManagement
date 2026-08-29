import { describe, expect, it } from 'vitest'
import type { Board, Card } from '../api/types'
import {
  withCards,
  withList,
  withRenamedList,
  withUpdatedCard,
  withoutCard,
  withoutCards,
  withoutList,
} from './boardEdit'

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

/** 表示順。盤面と同じく position の昇順で並べる */
const displayed = (b: Board) => [...b.lists].sort((x, y) => x.position - y.position).map((l) => l.title)

describe('withList', () => {
  it('完了列の直前に並ぶ', () => {
    const next = withList(board, 'new', '設計')

    expect(displayed(next)).toEqual(['TODO', '進行中', '設計', '完了'])
  })

  it('2つ足しても完了列が最後に残る', () => {
    const next = withList(withList(board, 'first', '1つ目'), 'second', '2つ目')

    // 暫定の position が同値になると、並びが配列の順序に依存してしまう。
    // 完了列より手前であればよく、追加分どうしの前後は応答で確定する
    expect(displayed(next).at(-1)).toBe('完了')
    expect(displayed(next)).toHaveLength(5)
  })

  it('追加した列は改名・削除・移動を許す形で入る', () => {
    const next = withList(board, 'new', '設計')
    const added = next.lists.find((l) => l.id === 'new')

    expect(added?.is_default).toBe(false)
    expect(added?.is_fixed_last).toBe(false)
    expect(added?.cards).toEqual([])
  })

  it('完了列が無ければ末尾に置く', () => {
    const noFixedLast: Board = { ...board, lists: board.lists.filter((l) => !l.is_fixed_last) }
    const next = withList(noFixedLast, 'new', '設計')

    expect(displayed(next)).toEqual(['TODO', '進行中', '設計'])
  })

  it('元の board は変更しない', () => {
    withList(board, 'new', '設計')

    expect(board.lists).toHaveLength(3)
  })
})

describe('withRenamedList', () => {
  it('該当のリストの名前だけ差し替える', () => {
    const next = withRenamedList(board, 'doing', '作業中')

    expect(next.lists.map((l) => l.title)).toEqual(['TODO', '作業中', '完了'])
  })

  it('中のタスクと位置は触らない', () => {
    const next = withRenamedList(board, 'todo', 'やること')

    expect(next.lists[0].cards.map((c) => c.id)).toEqual(['a', 'b'])
    expect(next.lists[0].position).toBe(0)
  })

  it('元の名前を入れ直せば変更前に戻る', () => {
    // 巻き戻しの経路。盤面ごと控えなくても、名前を戻すだけで元に戻る
    const renamed = withRenamedList(board, 'doing', '作業中')

    expect(withRenamedList(renamed, 'doing', '進行中')).toEqual(board)
  })

  it('存在しない id では何も変わらない', () => {
    const next = withRenamedList(board, 'nowhere', '作業中')

    expect(next.lists.map((l) => l.title)).toEqual(['TODO', '進行中', '完了'])
  })

  it('元の board は変更しない', () => {
    withRenamedList(board, 'doing', '作業中')

    expect(board.lists[1].title).toBe('進行中')
  })
})

describe('withoutList', () => {
  it('該当のリストを中のタスクごと取り除く', () => {
    const next = withoutList(board, 'todo')

    expect(next.lists.map((l) => l.id)).toEqual(['doing', 'done'])
    expect(next.lists.flatMap((l) => l.cards).map((c) => c.id)).toEqual(['c'])
  })

  it('残ったリストの position は詰め直さない', () => {
    const next = withoutList(board, 'todo')

    expect(next.lists.map((l) => l.position)).toEqual([1, 2])
  })

  it('追加に失敗したときは足す前に戻る', () => {
    // 巻き戻しの経路。withList で足した列を id で外すだけで元に戻る
    const added = withList(board, 'new', '設計')

    expect(withoutList(added, 'new')).toEqual(board)
  })

  it('存在しない id では何も変わらない', () => {
    const next = withoutList(board, 'nowhere')

    expect(next.lists.map((l) => l.id)).toEqual(['todo', 'doing', 'done'])
  })

  it('元の board は変更しない', () => {
    withoutList(board, 'todo')

    expect(board.lists).toHaveLength(3)
  })
})

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

describe('withoutCards', () => {
  it('複数のリストにまたがっていてもまとめて取り除く', () => {
    const next = withoutCards(board, ['a', 'c'])

    expect(next.lists[0].cards.map((c) => c.id)).toEqual(['b'])
    expect(next.lists[1].cards).toEqual([])
  })

  it('残ったタスクの position は詰め直さない', () => {
    // withoutCard と同じ理由。正しい連番は応答で入る
    const next = withoutCards(board, ['a'])

    expect(next.lists[0].cards.map((c) => c.position)).toEqual([1])
  })

  it('存在しない id が混ざっていても、在るものだけ取り除く', () => {
    // 画面側で弾く必要はない。サーバーは1件でも見つからなければ1件も削除せず
    // 404 を返すので、その場合は呼び出し側が盤面ごと巻き戻す
    const next = withoutCards(board, ['a', 'nowhere'])

    expect(next.lists[0].cards.map((c) => c.id)).toEqual(['b'])
  })

  it('空の配列では何も変わらない', () => {
    const next = withoutCards(board, [])

    expect(next.lists.map((l) => l.cards.map((c) => c.id))).toEqual([['a', 'b'], ['c'], []])
  })

  it('元の board は変更しない', () => {
    withoutCards(board, ['a', 'c'])

    expect(board.lists[0].cards.map((c) => c.id)).toEqual(['a', 'b'])
    expect(board.lists[1].cards.map((c) => c.id)).toEqual(['c'])
  })
})
