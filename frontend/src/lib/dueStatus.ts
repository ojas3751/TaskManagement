import type { Card } from '../api/types'

/**
 * 期限による色分けの区分（機能仕様書 2.6）。
 *
 * - `overdue` … 期限超過・当日。赤ボーダー＋赤背景＋白文字
 * - `tomorrow` … 翌日。赤ボーダーのみ
 * - `soon` … 2〜3日以内。黄ボーダーのみ
 * - `none` … 4日以降、または期限なし
 */
export type DueStatus = 'overdue' | 'tomorrow' | 'soon' | 'none'

/** その日の 00:00 を表す Date を返す。日付だけを比べたいときの土台 */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * 期限から色分けの区分を決める。
 *
 * <p>比較は暦日で行う。仕様は「判定は時刻単位」と書いているが、**期限超過と当日は
 * 見た目が同一**と定めているため、両者を分ける必要がない。当日の 18:00 が期限のタスクを
 * 朝に見ても夜に見ても赤なので、時刻まで見ても結果が変わらない。
 *
 * <p>時分が未入力のタスクは 00:00 を持つ。時刻で比べると当日中ずっと「期限超過」になるが、
 * これも当日と同じ赤なので差は出ない。
 *
 * @param now 判定の基準日時。既定は現在時刻。テストから固定するために受け取る
 */
export function dueStatus(
  card: Pick<Card, 'due_at' | 'has_due_time'>,
  now: Date = new Date(),
): DueStatus {
  if (card.due_at === null) return 'none'

  const due = new Date(card.due_at)
  if (Number.isNaN(due.getTime())) return 'none'

  // 夏時間のある地域では 1 日が 24 時間でない日があるため、丸めてから日数にする。
  // 日本では起きないが、丸めておけば時差の扱いを気にせず読める
  const days = Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / MS_PER_DAY)

  if (days <= 0) return 'overdue'
  if (days === 1) return 'tomorrow'
  if (days <= 3) return 'soon'
  return 'none'
}
