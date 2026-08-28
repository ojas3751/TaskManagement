import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { BoardApiError, createCard, deleteCard, fetchBoard } from './api/board'
import type { Board, Card } from './api/types'

/**
 * 通信だけを差し替える。BoardApiError は App がエラーの種類を見分けるのに使って
 * いるので、実物を残す（モックのクラスに置き換えると instanceof が通らなくなる）。
 */
vi.mock('./api/board', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/board')>()
  return {
    ...actual,
    fetchBoard: vi.fn(),
    createCard: vi.fn(),
    updateCard: vi.fn(),
    moveCard: vi.fn(),
    deleteCard: vi.fn(),
  }
})

/**
 * 応答のタイミングをテスト側から決めるための約束。
 *
 * 「まだ返ってきていない状態」を作れることがこのテスト群の要で、ロックも待機表示も
 * その間に何が起きるかを見るもの。
 */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const card = (id: string, title: string, position: number): Card => ({
  id,
  title,
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
      cards: [card('a', '牛乳を買う', 0), card('b', '請求書を出す', 1), card('c', '本を返す', 2)],
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

/** DB が止まっているときにバックエンドが返すもの（503 / DB_UNAVAILABLE） */
const dbDown = new BoardApiError(503, 'DB_UNAVAILABLE', 'データベースに接続できません。')

/** App を描いて、ボードが出るまで待つ */
async function renderBoard() {
  vi.mocked(fetchBoard).mockResolvedValue(board)
  const view = render(<App />)
  expect(await screen.findByText('牛乳を買う')).toBeInTheDocument()
  return view
}

/** TODO 列の「＋ タスク追加」からタスクを足す */
function addTask(title: string) {
  fireEvent.click(screen.getAllByRole('button', { name: '＋ タスク追加' })[0])
  fireEvent.change(screen.getByLabelText('タイトル'), { target: { value: title } })
  fireEvent.click(screen.getByRole('button', { name: '追加' }))
}

/** ゴミ箱アイコンから削除する（確認モーダルまで進む） */
function deleteTask(title: string) {
  fireEvent.click(screen.getByRole('button', { name: `「${title}」を削除` }))
  fireEvent.click(screen.getByRole('button', { name: '削除する' }))
}

/** 列に並んでいるタスクを、画面に出ている順で返す */
function titlesIn(listTitle: string): string[] {
  const column = screen.getByRole('heading', { name: listTitle }).closest('section')
  return [...(column?.querySelectorAll('h3') ?? [])].map((h) => h.textContent ?? '')
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('操作の失敗と巻き戻し', () => {
  it('追加に失敗したら、足したタスクが消える', async () => {
    await renderBoard()
    vi.mocked(createCard).mockRejectedValue(dbDown)

    addTask('新しいタスク')
    expect(screen.getByText('新しいタスク')).toBeInTheDocument()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'データベースに接続できません。',
    )
    expect(screen.queryByText('新しいタスク')).not.toBeInTheDocument()
  })

  it('削除に失敗したら、タスクが元の位置に戻る', async () => {
    await renderBoard()
    vi.mocked(deleteCard).mockRejectedValue(dbDown)

    deleteTask('請求書を出す')
    expect(screen.queryByText('請求書を出す')).not.toBeInTheDocument()

    await screen.findByRole('alert')
    // 順番まで見る。position を詰め直していないので、間に戻るのが正しい
    expect(titlesIn('TODO')).toEqual(['牛乳を買う', '請求書を出す', '本を返す'])
  })
})

describe('応答待ちの間は操作を止める（#43, #44）', () => {
  it('応答を待っている間、盤面を inert にする', async () => {
    await renderBoard()
    const pending = deferred<Board>()
    vi.mocked(createCard).mockReturnValue(pending.promise)

    expect(document.querySelector('[inert]')).toBeNull()

    addTask('新しいタスク')
    expect(document.querySelector('[inert]')).not.toBeNull()

    await act(async () => {
      pending.resolve(board)
    })
    expect(document.querySelector('[inert]')).toBeNull()
  })

  /**
   * #43 の回帰テスト。
   *
   * 応答待ちの間に別の操作が始められると、失敗したときに互いの巻き戻しを踏む。
   * **飛んでいるリクエストが常に1本であることが、巻き戻しの正しさの前提。**
   */
  it('応答待ちの間に削除を試みても、リクエストは飛ばない', async () => {
    await renderBoard()
    const pending = deferred<Board>()
    vi.mocked(createCard).mockReturnValue(pending.promise)

    addTask('新しいタスク')

    // 実際のブラウザでは inert が押下を止める。jsdom は inert を再現しないため、
    // ここでは「押せてしまっても、リクエストは飛ばない」ことを確かめる
    const trash = screen.queryByRole('button', { name: '「牛乳を買う」を削除' })
    if (trash) fireEvent.click(trash)
    const confirm = screen.queryByRole('button', { name: '削除する' })
    if (confirm) fireEvent.click(confirm)

    expect(deleteCard).not.toHaveBeenCalled()

    await act(async () => {
      pending.resolve(board)
    })
  })
})

describe('待っていることの見せ方（#44）', () => {
  it('速いうちは何も出さず、遅くなってから段階的に伝える', async () => {
    await renderBoard()
    // ボードを描き終えてからタイマーを止める。描画中に止めると findBy が進まない
    vi.useFakeTimers()

    const pending = deferred<Board>()
    vi.mocked(createCard).mockReturnValue(pending.promise)

    addTask('新しいタスク')

    // 正常時（10ms 前後）に表示がチラつかないことがこの間隔の目的
    act(() => void vi.advanceTimersByTime(199))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    act(() => void vi.advanceTimersByTime(1))
    expect(screen.getByRole('status')).toHaveTextContent('更新しています…')

    act(() => void vi.advanceTimersByTime(2_000))
    expect(screen.getByRole('status')).toHaveTextContent(
      'データベースの接続をチェック中です…',
    )
  })

  it('応答が返ったら表示は消える', async () => {
    await renderBoard()
    vi.useFakeTimers()

    const pending = deferred<Board>()
    vi.mocked(createCard).mockReturnValue(pending.promise)

    addTask('新しいタスク')
    act(() => void vi.advanceTimersByTime(200))
    expect(screen.getByRole('status')).toBeInTheDocument()

    // waitFor は実時間でポーリングするので、タイマーを止めている間は進まない。
    // 応答の反映はマイクロタスクなので、act で流せば足りる
    await act(async () => {
      pending.resolve(board)
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
