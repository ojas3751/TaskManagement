import type { Card } from '../api/types'
import { TaskCard } from './TaskCard'

type Props = {
  card: Card
  isSelected: boolean
  /** 掴めなくするか（F-13）。TaskCard へそのまま渡す */
  isDragDisabled?: boolean
  onToggle: (cardId: string, selected: boolean) => void
  onOpen: (cardId: string) => void
  onDelete: (cardId: string) => void
}

/**
 * 完了列のタスク1行。チェックボックスとカードを重ねて置く（F-15）。
 *
 * **チェックボックスはカードの下に隠しておき、ホバーかフォーカスで露出させる。**
 * 常時表示にすると、完了列だけカードが狭くなるか、列の幅が他と揃わなくなる。この画面は
 * 列を横に見比べるためのものなので、完了列だけ見た目が変わるのは避けたい。
 *
 * 露出するときはカードが**右へ 12px 寄る**。列の内側 264px に対してカードは 240px で
 * 中央にあるので、左右に 12px ずつ空いている。右へ 12px 寄せると左が 24px 空き、
 * チェックボックス（16px）とその間隔（8px）がちょうど収まる。**はみ出さず、切れもしない。**
 *
 * **寄ること自体も選択の合図として使う。** チェックの印だけでなく行の位置でも示すので、
 * 別のウィンドウが重なって見づらいときでも、選ばれている行が分かる。
 */
export function SelectableTaskRow({
  card,
  isSelected,
  isDragDisabled,
  onToggle,
  onOpen,
  onDelete,
}: Props) {
  /**
   * 選択済みなら常に露出させ、そうでなければホバー / フォーカスのときだけ露出させる。
   *
   * **group-hover ではなく素のクラスを当てて固定する**のがここの肝。チェックした行は、
   * ホバーを外しても戻らない。
   */
  const reveal = isSelected
    ? 'translate-x-3'
    : 'group-hover:translate-x-3 group-focus-within:translate-x-3'

  const checkboxReveal = isSelected
    ? 'opacity-100'
    : [
        // 隠れている間は押せなくする。opacity-0 は見えないだけで当たり判定が残るため、
        // 左の余白をクリックすると見えないチェックボックスが反応してしまう。
        // **キーボードのフォーカスは pointer-events では止まらない**ので、
        // group-focus-within での露出は生きる
        'pointer-events-none opacity-0',
        'group-hover:pointer-events-auto group-hover:opacity-100',
        'group-focus-within:pointer-events-auto group-focus-within:opacity-100',
        // **現れるときだけ遅らせる。** 列を縦にマウスで通過すると、行ごとに一瞬だけ
        // 現れて消える。素の状態には delay を置かないので、離れるときは即座に消える
        'group-hover:delay-300',
      ].join(' ')

  return (
    // ホバーを見るのは**この入れ物**であって、カードではない。カードを対象にすると、
    // 右へ寄った瞬間にポインタがカードの外に出て判定が切れ、戻ってまた寄る、を繰り返す。
    // 入れ物は動かないので、行の上にいる限り状態が変わらない
    <div className="group relative flex w-full justify-center">
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(e) => onToggle(card.id, e.target.checked)}
        aria-label={`「${card.title}」を選択`}
        // **left-0 にしない。** フォーカスの枠はチェックボックスの外側に描かれるため、
        // 左端に貼り付けるとその枠が列の外にはみ出し、スクロール領域に切り取られて
        // 「フォーカスが当たっているのに見えない」状態になる。4px 内側に置いて枠の分を空ける
        className={`absolute top-2 left-1 size-4 cursor-pointer transition-opacity duration-200 motion-reduce:transition-none ${checkboxReveal}`}
      />
      <div
        className={`transition-transform duration-200 ease-out motion-reduce:transition-none ${reveal}`}
      >
        <TaskCard
          card={card}
          isDone
          isDragDisabled={isDragDisabled}
          onOpen={onOpen}
          onDelete={onDelete}
        />
      </div>
    </div>
  )
}
