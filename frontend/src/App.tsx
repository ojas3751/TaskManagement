import { useCallback, useEffect, useState } from 'react'
import { BoardApiError, fetchBoard } from './api/board'
import type { Board } from './api/types'
import { BoardView } from './components/BoardView'
import { LoadError } from './components/LoadError'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; board: Board }
  | { status: 'error'; title: string; detail: string }

const SERVER_DOWN: LoadState = {
  status: 'error',
  title: 'サーバーが起動していません。',
  detail: '起動してから再読み込みしてください。',
}

/**
 * サーバーに届かなかったのか、届いた上で断られたのかで文言を分ける。
 * 「サーバーが起動していません」を 404 のときにも出すと、利用者は
 * 起動しているサーバーを起動しようとして詰まる。
 *
 * ただしバックエンドが落ちている場合、開発中は fetch が失敗せず
 * **Vite の proxy が 502 を返す**（本番の同一オリジン構成でも、前段に
 * リバースプロキシがあれば同様）。502/503/504 は「向こう側に届かなかった」
 * ことを意味するので、通信失敗と同じ扱いにする。
 */
const UNREACHABLE_STATUS = [502, 503, 504]

function toErrorState(cause: unknown): LoadState {
  if (cause instanceof BoardApiError) {
    if (UNREACHABLE_STATUS.includes(cause.status)) return SERVER_DOWN
    return {
      status: 'error',
      title: cause.message,
      detail: '時間をおいて再読み込みしてください。',
    }
  }
  return SERVER_DOWN
}

export default function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  const load = useCallback(() => {
    setState({ status: 'loading' })
    fetchBoard().then(
      (board) => setState({ status: 'ready', board }),
      (cause: unknown) => setState(toErrorState(cause)),
    )
  }, [])

  useEffect(load, [load])

  return (
    <>
      <header className="border-b border-line bg-surface px-5 py-3">
        <h1 className="m-0 text-lg font-bold">
          {state.status === 'ready' ? state.board.title : 'マイタスク'}
        </h1>
      </header>

      {state.status === 'loading' && (
        <p className="px-5 py-10 text-center text-ink-sub">読み込み中…</p>
      )}
      {state.status === 'error' && (
        <LoadError title={state.title} detail={state.detail} onRetry={load} />
      )}
      {state.status === 'ready' && <BoardView board={state.board} />}
    </>
  )
}
