import type { RefObject } from 'react'

type Props = {
  /** 入力欄のラベル。「タイトル」「リスト名」 */
  label: string
  value: string
  onChange: (value: string) => void
  /** 文字数の上限。タスク名は100、リスト名は50 */
  maxLength: number
  /** 空欄の警告を出すか。確定を試みた後だけ true にする */
  showEmptyError: boolean
  inputRef?: RefObject<HTMLInputElement | null>
  /** 入力欄の id。1画面に複数置く場合に備えて受け取る */
  id: string
}

/**
 * 名前をひとつ入れる入力欄（画面設計 5章）。
 *
 * 名前の入力モーダル（F-02, F-06）とリストの詳細モーダル（F-03）で共通に使う。
 * **文字数カウンタ（E-01）と貼り付けの切り詰め（E-02）をここ1箇所に置く**ため、
 * モーダルごとに書き写さない。ずれると、片方だけ仕様を満たさない状態になる。
 */
export function NameField({
  label,
  value,
  onChange,
  maxLength,
  showEmptyError,
  inputRef,
  id,
}: Props) {
  const isEmpty = value.trim() === ''
  const isAtLimit = value.length >= maxLength

  return (
    <>
      <label htmlFor={id} className="block">
        {label}
      </label>
      <input
        id={id}
        ref={inputRef}
        type="text"
        value={value}
        // 上限は maxLength 属性だけに任せず onChange でも切る。属性はキー入力を
        // 止めてくれるが、貼り付けは拒否せず上限までで切り詰める仕様（E-02）なので、
        // 実際に値を組み立てるここで揃えておく
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
        className="mt-1 w-full rounded-card border border-line bg-surface px-2 py-1.5 focus:border-primary focus:outline-none"
      />

      <div className="mt-1 flex items-start justify-between gap-3">
        <p className="m-0 text-danger" role="alert">
          {showEmptyError && isEmpty ? '入力してください。' : ''}
        </p>
        {/* 文字数カウンタ（E-01）。上限に達したら赤にする */}
        <p className={`m-0 shrink-0 ${isAtLimit ? 'text-danger' : 'text-ink-sub'}`}>
          {value.length}/{maxLength}
        </p>
      </div>
    </>
  )
}
