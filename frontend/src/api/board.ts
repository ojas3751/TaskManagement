import type { ApiError, Board } from './types'

/**
 * サーバー側が返したエラー。
 * ネットワーク自体の失敗（バックエンド未起動など）とは区別したいので、
 * fetch の reject をそのまま流さず、こちらは独自の型で投げる。
 */
export class BoardApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'BoardApiError'
    this.status = status
    this.code = code
  }
}

/**
 * ボード・リスト・タスクを一括で取得する（F-01）。
 *
 * パスは相対にしておく。開発中は Vite の proxy が :8080 へ転送し、
 * 本番でも同一オリジンから配信する前提のため、ホストを書く必要がない。
 */
export async function fetchBoard(): Promise<Board> {
  const res = await fetch('/api/board')

  if (!res.ok) {
    // エラー本体が読めない場合（HTML のエラーページなど）もあるため、
    // 解析の失敗でここが落ちないようにする
    let body: Partial<ApiError> = {}
    try {
      body = (await res.json()) as Partial<ApiError>
    } catch {
      // 解析できなければ status だけで伝える
    }
    throw new BoardApiError(
      res.status,
      body.code ?? 'UNKNOWN',
      body.message ?? `ボードを取得できませんでした（HTTP ${res.status}）。`,
    )
  }

  return (await res.json()) as Board
}
