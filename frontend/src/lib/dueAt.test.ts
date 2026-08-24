import { describe, expect, it } from 'vitest'
import { toDueAtFields, toDueAtIso } from './dueAt'

/**
 * 入力欄と API のあいだの変換（F-09）。
 *
 * このテストは実行環境のタイムゾーンが Asia/Tokyo であることを前提にしている。
 * オフセットの組み立てを確かめる以上、どこかの時間帯に足を着けざるを得ない。
 * 開発機も compose.yaml の DB も Asia/Tokyo で揃えている。
 */
describe('toDueAtFields', () => {
  it('期限が無ければどちらも空文字', () => {
    expect(toDueAtFields(null, false)).toEqual({ date: '', time: '' })
  })

  it('時刻の指定が無ければ時刻欄は空にする', () => {
    // 00:00 を開いても「未入力」と区別が付かないので出さない
    expect(toDueAtFields('2026-08-20T00:00:00+09:00', false)).toEqual({
      date: '2026-08-20',
      time: '',
    })
  })

  it('時刻の指定があれば時刻欄に入れる', () => {
    expect(toDueAtFields('2026-08-20T15:30:00+09:00', true)).toEqual({
      date: '2026-08-20',
      time: '15:30',
    })
  })

  it('月日も時分もゼロ埋めする', () => {
    expect(toDueAtFields('2026-01-05T09:05:00+09:00', true)).toEqual({
      date: '2026-01-05',
      time: '09:05',
    })
  })

  it('壊れた値なら空文字にする', () => {
    expect(toDueAtFields('これは日時ではない', true)).toEqual({ date: '', time: '' })
  })
})

describe('toDueAtIso', () => {
  it('日付が空なら期限なし', () => {
    expect(toDueAtIso({ date: '', time: '09:00' })).toBeNull()
  })

  it('時刻が空なら 00:00 として組み立てる', () => {
    expect(toDueAtIso({ date: '2026-08-20', time: '' })).toBe('2026-08-20T00:00:00+09:00')
  })

  it('時刻があればその値で組み立てる', () => {
    expect(toDueAtIso({ date: '2026-08-20', time: '15:30' })).toBe('2026-08-20T15:30:00+09:00')
  })

  it('UTC に正規化せず、オフセット付きのまま返す', () => {
    // toISOString() を使うと "2026-08-20T00:30:00Z" になってしまう。
    // 値としては同じ瞬間だが、設計書が定めた形（api.md 2.6）と違う
    expect(toDueAtIso({ date: '2026-08-20', time: '09:30' })).not.toContain('Z')
    expect(toDueAtIso({ date: '2026-08-20', time: '09:30' })).toContain('+09:00')
  })
})

describe('往復', () => {
  it('開いて組み立て直しても元の値に戻る', () => {
    const original = '2026-01-05T09:05:00+09:00'
    const fields = toDueAtFields(original, true)
    expect(toDueAtIso(fields)).toBe(original)
  })

  it('時刻の指定が無いタスクは 00:00 に戻る', () => {
    const original = '2026-08-20T00:00:00+09:00'
    const fields = toDueAtFields(original, false)
    expect(toDueAtIso(fields)).toBe(original)
  })
})
