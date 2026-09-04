import { Component, type ErrorInfo, type ReactNode } from 'react'
import { LoadError } from './LoadError'

type Props = { children: ReactNode }
type State = { hasError: boolean }

/**
 * 状態を持ち直す再試行は当てにならない。壊れているのはツリーそのもので、同じ状態で
 * 描き直せば同じ例外が出る。**関数を外に出しているのは、描画のたびに新しい関数を
 * 渡さないため**（react-perf の指摘に合わせる）。
 */
function reload() {
  window.location.reload()
}

/**
 * レンダリング中の例外を受け止める最後の砦。
 *
 * **React 19 は、捕まえ手が無い例外でツリーごとアンマウントする。** `#root` が空になり、
 * 何が起きたか分からない白い画面だけが残る。ここが無いと、想定外の API レスポンスや
 * 描画中の TypeError がそのまま「操作不能の白画面」になる。
 *
 * **クラスなのは選択ではない。** `getDerivedStateFromError` / `componentDidCatch` は
 * クラスコンポーネントにしか無く、React 19 にも関数版は無い。
 *
 * 表示は LoadError を使い回す。初期読み込みの失敗と、利用者から見て起きていることは
 * 同じ（盤面が出せない）ので、別の見た目を作る理由が無い。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 監視基盤は無いので、せめて手元で追えるようにする
    console.error('画面の描画中に例外が発生しました', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      /**
       * 高さはここで与える。**LoadError は h-full**（F-25 のため、高さは常に親が持つ）で、
       * 素の #root の中では潰れてしまう。
       */
      <div className="h-dvh">
        <LoadError
          title="画面の表示中に問題が発生しました。"
          detail="再読み込みしてください。"
          onRetry={reload}
        />
      </div>
    )
  }
}
