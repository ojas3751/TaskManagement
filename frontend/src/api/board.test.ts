import { afterEach, describe, expect, it, vi } from 'vitest'
import { BoardApiError, fetchBoard, updateCard } from './board'
import type { Board } from './types'

/**
 * 通信そのものを差し替えて、board.ts の**実物**を通す。
 *
 * App.test.tsx は `./api/board` をモジュールごとモックしているので、そちらでは
 * ここの検証は一度も動かない。レスポンスの形を確かめる責務はこのファイルが持つ。
 */
function respond(status: number, body: unknown, asText?: string) {
  const res = new Response(asText ?? JSON.stringify(body), {
    status,
    headers: { 'Content-Type': asText ? 'text/html' : 'application/json' },
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(res)),
  )
}

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
      cards: [
        {
          id: 'a',
          title: '牛乳を買う',
          description: '',
          due_at: null,
          has_due_time: false,
          position: 0,
        },
      ],
    },
  ],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('レスポンスの検証', () => {
  it('Board の形をしていればそのまま返す', async () => {
    respond(200, board)

    await expect(fetchBoard()).resolves.toEqual(board)
  })

  it.each([
    ['lists が無い', { id: 'board', title: 'マイタスク' }],
    ['lists が配列でない', { ...board, lists: 'これは配列ではない' }],
    ['リストに cards が無い', { ...board, lists: [{ id: 'todo', title: 'TODO' }] }],
    ['カードが文字列', { ...board, lists: [{ id: 'todo', title: 'TODO', cards: ['a'] }] }],
    ['本体が null', null],
  ])('200 でも %s なら Error を投げる', async (_name, body) => {
    respond(200, body)

    await expect(fetchBoard()).rejects.toThrow(Error)
  })

  it('本体が JSON でなければ Error を投げる', async () => {
    respond(200, null, '<html>502 Bad Gateway</html>')

    await expect(fetchBoard()).rejects.toThrow(Error)
  })

  /**
   * **検証の失敗を BoardApiError にしないことが要**（機能仕様書 4.2）。
   * App.tsx は「BoardApiError かどうか」と「code」で通信失敗とサーバーエラーを
   * 分けているので、ここに混ぜると判別が狂う。
   */
  it('検証の失敗は BoardApiError ではない', async () => {
    respond(200, { ...board, lists: null })

    await expect(fetchBoard()).rejects.not.toBeInstanceOf(BoardApiError)
  })
})

describe('失敗レスポンスの扱いは変えない', () => {
  it('エラー本体を読めれば code と message が保たれる', async () => {
    respond(409, { code: 'LIST_LIMIT_EXCEEDED', message: '追加できるリストは10件までです', field: null })

    await expect(
      updateCard('a', { title: 'x', description: '', due_at: null, has_due_time: false }),
    ).rejects.toMatchObject({ status: 409, code: 'LIST_LIMIT_EXCEEDED' })
  })

  it('エラー本体を読めなければ UNKNOWN になる', async () => {
    respond(502, null, '<html>502 Bad Gateway</html>')

    await expect(fetchBoard()).rejects.toMatchObject({ status: 502, code: 'UNKNOWN' })
  })
})
