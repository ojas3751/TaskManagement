import { describe, expect, it } from 'vitest'
import { formatDueAt } from './formatDueAt'

/**
 * 期限の表示ルール（機能仕様書 2.5）。
 *
 * 「今年」は現在時刻に依存するため、now を固定して渡す。実行した年によって
 * 結果が変わるテストは、来年になった朝に理由もなく落ちる。
 */
const NOW = new Date('2026-08-25T12:00:00+09:00')

describe('formatDueAt', () => {
  it('期限が無ければ空文字を返す', () => {
    expect(formatDueAt({ due_at: null, has_due_time: false }, NOW)).toBe('')
  })

  it('時刻の指定が無ければ時分を出さない', () => {
    const card = { due_at: '2026-08-20T00:00:00+09:00', has_due_time: false }
    expect(formatDueAt(card, NOW)).toBe('08/20')
  })

  it('時刻の指定があれば時分まで出す', () => {
    const card = { due_at: '2026-08-20T15:00:00+09:00', has_due_time: true }
    expect(formatDueAt(card, NOW)).toBe('08/20 15:00')
  })

  it('月日も時分もゼロ埋めする', () => {
    const card = { due_at: '2026-01-05T09:05:00+09:00', has_due_time: true }
    expect(formatDueAt(card, NOW)).toBe('01/05 09:05')
  })

  it('今年と異なる年なら年を出す', () => {
    const card = { due_at: '2027-01-05T00:00:00+09:00', has_due_time: false }
    expect(formatDueAt(card, NOW)).toBe('2027/01/05')
  })

  it('過去の年でも年を出す', () => {
    const card = { due_at: '2025-12-31T00:00:00+09:00', has_due_time: false }
    expect(formatDueAt(card, NOW)).toBe('2025/12/31')
  })

  it('年をまたいでも「今年かどうか」だけで決める', () => {
    // 大晦日から見れば翌日でも、年が違えば年を出す。
    // 「12か月以内か」ではなく暦年の一致で判定していることの確認
    const newYearsEve = new Date('2026-12-31T12:00:00+09:00')
    const card = { due_at: '2027-01-01T00:00:00+09:00', has_due_time: false }
    expect(formatDueAt(card, newYearsEve)).toBe('2027/01/01')
  })

  it('年を出すときも時分は付く', () => {
    const card = { due_at: '2027-01-05T09:00:00+09:00', has_due_time: true }
    expect(formatDueAt(card, NOW)).toBe('2027/01/05 09:00')
  })

  it('壊れた値なら空文字を返す', () => {
    expect(formatDueAt({ due_at: 'これは日時ではない', has_due_time: true }, NOW)).toBe('')
  })
})
