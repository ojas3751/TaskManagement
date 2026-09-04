import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// 描いた画面はテストごとに片付ける。残すと、次のテストで同じ文言が2つ見つかって
// getByText が「複数見つかった」で落ちる
afterEach(cleanup)

/**
 * `<dialog>` の最小限の代役（#113）。
 *
 * **jsdom 29 は `showModal()` / `close()` を実装していない**（要素は解釈するが、
 * メソッドは生えていない）。モーダルを `<dialog>` + `showModal()` に替えた結果、
 * これが無いと描画の時点で TypeError になる。
 *
 * **やっているのは `open` 属性の開け閉めと `Esc` の橋渡しだけ。** 本来 `showModal()` が
 * 連れてくる**フォーカストラップ・背景の不活性化・フォーカスの復帰は、ここでは
 * 再現していない。** それらはブラウザの機能であり、**jsdom では原理的に確かめられない**
 * （`docs/backlog.md` の C-4 と同じ構図）。**そこは手動確認が担う。**
 */
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true
    // ブラウザは Esc を cancel イベントとして配る。閉じる判断は cancel の
    // ハンドラ側にあるので、テストからも同じ経路を通せるようにしておく
    this.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key !== 'Escape') return
      const cancel = new Event('cancel', { cancelable: true })
      if (this.dispatchEvent(cancel)) this.close()
    })
  }
  HTMLDialogElement.prototype.close = function close() {
    this.open = false
  }
}
