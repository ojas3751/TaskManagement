import { useEffect, useRef, useState } from 'react'
import { ModalDialog } from './ModalDialog'
import { NameField } from './NameField'

type Props = {
  /** 見出し。「タスクの追加」「リストの追加」など */
  title: string
  /** 入力欄のラベル。「タイトル」「リスト名」 */
  label: string
  /** 文字数の上限。タスク名は100、リスト名は50 */
  maxLength: number
  /** 実行ボタンの文言。「追加」「保存」 */
  submitLabel: string
  /** 初期値。リスト名の変更（F-03）では現在の名前を渡す */
  initialValue?: string
  onSubmit: (value: string) => void
  onCancel: () => void
}

/**
 * 名前をひとつ入力するモーダル（画面設計 5章）。
 *
 * タスクの追加（F-06）・リストの追加（F-02）・リスト名の変更（F-03）で共通に使う。
 * 違うのは文言と上限だけなので、それらは props で受ける。
 *
 * prompt() を使わないのは、文字数カウンタ（E-01）を出せず仕様を満たせないため
 * （機能仕様書「誤操作・エラーへの対策」）。
 */
export function NameInputModal({
  title,
  label,
  maxLength,
  submitLabel,
  initialValue = '',
  onSubmit,
  onCancel,
}: Props) {
  const [value, setValue] = useState(initialValue)
  // 空欄の警告は「確定を試みた後」だけ出す。開いた直後から赤字が出ていると、
  // まだ何もしていない利用者を叱っているように見えるため
  const [submitted, setSubmitted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.select()
  }, [])

  const isEmpty = value.trim() === ''

  const submit = () => {
    setSubmitted(true)
    if (isEmpty) {
      inputRef.current?.focus()
      return
    }
    onSubmit(value.trim())
  }

  return (
    <ModalDialog labelledBy="name-input-modal-title" onCancel={onCancel}>
      <form
        onSubmit={(e) => {
          // form にしておくと Enter での確定がブラウザ側の挙動として付いてくる
          e.preventDefault()
          submit()
        }}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 id="name-input-modal-title" className="m-0 text-base font-bold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="閉じる"
            className="cursor-pointer border-0 bg-transparent px-1 text-lg leading-none text-ink-sub hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-3">
          <NameField
            id="name-input-modal-field"
            label={label}
            value={value}
            onChange={setValue}
            maxLength={maxLength}
            showEmptyError={submitted}
            inputRef={inputRef}
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded-card border border-line bg-surface px-2.5 py-1 hover:bg-list-bg"
          >
            キャンセル
          </button>
          <button
            type="submit"
            className="cursor-pointer rounded-card border border-primary bg-primary px-2.5 py-1 text-primary-ink hover:bg-[#094a8b]"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </ModalDialog>
  )
}
