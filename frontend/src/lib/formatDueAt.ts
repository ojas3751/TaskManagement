import type { Card } from '../api/types'

const DATE_FORMAT = new Intl.DateTimeFormat('ja-JP', {
  month: '2-digit',
  day: '2-digit',
})

/** 今年と違う年のときだけ使う。年は4桁のまま（ゼロ埋めの対象外） */
const DATE_WITH_YEAR_FORMAT = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const TIME_FORMAT = new Intl.DateTimeFormat('ja-JP', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/**
 * 一覧に出す期限の文字列を作る（機能仕様書 2.5「期限の表示ルール」）。
 *
 * - 期限なし              → 空文字（行そのものは TaskCard 側で残す）
 * - 時刻の指定なし        → `08/15`
 * - 時刻の指定あり        → `08/10 09:00`
 * - 年が今年と異なるとき  → `2027/01/05`（時刻があれば `2027/01/05 09:00`）
 *
 * has_due_time が false のとき、DB には日付だけを意味する値が入っているが
 * 型としては timestamptz なので時分も乗っている。表示から時分を落とすのは
 * この関数の責務。
 *
 * @param now 「今年」の判定に使う日時。既定は現在時刻。テストから固定するために受け取る
 */
export function formatDueAt(
  card: Pick<Card, 'due_at' | 'has_due_time'>,
  now: Date = new Date(),
): string {
  if (card.due_at === null) return ''

  const due = new Date(card.due_at)
  if (Number.isNaN(due.getTime())) return ''

  // 年を出すかどうかは暦年の一致だけで決める。「12か月以内かどうか」ではない
  const isThisYear = due.getFullYear() === now.getFullYear()
  const date = isThisYear ? DATE_FORMAT.format(due) : DATE_WITH_YEAR_FORMAT.format(due)

  return card.has_due_time ? `${date} ${TIME_FORMAT.format(due)}` : date
}
