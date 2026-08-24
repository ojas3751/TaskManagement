import type { Card } from '../api/types'
import { formatDueAt } from '../lib/formatDueAt'

type Props = {
  card: Card
  onOpen: (cardId: string) => void
  onDelete: (cardId: string) => void
}

/**
 * ゴミ箱アイコン（F-08）。
 *
 * fill / stroke を currentColor にしてあるので、色は置かれた場所の文字色に従う。
 * 期限による色分け（F-11, Step 6）で赤背景＋白文字になったタスクでも、完了列の
 * 薄いグレー＋黒文字でも、そのまま判別できる状態を保つための作り。
 */
function TrashIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M2.5 4h11" />
      <path d="M6.5 2.5h3" />
      <path d="M4 4l.7 9a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L12 4" />
      <path d="M6.6 6.5v5M9.4 6.5v5" />
    </svg>
  )
}

/**
 * 一覧に出すタスク（画面設計 2章）。
 * 表示するのはタイトルと期限だけで、説明文は出さない。
 *
 * ボーダーは期限による色分け（F-11, Step 6）で色が付く場所。
 * 今は透明にしておくが、幅は先に確保する。あとから幅が増えると
 * カードの大きさが変わってしまうため。
 */
export function TaskCard({ card, onOpen, onDelete }: Props) {
  const due = formatDueAt(card)

  return (
    <article className="rounded-card border-[3px] border-transparent bg-surface p-2 shadow-[0_1px_1px_rgba(9,30,66,0.2)]">
      {/* クリックできるのはタイトル部分（画面設計 4章）。カード全体をボタンにすると、
          期限の行に置く削除アイコン（F-08, #26）がボタンの入れ子になってしまう */}
      <h3 className="m-0 font-semibold">
        <button
          type="button"
          onClick={() => onOpen(card.id)}
          className="w-full cursor-pointer border-0 bg-transparent p-0 text-left font-semibold text-ink [overflow-wrap:anywhere] hover:underline"
        >
          {card.title}
        </button>
      </h3>
      {/* 期限が無くても行は残す。有無で高さが変わると縦の並びがばらつく。
          ゴミ箱アイコンはこの行の右端に常時表示する（画面設計 2章、F-08） */}
      <div className="mt-0.5 flex min-h-5 items-center justify-between gap-2">
        <p className="m-0 text-xs tabular-nums text-ink-sub">{due}</p>
        <button
          type="button"
          onClick={() => onDelete(card.id)}
          aria-label={`「${card.title}」を削除`}
          className="shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none text-ink-sub hover:text-danger"
        >
          <TrashIcon />
        </button>
      </div>
    </article>
  )
}
