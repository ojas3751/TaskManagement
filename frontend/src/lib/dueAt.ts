/**
 * 詳細モーダルの入力欄と API のあいだで期限を変換する。
 *
 * 画面の `<input type="date">` / `<input type="time">` が扱うのは `2026-08-30` と
 * `09:00` という文字列だが、API がやりとりするのはオフセット付きの ISO 8601
 * （`2026-08-30T09:00:00+09:00`）である（docs/design/api.md 2.6）。
 *
 * この変換をモーダルの中に書かないのは、表示側の formatDueAt と対になる処理が
 * 別々の場所に散るため。往復で辻褄が合っているかは、この 2 つを並べて見たい。
 */

/** 入力欄が扱う形。期限なしはどちらも空文字 */
export type DueAtFields = {
  /** `YYYY-MM-DD`。空文字は期限なし */
  date: string
  /** `HH:mm`。has_due_time が false のときは空文字 */
  time: string
}

const pad = (value: number) => String(value).padStart(2, '0')

/**
 * API の値を入力欄の形に開く。
 *
 * 現地時刻で読む。DB には `+09:00` が付いた値が入っているが、利用者が入力欄で
 * 見たいのは自分の時計に合わせた日付と時刻なので、Date に解釈させる。
 */
export function toDueAtFields(dueAt: string | null, hasDueTime: boolean): DueAtFields {
  if (dueAt === null) return { date: '', time: '' }

  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return { date: '', time: '' }

  const date = `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`
  // 時刻を指定していないタスクの時分は 00:00 でしかない。開いても意味がないので出さない
  const time = hasDueTime ? `${pad(due.getHours())}:${pad(due.getMinutes())}` : ''

  return { date, time }
}

/**
 * 入力欄の値を API に送る形へ組み立てる。
 *
 * 日付が空なら「期限なし」。時刻が空なら 00:00 として扱う（機能仕様書 2.4）。
 *
 * `new Date(...).toISOString()` を使わないのは、それが UTC に正規化した `Z` 付きの
 * 文字列を返すため。値としては同じ瞬間だが、設計書が定めた `+09:00` の形と違ってしまう。
 * オフセットは実行環境のものを自分で組み立てる。
 */
export function toDueAtIso(fields: DueAtFields): string | null {
  if (fields.date === '') return null

  const [year, month, day] = fields.date.split('-').map(Number)
  const [hour, minute] = fields.time === '' ? [0, 0] : fields.time.split(':').map(Number)

  const due = new Date(year, month - 1, day, hour, minute, 0, 0)

  // getTimezoneOffset は「UTC からどれだけ引くか」を分で返すので、符号が直感と逆になる。
  // UTC+9 では -540。表示したいのは +09:00 なので、符号を反転させる
  const offsetMinutes = -due.getTimezoneOffset()
  const sign = offsetMinutes < 0 ? '-' : '+'
  const offset = `${sign}${pad(Math.floor(Math.abs(offsetMinutes) / 60))}:${pad(Math.abs(offsetMinutes) % 60)}`

  return `${fields.date}T${pad(hour)}:${pad(minute)}:00${offset}`
}
