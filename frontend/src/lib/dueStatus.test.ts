import { describe, expect, it } from 'vitest'
import { dueStatus } from './dueStatus'

/**
 * 期限による色分けの区分（機能仕様書 2.6）。
 *
 * 基準日時を固定して渡す。現在時刻に依存させると、実行した日によって結果が変わる。
 */
const NOW = new Date('2026-08-25T12:00:00+09:00')

/** 時刻の指定なし（00:00）で日付だけを持つタスクを作る */
const on = (date: string) => ({ due_at: `${date}T00:00:00+09:00`, has_due_time: false })

describe('dueStatus', () => {
  it('期限が無ければ none', () => {
    expect(dueStatus({ due_at: null, has_due_time: false }, NOW)).toBe('none')
  })

  it('当日は overdue', () => {
    expect(dueStatus(on('2026-08-25'), NOW)).toBe('overdue')
  })

  it('前日までは overdue', () => {
    expect(dueStatus(on('2026-08-24'), NOW)).toBe('overdue')
    expect(dueStatus(on('2025-01-01'), NOW)).toBe('overdue')
  })

  it('当日のこれから来る時刻でも overdue', () => {
    // 当日と期限超過は見た目が同じなので、時刻で分ける必要がない。
    // 朝に見ても夜に見ても赤である
    const card = { due_at: '2026-08-25T18:00:00+09:00', has_due_time: true }
    expect(dueStatus(card, NOW)).toBe('overdue')
  })

  it('翌日は tomorrow', () => {
    expect(dueStatus(on('2026-08-26'), NOW)).toBe('tomorrow')
  })

  it('2日後と3日後は soon', () => {
    expect(dueStatus(on('2026-08-27'), NOW)).toBe('soon')
    expect(dueStatus(on('2026-08-28'), NOW)).toBe('soon')
  })

  it('4日後からは none', () => {
    expect(dueStatus(on('2026-08-29'), NOW)).toBe('none')
    expect(dueStatus(on('2027-01-01'), NOW)).toBe('none')
  })

  it('月をまたいでも暦日で数える', () => {
    const monthEnd = new Date('2026-08-31T12:00:00+09:00')
    expect(dueStatus(on('2026-09-01'), monthEnd)).toBe('tomorrow')
    expect(dueStatus(on('2026-09-03'), monthEnd)).toBe('soon')
    expect(dueStatus(on('2026-09-04'), monthEnd)).toBe('none')
  })

  it('日をまたぐ直前でも時刻ではなく暦日で決まる', () => {
    // 23:59 から見た「翌日の 00:01」は 2 分後だが、暦日では翌日なので tomorrow。
    // 残り時間ではなく日付で区切るという仕様の確認
    const lateNight = new Date('2026-08-25T23:59:00+09:00')
    const card = { due_at: '2026-08-26T00:01:00+09:00', has_due_time: true }
    expect(dueStatus(card, lateNight)).toBe('tomorrow')
  })

  it('壊れた値なら none', () => {
    expect(dueStatus({ due_at: 'これは日時ではない', has_due_time: true }, NOW)).toBe('none')
  })
})
