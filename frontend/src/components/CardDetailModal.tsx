import { useEffect, useRef, useState } from 'react'
import type { Card } from '../api/types'

const TITLE_MAX = 100
const DESCRIPTION_MAX = 5000

export type CardDetailInput = {
  title: string
  description: string
  due_at: string | null
  has_due_time: boolean
}

type Props = {
  card: Card
  onSave: (input: CardDetailInput) => void
  onCancel: () => void
}

/** 入力欄の右下に出す文字数カウンタ（E-01）。上限に達したら赤にする */
function CharCounter({ length, max }: { length: number; max: number }) {
  return (
    <p className={`m-0 mt-1 text-right ${length >= max ? 'text-danger' : 'text-ink-sub'}`}>
      {length}/{max}
    </p>
  )
}

/**
 * タスクの詳細モーダル（画面設計 4章、F-07）。
 *
 * この段階ではタイトルと説明文を編集できる。**期限の入力欄は Step 5（F-09）、
 * リストの選択欄は Step 8（F-23）で足す。**
 *
 * 期限の2項目は編集できないが、受け取った値をそのまま送り返す。API が部分更新を
 * 採らず「4項目を毎回送る」と決めているため（api.md 3.7）、送らないという選択肢が
 * そもそも無い。
 */
export function CardDetailModal({ card, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(card.title)
  const [description, setDescription] = useState(card.description)
  // 空欄の警告は「保存を試みた後」だけ出す。開いた直後から赤字が出ていると、
  // まだ何もしていない利用者を叱っているように見えるため
  const [submitted, setSubmitted] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)

  // Escape はモーダル内にフォーカスが無くても効かせたいので、window で拾う
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  // 開いたときのフォーカスは説明文に置く。タスクを開く動機はたいてい説明文の
  // 読み書きであり、タイトルは一覧に出ているので開く前から見えている。
  //
  // select() ではなく focus() にして、キャレットを末尾へ送る。全選択された状態だと、
  // 続きを書くつもりで打った1文字が既存の説明文を丸ごと消してしまう
  useEffect(() => {
    const textarea = descriptionRef.current
    if (!textarea) return
    textarea.focus()
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)
  }, [])

  const isEmpty = title.trim() === ''

  const submit = () => {
    setSubmitted(true)
    if (isEmpty) {
      titleRef.current?.focus()
      return
    }
    onSave({
      title: title.trim(),
      description,
      due_at: card.due_at,
      has_due_time: card.has_due_time,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"
      // 背景クリックで閉じる。モーダル本体のクリックが浮上してきた場合は無視する
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-detail-modal-title"
        className="flex max-h-full w-full max-w-140 flex-col rounded-card bg-surface shadow-lg"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 id="card-detail-modal-title" className="m-0 text-base font-bold">
            タスクの詳細
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

        {/* 説明文が長いとモーダルが画面からはみ出すので、中身だけスクロールさせる */}
        <div className="overflow-y-auto px-4 py-3">
          <label htmlFor="card-detail-title" className="block">
            タイトル
          </label>
          <input
            id="card-detail-title"
            ref={titleRef}
            type="text"
            value={title}
            // 上限は maxLength 属性だけに任せず onChange でも切る。属性はキー入力を
            // 止めてくれるが、貼り付けは拒否せず上限までで切り詰める仕様（E-02）なので、
            // 実際に値を組み立てるここで揃えておく
            maxLength={TITLE_MAX}
            onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
            className="mt-1 w-full rounded-card border border-line bg-surface px-2 py-1.5 focus:border-primary focus:outline-none"
          />
          <div className="flex items-start justify-between gap-3">
            <p className="m-0 mt-1 text-danger" role="alert">
              {submitted && isEmpty ? '入力してください。' : ''}
            </p>
            <CharCounter length={title.length} max={TITLE_MAX} />
          </div>

          <label htmlFor="card-detail-description" className="mt-3 block">
            説明文
          </label>
          {/* textarea は改行をそのまま値に含む。保存した改行が再表示でも残る（F-07） */}
          <textarea
            id="card-detail-description"
            ref={descriptionRef}
            value={description}
            rows={8}
            maxLength={DESCRIPTION_MAX}
            onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
            className="mt-1 w-full resize-y rounded-card border border-line bg-surface px-2 py-1.5 focus:border-primary focus:outline-none"
          />
          <CharCounter length={description.length} max={DESCRIPTION_MAX} />
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
