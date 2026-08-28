import { useEffect, useRef, useState } from 'react'
import type { TaskList } from '../api/types'
import { NameField } from './NameField'

type Props = {
  list: TaskList
  onSave: (title: string) => void
  onDelete: () => void
  onCancel: () => void
}

/**
 * リストの詳細モーダル（F-03, F-04）。
 *
 * **リスト名の変更専用ではなく「そのリストを管理する場所」として置く。** タスクに
 * CardDetailModal があるのと同じ形で、対象を開いて状態をまとめて扱う作法を1つに
 * 揃えるため。
 *
 * **削除をここに置く理由。** 列の削除は滅多にやらず、中のタスクごと消える。列見出しの
 * 行にゴミ箱を並べると、滅多に使わないものが常に目に入り、押しやすい位置に居座る。
 * ひと手間奥に置く方がこの操作に合う。
 *
 * **タスクの削除がカード上にあるのとは非対称だが、意図的。** タスクの削除は日常的で
 * 件数が多く、リストの削除は稀で影響が大きい。頻度と危険度が逆なので、置き場所が違う
 * （画面設計 6章）。
 *
 * **置き場所ができたことを理由に機能を足さない。** いま置くのは名前と削除だけ。
 */
export function ListDetailModal({ list, onSave, onDelete, onCancel }: Props) {
  const [title, setTitle] = useState(list.title)
  // 空欄の警告は「保存を試みた後」だけ出す（NameInputModal と同じ）
  const [submitted, setSubmitted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  useEffect(() => {
    inputRef.current?.select()
  }, [])

  const submit = () => {
    setSubmitted(true)
    if (title.trim() === '') {
      inputRef.current?.focus()
      return
    }
    onSave(title.trim())
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="list-detail-modal-title"
        className="w-full max-w-100 rounded-card bg-surface shadow-lg"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 id="list-detail-modal-title" className="m-0 text-base font-bold">
            リストの詳細
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
            id="list-detail-modal-title-field"
            label="リスト名"
            value={title}
            onChange={setTitle}
            maxLength={50}
            showEmptyError={submitted}
            inputRef={inputRef}
          />
        </div>

        {/* 削除は保存とは別の区画に置く。並べると押し間違えるため。
            確認は別のモーダル（ConfirmModal）で受ける */}
        <div className="border-t border-line px-4 py-3">
          <button
            type="button"
            onClick={onDelete}
            className="cursor-pointer rounded-card border border-danger bg-surface px-2.5 py-1 text-danger hover:bg-danger hover:text-danger-ink"
          >
            このリストを削除
          </button>
          {/* 何が失われるかを、確認モーダルを開く前に見せる（F-04） */}
          <p className="m-0 mt-1 text-ink-sub">
            {list.cards.length === 0
              ? '中にタスクはありません。'
              : `中のタスク${list.cards.length}件も一緒に削除されます。`}
          </p>
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
            保存
          </button>
        </div>
      </form>
    </div>
  )
}
