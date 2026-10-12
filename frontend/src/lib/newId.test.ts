import { afterEach, describe, expect, it, vi } from 'vitest'
import { newId } from './newId'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('newId', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('UUID v4 の形式で返す', () => {
    expect(newId()).toMatch(UUID_V4)
  })

  it('呼ぶたびに違う値を返す', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()))

    expect(ids.size).toBe(1000)
  })

  it('乱数が全ビット 0 でも 1 でも、版と変種のビットを正しく立てる', () => {
    for (const fill of [0x00, 0xff]) {
      vi.spyOn(crypto, 'getRandomValues').mockImplementationOnce((array) => {
        new Uint8Array(array.buffer, array.byteOffset, array.byteLength).fill(fill)
        return array
      })

      expect(newId()).toMatch(UUID_V4)
    }
  })

  // #134：http://<IP> で開くと randomUUID が定義されない。それでも動くこと
  it('crypto.randomUUID が無い環境（安全でないコンテキスト）でも作れる', () => {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new TypeError('crypto.randomUUID is not a function')
    })

    expect(newId()).toMatch(UUID_V4)
  })
})
