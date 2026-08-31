/**
 * 挿入位置の線（画面設計 3章）。**タスクにも列にも同じものを使う。**
 *
 * **どこに落ちるかを、指を離す前に見せる。** 落ちた場所が予想と違うと、利用者は毎回
 * 結果を確認してからやり直すことになる。
 *
 * 線だけで示し、掴んでいるもの以外は動かさない。dnd-kit の標準は「他のものが動いて隙間が
 * 空く」だが、**タスクでは列をまたぐと効かない**（並び替えの範囲が列ごとに別々のため）。
 * 線なら同じ見せ方で両方を扱える。**列の並び替え（F-21）でも線にしたのは、盤面の中で
 * 落ち先の見せ方を1つに揃えるため。**
 *
 * 高さ（横向きなら幅）のぶんだけ並びが動かないよう、**場所を取らずに描く**（負のマージン）。
 * 線が出た瞬間に 2px ずつずれると、それ自体が落ち先の誤解を生む。
 *
 * @param orientation `horizontal` は縦に積むタスクの間（横線）、`vertical` は横に並ぶ
 *   列の間（縦線）。**線の向きではなく、並びの向きでもなく、「線そのものの向き」で言う**
 */
export function InsertionLine({
  orientation = 'horizontal',
}: {
  orientation?: 'horizontal' | 'vertical'
}) {
  return (
    <div
      aria-hidden="true"
      className={
        orientation === 'horizontal'
          ? 'pointer-events-none -my-px h-0.5 rounded-full bg-ink'
          : // 列の高さは中身なりなので、self-stretch で並びの高さに合わせる
            'pointer-events-none -mx-px w-0.5 shrink-0 self-stretch rounded-full bg-ink'
      }
    />
  )
}
