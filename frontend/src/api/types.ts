/**
 * バックエンドの BoardResponse に対応する型。
 *
 * application.properties で SNAKE_CASE を指定しているため、JSON のキーは
 * snake_case で届く。ここで camelCase に変換する層は作らない
 * （変換のためだけの層は、対応表を二重に持つことになるため）。
 *
 * API の仕様は docs/design/api.md を参照。
 */

export type Card = {
  id: string
  title: string
  description: string
  /** ISO8601（オフセット付き）。期限なしは null */
  due_at: string | null
  /** false なら時刻は未指定。表示からも時分を落とす */
  has_due_time: boolean
  position: number
}

export type TaskList = {
  id: string
  title: string
  /** デフォルトの3列（TODO / 進行中 / 完了）かどうか */
  is_default: boolean
  /** 「完了」列。常に右端に固定される */
  is_fixed_last: boolean
  position: number
  cards: Card[]
}

export type Board = {
  id: string
  title: string
  lists: TaskList[]
}

/** エラー応答の本体（backend の ApiErrorResponse） */
export type ApiError = {
  code: string
  message: string
  field: string | null
}
