import type { Card } from '../api/types'
import { formatDueAt } from '../lib/formatDueAt'

type Props = {
  card: Card
  onOpen: (cardId: string) => void
}

/**
 * 一覧に出すタスク（画面設計 2章）。
 * 表示するのはタイトルと期限だけで、説明文は出さない。
 *
 * ボーダーは期限による色分け（F-11, Step 6）で色が付く場所。
 * 今は透明にしておくが、幅は先に確保する。あとから幅が増えると
 * カードの大きさが変わってしまうため。
 */
export function TaskCard({ card, onOpen }: Props) {
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
      {/* 期限が無くても行は残す。有無で高さが変わると縦の並びがばらつく */}
      <p className="m-0 mt-0.5 min-h-5 text-xs tabular-nums text-ink-sub">
        {due}
      </p>
    </article>
  )
}
