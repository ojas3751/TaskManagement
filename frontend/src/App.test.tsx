import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import {
  BoardApiError,
  bulkDeleteCards,
  createCard,
  createList,
  deleteCard,
  deleteList,
  fetchBoard,
  moveCard,
  reorderLists,
  updateList,
} from './api/board'
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
    createList: vi.fn(),
    updateList: vi.fn(),
    deleteList: vi.fn(),
    reorderLists: vi.fn(),
    createCard: vi.fn(),
    updateCard: vi.fn(),
    moveCard: vi.fn(),
    deleteCard: vi.fn(),
    bulkDeleteCards: vi.fn(),
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

/**
 * 追加した列がある盤面（F-03 の対象）。
 *
 * 既定の board と分けているのは、改名ボタンが出るのが `is_default` が false の
 * 列だけであり、seed の3列しかない盤面では確かめられないため。
 */
const boardWithAddedList: Board = {
  ...board,
  lists: [
    board.lists[0],
    {
      id: 'design',
      title: '設計',
      is_default: false,
      is_fixed_last: false,
      position: 1,
      cards: [],
    },
    board.lists[1],
  ],
}

/** 完了列に3件入った盤面。F-15（選択削除）と F-22（完了操作）の両方で使う */
const withDoneCards: Board = {
  ...board,
  lists: [
    board.lists[0],
    {
      ...board.lists[1],
      cards: [card('d1', '済んだ1', 0), card('d2', '済んだ2', 1), card('d3', '済んだ3', 2)],
    },
  ],
}

