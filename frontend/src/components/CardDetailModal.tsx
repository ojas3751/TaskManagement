import { useEffect, useRef, useState } from 'react'
import type { Card, TaskList } from '../api/types'
import { toDueAtFields, toDueAtIso } from '../lib/dueAt'

const TITLE_MAX = 100
const DESCRIPTION_MAX = 5000

export type CardDetailInput = {
  title: string
  description: string
  due_at: string | null
  has_due_time: boolean
  /** 移動先のリスト（F-23）。変えなかった場合は今いるリストの id がそのまま入る */
  list_id: string
}

type Props = {
  card: Card
  /** そのタスクが今いるリスト */
  currentList: TaskList
  /** 移動先の選択肢。「完了」を含むすべてのリスト（機能仕様書 3.3） */
  lists: TaskList[]
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
 * タスクの詳細モーダル（画面設計 4章、F-07 / F-09）。
 *
 * リスト・タイトル・説明文・期限を編集できる。移動先の位置は選べず、末尾に付く。
 * 位置まで指定したい場合はドラッグ&ドロップ（F-13, Step 11）を使う。
 */
export function CardDetailModal({ card, currentList, lists, onSave, onCancel }: Props) {
  const [listId, setListId] = useState(currentList.id)
  const [title, setTitle] = useState(card.title)
  const [description, setDescription] = useState(card.description)
  const [due, setDue] = useState(() => toDueAtFields(card.due_at, card.has_due_time))
  // 「時刻を指定する」のチェック。has_due_time に対応する。
  // 時刻欄が空かどうかで代用しないのは、それだと「未入力」と「0時を指定した」を
  // 区別できないため（機能仕様書 2.4）
  const [hasDueTime, setHasDueTime] = useState(card.has_due_time)
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
    // 時刻の指定が外れていれば時分は送らない。00:00 として保存される
    const dueAt = toDueAtIso({ date: due.date, time: hasDueTime ? due.time : '' })

    onSave({
      list_id: listId,
      title: title.trim(),
      description,
      due_at: dueAt,
      // 日付が無いのに時刻の指定だけ残るとサーバーに弾かれる（DUE_TIME_WITHOUT_DUE_DATE）。
      // 弾かせずにここで整える。利用者にとっては「期限を消した」だけの操作なので、
      // エラーで知らせるようなことではない
      has_due_time: dueAt === null ? false : hasDueTime,
    })
  }

  /** 期限をクリアする（画面設計 4章）。日付・時刻・チェックをまとめて初期状態に戻す */
  const clearDue = () => {
    setDue({ date: '', time: '' })
    setHasDueTime(false)
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
          {/* タイトルより上に置く。そのタスクが今どこにあるかは、内容を読む前に
              把握したい情報だから。あわせて、Tab だけで選択欄 →[保存]へ到達できる
              並びになり、マウスを使わない移動が自然な順序になる（画面設計 4章） */}
          <label htmlFor="card-detail-list" className="block">
            リスト
          </label>
          <select
            id="card-detail-list"
            value={listId}
            onChange={(e) => setListId(e.target.value)}
            className="mt-1 mb-3 block rounded-card border border-line bg-surface px-2 py-1.5 focus:border-primary focus:outline-none"
          >
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.title}
              </option>
            ))}
          </select>

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

          <fieldset className="mt-3 min-w-0 border-0 p-0">
            <legend className="p-0">期限</legend>

            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input
                type="date"
                aria-label="期限の日付"
                value={due.date}
                onChange={(e) => setDue((prev) => ({ ...prev, date: e.target.value }))}
                className="rounded-card border border-line bg-surface px-2 py-1.5 focus:border-primary focus:outline-none"
              />
              <input
                type="time"
                aria-label="期限の時刻"
                value={due.time}
                // 日付が無ければ時刻だけ指定しても意味がないので、そこでも無効にする
                disabled={!hasDueTime || due.date === ''}
                onChange={(e) => setDue((prev) => ({ ...prev, time: e.target.value }))}
                className="rounded-card border border-line bg-surface px-2 py-1.5 focus:border-primary focus:outline-none disabled:bg-list-bg disabled:text-ink-sub"
              />
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={clearDue}
                disabled={due.date === ''}
                className="cursor-pointer rounded-card border border-line bg-surface px-2.5 py-1 hover:bg-list-bg disabled:cursor-default disabled:text-ink-sub disabled:hover:bg-surface"
              >
                期限をクリア
              </button>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={hasDueTime}
                  disabled={due.date === ''}
                  onChange={(e) => setHasDueTime(e.target.checked)}
                />
                時刻を指定する
              </label>
            </div>
          </fieldset>
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
