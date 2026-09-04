import { useEffect, useRef, type ReactNode } from 'react'

type Props = {
  /** 見出しの id。読み上げソフトがモーダルの名前として読む */
  labelledBy: string
  /**
   * 取り消せない操作の確認か（C-8 / 画面設計 7章）。
   * true なら `alertdialog` になり、読み上げソフトが「注意を要する」扱いにする。
   */
  alert?: boolean
  /** 幅や配置の指定。既定は max-w-100 */
  className?: string
  onCancel: () => void
  children: ReactNode
}

/**
 * モーダルの外枠（C-8）。**4つのモーダルはすべてこれを通る。**
 *
 * **`role="dialog"` + `aria-modal="true"` をやめて `<dialog>` + `showModal()` にした。**
 * `aria-modal` は支援技術へのヒントに過ぎず、**ブラウザの挙動を何も変えない。** 実際、
 * 開いたまま `Tab` を押し続けるとフォーカスが背後の盤面へ抜け、見えていないボタンを
 * `Enter` で押せていた。
 *
 * `showModal()` にすると、次の4つが**ブラウザ標準で**付いてくる。
 *
 * - フォーカスがモーダルの外へ出ない（フォーカストラップ）
 * - 背後が操作できなくなる（inert 相当）
 * - `Esc` で閉じる（`cancel` イベント）
 * - 閉じたときに、開く前の要素へフォーカスが戻る
 *
 * **4ファイルに重複していた `window` の keydown リスナはこれで要らなくなった。**
 * ただし **`App` の `isModalOpen` は残っている** — `Esc` の keydown 自体は `<dialog>` から
 * `window` まで普通に伝播するので、あれを消すと**モーダルを閉じるつもりの `Esc` で
 * 編集モードまで抜ける。**
 */
export function ModalDialog({
  labelledBy,
  alert = false,
  className = 'max-w-100',
  onCancel,
  children,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    // 開く前にフォーカスがあった要素を覚えておく。戻し先は下のクリーンアップで使う
    const opener = document.activeElement
    // showModal() でなければ意味がない。open 属性や show() では、背後が生きたままになる
    dialog?.showModal()

    return () => {
      dialog?.close()
      /**
       * **閉じた後のフォーカスを、開く元になった要素へ自分で戻す。**
       *
       * `<dialog>` は本来これを標準でやってくれるが、**その働きは「閉じる時点で
       * まだ DOM にいること」を前提にしている。** ここでは閉じるのが React 側
       * （親が状態を畳んで要素ごと外す）なので、復帰が起きずに**フォーカスが
       * body へ落ちる** — `Tab` を押すとページの先頭に飛ぶ状態になる。
       *
       * **`isConnected` を見るのは、開く元が消えている場合があるため。** 削除の確認
       * モーダルは、まさに開く元のカードを消してから閉じる。
       */
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])

  return (
    <dialog
      ref={ref}
      // 見た目は従来の div のまま出したいので、dialog の既定（枠・余白・文字色）を消す
      className={`m-auto w-full rounded-card border-0 bg-surface p-0 text-ink shadow-lg backdrop:bg-black/40 ${className}`}
      role={alert ? 'alertdialog' : undefined}
      aria-labelledby={labelledBy}
      // `Esc` は cancel イベントで来る。閉じるのは React 側の役目（親が畳む）なので、
      // ブラウザに閉じさせず、状態の変更だけを親へ渡す
      onCancel={(e) => {
        e.preventDefault()
        onCancel()
      }}
      // 背景クリックで閉じる。`::backdrop` を押したときの target は dialog 自身になるので、
      // 中身を押した場合と区別が付く
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      {children}
    </dialog>
  )
}