/** App を描いて、ボードが出るまで待つ */
async function renderBoard(initial: Board = board) {
  vi.mocked(fetchBoard).mockResolvedValue(initial)
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

/** 「＋ リスト追加」から列を足す（F-02） */
function addList(title: string) {
  fireEvent.click(screen.getByRole('button', { name: '＋ リスト追加' }))
  fireEvent.change(screen.getByLabelText('リスト名'), { target: { value: title } })
  fireEvent.click(screen.getByRole('button', { name: '追加' }))
}

/** 追加した列の編集アイコンから、リストの詳細モーダルを開く（F-03, F-04） */
function openListDetail(listTitle = '設計') {
  fireEvent.click(screen.getByRole('button', { name: `「${listTitle}」の詳細` }))
}

/** 盤面に出ている列を、表示されている順で返す */
function listTitles(): string[] {
  return [...document.querySelectorAll('section h2')].map((h) => h.textContent ?? '')
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

describe('リストの追加（F-02）', () => {
  it('応答を待たずに、完了列の左隣へ描く', async () => {
    await renderBoard()
    const pending = deferred<Board>()
    vi.mocked(createList).mockReturnValue(pending.promise)

    addList('設計')

    // 完了列は最右のまま。ここが崩れると F-05 の前提（完了列の固定）も崩れる
    expect(listTitles()).toEqual(['TODO', '設計', '完了'])
    expect(createList).toHaveBeenCalledWith(expect.objectContaining({ title: '設計' }))

    await act(async () => {
      pending.resolve(board)
    })
  })

  it('追加に失敗したら、足した列が消える', async () => {
    await renderBoard()
    vi.mocked(createList).mockRejectedValue(dbDown)

    addList('設計')
    expect(listTitles()).toContain('設計')

    expect(await screen.findByRole('alert')).toHaveTextContent('データベースに接続できません。')
    expect(listTitles()).toEqual(['TODO', '完了'])
  })

  it('上限に達していたら、サーバーの文言をそのまま出す', async () => {
    await renderBoard()
    // 上限の判断はサーバーだけが持つ（api.md 2.3）。画面は件数を数えない
    vi.mocked(createList).mockRejectedValue(
      new BoardApiError(409, 'LIST_LIMIT_EXCEEDED', '追加できるリストは10件までです'),
    )

    addList('11件目')

    expect(await screen.findByRole('alert')).toHaveTextContent('追加できるリストは10件までです')
    expect(listTitles()).toEqual(['TODO', '完了'])
  })
})

describe('リストの改名（F-03）', () => {
  it('デフォルトの3列には編集アイコンを出さない', async () => {
    await renderBoard()

    // 盤面には TODO と 完了 しかない。どちらも is_default
    expect(screen.queryByRole('button', { name: /の詳細/ })).not.toBeInTheDocument()
  })

  it('追加した列にだけ編集アイコンを出す', async () => {
    await renderBoard(boardWithAddedList)

    expect(screen.getAllByRole('button', { name: /の詳細/ })).toHaveLength(1)
    expect(screen.getByRole('button', { name: '「設計」の詳細' })).toBeInTheDocument()
  })

  it('現在の名前が入った状態で開き、応答を待たずに書き換える', async () => {
    await renderBoard(boardWithAddedList)
    const pending = deferred<Board>()
    vi.mocked(updateList).mockReturnValue(pending.promise)

    openListDetail()
    // 付け直しではなく手直しになるよう、現在の名前を入れておく
    expect(screen.getByLabelText('リスト名')).toHaveValue('設計')

    fireEvent.change(screen.getByLabelText('リスト名'), { target: { value: '設計・調査' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(listTitles()).toEqual(['TODO', '設計・調査', '完了'])
    expect(updateList).toHaveBeenCalledWith('design', { title: '設計・調査' })

    await act(async () => {
      pending.resolve(boardWithAddedList)
    })
  })

  it('改名に失敗したら、元の名前に戻る', async () => {
    await renderBoard(boardWithAddedList)
    vi.mocked(updateList).mockRejectedValue(dbDown)

    openListDetail()
    fireEvent.change(screen.getByLabelText('リスト名'), { target: { value: '設計・調査' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(listTitles()).toContain('設計・調査')

    expect(await screen.findByRole('alert')).toHaveTextContent('データベースに接続できません。')
    expect(listTitles()).toEqual(['TODO', '設計', '完了'])
  })
})

describe('リストの削除（F-04）', () => {
  /** 中にタスクが2件ある「設計」列。道連れの件数を確かめるために使う */
  const withTasks: Board = {
    ...boardWithAddedList,
    lists: boardWithAddedList.lists.map((list) =>
      list.id === 'design'
        ? { ...list, cards: [card('x', '調査する', 0), card('y', '図を描く', 1)] }
        : list,
    ),
  }

  it('確認モーダルに、道連れになるタスクの件数を出す', async () => {
    await renderBoard(withTasks)

    openListDetail()
    fireEvent.click(screen.getByRole('button', { name: 'このリストを削除' }))

    // 何が失われるかを数で見せる（画面設計 7章）。列名だけでは、中身を忘れていると判断できない
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent('リスト「設計」を削除します。')
    expect(dialog).toHaveTextContent('中のタスク2件も一緒に削除されます。')
  })

  it('タスクが無ければ、その旨を出す', async () => {
    await renderBoard(boardWithAddedList)

    openListDetail()
    fireEvent.click(screen.getByRole('button', { name: 'このリストを削除' }))

    expect(screen.getByRole('alertdialog')).toHaveTextContent('中にタスクはありません。')
  })

  it('確認するまでは消さない', async () => {
    await renderBoard(withTasks)

    openListDetail()
    fireEvent.click(screen.getByRole('button', { name: 'このリストを削除' }))
    expect(listTitles()).toContain('設計')

    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(deleteList).not.toHaveBeenCalled()
    expect(listTitles()).toContain('設計')
  })

  it('確認すると、応答を待たずに列ごと消える', async () => {
    await renderBoard(withTasks)
    const pending = deferred<Board>()
    vi.mocked(deleteList).mockReturnValue(pending.promise)

    openListDetail()
    fireEvent.click(screen.getByRole('button', { name: 'このリストを削除' }))
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))

    expect(listTitles()).toEqual(['TODO', '完了'])
    // 中のタスクも一緒に消える。どこかへ移ることはない
    expect(screen.queryByText('調査する')).not.toBeInTheDocument()
    expect(deleteList).toHaveBeenCalledWith('design')

    await act(async () => {
      pending.resolve(board)
    })
  })

  it('削除に失敗したら、列がタスクごと戻る', async () => {
    await renderBoard(withTasks)
    vi.mocked(deleteList).mockRejectedValue(dbDown)

    openListDetail()
    fireEvent.click(screen.getByRole('button', { name: 'このリストを削除' }))
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))
    expect(listTitles()).not.toContain('設計')

    expect(await screen.findByRole('alert')).toHaveTextContent('データベースに接続できません。')
    expect(listTitles()).toEqual(['TODO', '設計', '完了'])
    expect(screen.getByText('調査する')).toBeInTheDocument()
  })
})

describe('リストの並び替え（F-05）', () => {
  it('完了列には矢印を出さないが、他の列には出す', async () => {
    await renderBoard(boardWithAddedList)

    expect(screen.getByRole('button', { name: '「TODO」を右へ移動' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '「設計」を左へ移動' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /「完了」を/ })).not.toBeInTheDocument()
  })

  it('左端の左と、完了の左隣の右は押せない', async () => {
    await renderBoard(boardWithAddedList)

    // 端では消さずに残す。消すと列によってボタンの数が変わり、見出しの位置がずれる
    expect(screen.getByRole('button', { name: '「TODO」を左へ移動' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '「TODO」を右へ移動' })).toBeEnabled()
    // 「設計」の右隣は完了。完了より右へは行けない
    expect(screen.getByRole('button', { name: '「設計」を右へ移動' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '「設計」を左へ移動' })).toBeEnabled()
  })

  it('応答を待たずに並びが入れ替わる', async () => {
    await renderBoard(boardWithAddedList)
    const pending = deferred<Board>()
    vi.mocked(reorderLists).mockReturnValue(pending.promise)

    fireEvent.click(screen.getByRole('button', { name: '「設計」を左へ移動' }))

    expect(listTitles()).toEqual(['設計', 'TODO', '完了'])
    // 変更後の並び順すべてを送る。添字がそのまま position になる
    expect(reorderLists).toHaveBeenCalledWith({ list_ids: ['design', 'todo', 'done'] })

    await act(async () => {
      pending.resolve(boardWithAddedList)
    })
  })

  it('並び替えに失敗したら、元の並びに戻る', async () => {
    await renderBoard(boardWithAddedList)
    vi.mocked(reorderLists).mockRejectedValue(dbDown)

    fireEvent.click(screen.getByRole('button', { name: '「TODO」を右へ移動' }))
    expect(listTitles()).toEqual(['設計', 'TODO', '完了'])

    expect(await screen.findByRole('alert')).toHaveTextContent('データベースに接続できません。')
    expect(listTitles()).toEqual(['TODO', '設計', '完了'])
  })
})

describe('ホバーでの完了操作（F-22）', () => {
  /** 「完了にする」のチェックを入れる */
  function complete(title: string) {
    fireEvent.click(screen.getByRole('checkbox', { name: `「${title}」を完了にする` }))
  }

  it('完了列以外のタスクに出て、完了列のタスクには出ない', async () => {
    await renderBoard(withDoneCards)

    expect(screen.getByRole('checkbox', { name: '「牛乳を買う」を完了にする' })).toBeInTheDocument()
    // 完了列のチェックは「選択」（F-15）のまま。完了列から完了へは移せない
    expect(
      screen.queryByRole('checkbox', { name: '「済んだ1」を完了にする' }),
    ).not.toBeInTheDocument()
  })

  it('チェックすると、応答を待たずに完了列の先頭へ移る', async () => {
    await renderBoard()
    const pending = deferred<Board>()
    vi.mocked(moveCard).mockReturnValue(pending.promise)

    complete('請求書を出す')

    // F-06（追加は列の先頭）と揃える。完了列が長くてもスクロールせずに結果が見える
    expect(titlesIn('完了')).toEqual(['請求書を出す'])
    expect(titlesIn('TODO')).toEqual(['牛乳を買う', '本を返す'])
    // 送り先は F-13 / F-23 と同じ。先頭に挿すので to_card_ids の先頭に入る
    expect(moveCard).toHaveBeenCalledWith({
      card_id: 'b',
      from_list_id: 'todo',
      to_list_id: 'done',
      to_card_ids: ['b'],
    })

    await act(async () => {
      pending.resolve(board)
    })
  })

  it('既にタスクが入っている完了列でも、先頭に入る', async () => {
    await renderBoard(withDoneCards)
    const pending = deferred<Board>()
    vi.mocked(moveCard).mockReturnValue(pending.promise)

    complete('牛乳を買う')

    expect(titlesIn('完了')).toEqual(['牛乳を買う', '済んだ1', '済んだ2', '済んだ3'])
    // 末尾に足すのではなく先頭に挿す。ここが F-23（末尾に足す）との違い
    expect(moveCard).toHaveBeenCalledWith(
      expect.objectContaining({ to_card_ids: ['a', 'd1', 'd2', 'd3'] }),
    )

    await act(async () => {
      pending.resolve(withDoneCards)
    })
  })

  it('移動に失敗したら、元の列の元の位置に戻る', async () => {
    await renderBoard()
    vi.mocked(moveCard).mockRejectedValue(dbDown)

    complete('請求書を出す')
    expect(titlesIn('完了')).toEqual(['請求書を出す'])

    expect(await screen.findByRole('alert')).toHaveTextContent('データベースに接続できません。')
    // 間に戻る。position を詰め直していないので末尾ではない
    expect(titlesIn('TODO')).toEqual(['牛乳を買う', '請求書を出す', '本を返す'])
    expect(titlesIn('完了')).toEqual([])
  })

  it('応答待ちの間は押しても飛ばない', async () => {
    await renderBoard()
    const pending = deferred<Board>()
    vi.mocked(createCard).mockReturnValue(pending.promise)

    addTask('新しいタスク')
    // 実際のブラウザでは disabled と inert が押下を止める。jsdom では
    // 「押せてしまっても、リクエストは飛ばない」ことを確かめる
    complete('牛乳を買う')

    expect(moveCard).not.toHaveBeenCalled()

    await act(async () => {
      pending.resolve(board)
    })
  })
})

describe('タスク追加の置き場所（#20）', () => {
  it('完了列には出さないが、それ以外の列には出す', async () => {
    await renderBoard(boardWithAddedList)

    // TODO と「設計」の2つ。完了列には無い
    expect(screen.getAllByRole('button', { name: '＋ タスク追加' })).toHaveLength(2)

    const done = screen.getByRole('heading', { name: '完了' }).closest('section')
    expect(done?.textContent).not.toContain('＋ タスク追加')
  })
})

describe('完了列の選択削除（F-15）', () => {
  const withDone = withDoneCards

  /** タスクのチェックボックスを操作する */
  function check(title: string) {
    fireEvent.click(screen.getByRole('checkbox', { name: `「${title}」を選択` }))
  }

  it('選択のチェックボックスは完了列にだけ出る', async () => {
    await renderBoard(withDone)

    // F-22 でどの列にもチェックボックスが出るようになったので、数ではなく
    // **意味**で見る。完了列のものだけが「選択」で、他の列は「完了にする」
    expect(screen.getByRole('checkbox', { name: '「済んだ1」を選択' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: '「牛乳を買う」を選択' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /「済んだ1」を完了にする/ })).not.toBeInTheDocument()
  })

  it('何も選んでいなくても選択の行は出るが、押せない', async () => {
    await renderBoard(withDone)

    // 出し分けにすると完了列だけこの行が消え、タスクの先頭が1行ぶん上がる（#20）
    expect(screen.getByRole('button', { name: '0件を削除' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '選択解除' })).toBeDisabled()
    // 広げる先はあるので「全選択」は押せる
    expect(screen.getByRole('button', { name: '全選択' })).toBeEnabled()
  })

  it('タスクが0件の完了列では「全選択」も押せない', async () => {
    await renderBoard()

    expect(screen.getByRole('button', { name: '全選択' })).toBeDisabled()
  })

  it('1件でも選ぶと、削除ボタンが押せるようになる', async () => {
    await renderBoard(withDone)

    check('済んだ2')

    expect(screen.getByRole('button', { name: '1件を削除' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '選択解除' })).toBeEnabled()
  })

  it('選んだ件数がラベルに出る', async () => {
    await renderBoard(withDone)

    check('済んだ1')
    check('済んだ3')

    expect(screen.getByRole('button', { name: '2件を削除' })).toBeInTheDocument()
  })

  it('「全選択」で完了列の全件が対象になる', async () => {
    await renderBoard(withDone)

    check('済んだ2')
    fireEvent.click(screen.getByRole('button', { name: '全選択' }))

    expect(screen.getByRole('button', { name: '3件を削除' })).toBeInTheDocument()
  })

  it('「選択解除」で元に戻る', async () => {
    await renderBoard(withDone)

    check('済んだ2')
    fireEvent.click(screen.getByRole('button', { name: '選択解除' }))

    expect(screen.getByRole('button', { name: '0件を削除' })).toBeDisabled()
  })

  it('確認モーダルに件数を出し、確認するまで消さない', async () => {
    await renderBoard(withDone)

    check('済んだ1')
    check('済んだ2')
    fireEvent.click(screen.getByRole('button', { name: '2件を削除' }))

    // 名前を並べず件数を出す（画面設計 7章）。全件選んだときに際限なく伸びるため
    expect(screen.getByRole('alertdialog')).toHaveTextContent('選択した2件のタスクを削除します。')

    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(bulkDeleteCards).not.toHaveBeenCalled()
    expect(screen.getByText('済んだ1')).toBeInTheDocument()
  })

  it('確認すると、応答を待たずに消える', async () => {
    await renderBoard(withDone)
    const pending = deferred<Board>()
    vi.mocked(bulkDeleteCards).mockReturnValue(pending.promise)

    check('済んだ1')
    check('済んだ3')
    fireEvent.click(screen.getByRole('button', { name: '2件を削除' }))
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))

    expect(titlesIn('完了')).toEqual(['済んだ2'])
    expect(bulkDeleteCards).toHaveBeenCalledWith(['d1', 'd3'])

    await act(async () => {
      pending.resolve(withDone)
    })
  })

  it('削除に失敗したら、タスクが元の並びで戻る', async () => {
    await renderBoard(withDone)
    vi.mocked(bulkDeleteCards).mockRejectedValue(dbDown)

    check('済んだ1')
    check('済んだ3')
    fireEvent.click(screen.getByRole('button', { name: '2件を削除' }))
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))
    expect(titlesIn('完了')).toEqual(['済んだ2'])

    expect(await screen.findByRole('alert')).toHaveTextContent('データベースに接続できません。')
    // 部分的に消えることはない。全部消えたか、何も消えていないかのどちらか
    expect(titlesIn('完了')).toEqual(['済んだ1', '済んだ2', '済んだ3'])
  })
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
    expect(screen.queryByRole('status', { name: '通信の状態' })).not.toBeInTheDocument()

    act(() => void vi.advanceTimersByTime(1))
    expect(screen.getByRole('status', { name: '通信の状態' })).toHaveTextContent('更新しています…')

    act(() => void vi.advanceTimersByTime(2_000))
    expect(screen.getByRole('status', { name: '通信の状態' })).toHaveTextContent(
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
    expect(screen.getByRole('status', { name: '通信の状態' })).toBeInTheDocument()

    // waitFor は実時間でポーリングするので、タイマーを止めている間は進まない。
    // 応答の反映はマイクロタスクなので、act で流せば足りる
    await act(async () => {
      pending.resolve(board)
    })
    expect(screen.queryByRole('status', { name: '通信の状態' })).not.toBeInTheDocument()
  })
})

