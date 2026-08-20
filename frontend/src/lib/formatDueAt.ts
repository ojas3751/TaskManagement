import type { Card } from '../api/types'

const DATE_FORMAT = new Intl.DateTimeFormat('ja-JP', {
  month: '2-digit',
  day: '2-digit',
})

const TIME_FORMAT = new Intl.DateTimeFormat('ja-JP', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/**
 * 一覧に出す期限の文字列を作る（画面設計 2章）。
 *
 * - 期限なし        → 空文字（行そのものは TaskCard 側で残す）
 * - 時刻の指定なし  → `08/15`
 * - 時刻の指定あり  → `08/10 09:00`
 *
 * has_due_time が false のとき、DB には日付だけを意味する値が入っているが
 * 型としては timestamptz なので時分も乗っている。表示から時分を落とすのは
 * この関数の責務。
 */
export function formatDueAt(card: Pick<Card, 'due_at' | 'has_due_time'>): string {
  if (card.due_at === null) return ''

  const due = new Date(card.due_at)
  if (Number.isNaN(due.getTime())) return ''

  const date = DATE_FORMAT.format(due)
  return card.has_due_time ? `${date} ${TIME_FORMAT.format(due)}` : date
}
