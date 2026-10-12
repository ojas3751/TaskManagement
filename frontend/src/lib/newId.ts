/**
 * 新しいリスト・タスクの ID（UUID v4）を作る。
 *
 * <p>`crypto.randomUUID()` は使わない。あれは安全なコンテキスト（HTTPS か localhost）でしか
 * 定義されず、`http://<IP>` で開く本番（EC2）では関数そのものが無いため、追加の操作が
 * 例外で止まる（#134）。`crypto.getRandomValues()` は安全でないコンテキストでも使え、
 * 乱数の質は同じ（どちらも暗号用の乱数）。
 *
 * <p>環境で道を分けず常にこちらを通すのは、開発（localhost）と本番で同じコードが
 * 動くようにするため。分けると本番だけが通る道を開発で試せない。
 */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))

  // RFC 9562 の v4：7 バイト目の上位 4 ビットが版（0100）、9 バイト目の上位 2 ビットが変種（10）
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
