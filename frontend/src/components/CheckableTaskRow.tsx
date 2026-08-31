import type { Card } from '../api/types'
import { TaskCard } from './TaskCard'

type Props = {
  card: Card
  /** 「完了」列に置かれているか。TaskCard の色分けの上書きに使う（機能仕様書 2.7） */
  isDone: boolean
  /** チェックが入っているか。押した瞬間に行が消える使い方（F-22）では常に false */
  isChecked: boolean
  /** 読み上げ名。チェックの**意味**は列によって違うので、呼ぶ側が渡す */
  checkboxLabel: string
  /** 掴めなくするか（F-13）。TaskCard へ渡すのに加えて、チェックボックスも止める */
  isDragDisabled?: boolean
  /** 盤面で何かを掴んでいる最中か（#97）。運んでいる間はどのカードの詳細も開かせない */
  isDragActive?: boolean
  onCheck: (cardId: string, isChecked: boolean) => void
  onOpen: (cardId: string) => void
  onDelete: (cardId: string) => void
}

/**
 * チェックボックス付きのタスク1行。チェックボックスとカードを重ねて置く。
 *
 * **チェックの意味は列によって違う。**「完了」列では選択（F-15）、それ以外の列では
 * 「完了にする」（F-22）。**見せ方だけをここに置き、意味は呼ぶ側が決める。**
 * 露出の仕掛けを列ごとに書くと、片方だけ直して作法が食い違う。
 *
 * **チェックボックスはカードの下に隠しておき、ホバーかフォーカスで露出させる。**
 * 常時表示にすると、その列だけカードが狭くなるか、列の幅が他と揃わなくなる。この画面は
 * 列を横に見比べるためのものなので、列によって見た目が変わるのは避けたい。
 *
 * 露出するときはカードが**右へ 12px 寄る**。列の内側 264px に対してカードは 240px で
 * 中央にあるので、左右に 12px ずつ空いている。右へ 12px 寄せると左が 24px 空き、
 * チェックボックス（16px）とその間隔（8px）がちょうど収まる。**はみ出さず、切れもしない。**
 *
 * **寄ること自体も選択の合図として使う。** チェックの印だけでなく行の位置でも示すので、
 * 別のウィンドウが重なって見づらいときでも、選ばれている行が分かる。
 */
export function CheckableTaskRow({
  card,
  isDone,
  isChecked,
  checkboxLabel,
  isDragDisabled,
  isDragActive,
  onCheck,
  onOpen,
  onDelete,
}: Props) {
  /**
   * チェック済みなら常に露出させ、そうでなければホバー / フォーカスのときだけ露出させる。
   *
   * **group-hover ではなく素のクラスを当てて固定する**のがここの肝。チェックした行は、
   * ホバーを外しても戻らない。
   */
  const reveal = isChecked
    ? 'translate-x-3'
    : 'group-hover:translate-x-3 group-focus-within:translate-x-3'

  const checkboxReveal = isChecked
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
        checked={isChecked}
        onChange={(e) => onCheck(card.id, e.target.checked)}
        // 応答待ちの間は他の操作と同じく止める。**飛んでいるリクエストが常に1本**で
        // あることが、App の巻き戻しの前提になっている（#43）。
        //
        // **運んでいる最中も止める**（#97）。移動の途中に別の更新が挟まると、
        // 何がどこへ動いたのかが利用者にも追えなくなる。カードの方は
        // pointer-events で止まるが、**チェックボックスはカードの外にある**
        disabled={isDragDisabled || isDragActive}
        aria-label={checkboxLabel}
        // **left-0 にしない。** フォーカスの枠はチェックボックスの外側に描かれるため、
        // 左端に貼り付けるとその枠が列の外にはみ出し、スクロール領域に切り取られて
        // 「フォーカスが当たっているのに見えない」状態になる。4px 内側に置いて枠の分を空ける
        className={`absolute top-2 left-1 size-4 cursor-pointer transition-opacity duration-200 disabled:cursor-default motion-reduce:transition-none ${checkboxReveal}`}
      />
      <div
        className={`transition-transform duration-200 ease-out motion-reduce:transition-none ${reveal}`}
      >
        <TaskCard
          card={card}
          isDone={isDone}
          isDragDisabled={isDragDisabled}
          isDragActive={isDragActive}
          onOpen={onOpen}
          onDelete={onDelete}
        />
      </div>
    </div>
  )
}

