import { useSortable } from '@dnd-kit/sortable'
import type { CSSProperties, KeyboardEvent } from 'react'
import type { Card } from '../api/types'
import { dueStatus } from '../lib/dueStatus'
import { formatDueAt } from '../lib/formatDueAt'

type Props = {
  card: Card
  /** 「完了」列に置かれているか。true なら期限による色分けを上書きする（機能仕様書 2.7） */
  isDone: boolean
  /** 掴めなくするか（F-13）。応答待ちの間は true にする */
  isDragDisabled?: boolean
  onOpen: (cardId: string) => void
  onDelete: (cardId: string) => void
}

/**
 * 区分ごとのカードの見た目（機能仕様書 2.6）。
 *
 * 期限の文字色を別に持つのは、通常のカードでは控えめなグレーにしたいが、赤背景の
 * カードでは白でないと読めないため。ここで一緒に決めておく。
 *
 * ボーダーの太さと内側の余白を区分ごとに持つのは、点線のカードだけ 1px 細くしているため。
 * 太さの差を余白で埋め、どの区分でもカードの大きさが変わらないようにしている。
 *
 * soon（2〜3日以内）は当初「明るい黄＋内側に濃い縁1本」の二重線だったが、実物を見て
 * 一重に改めた。経緯と色の根拠は index.css の --color-warn のコメントを参照。
 */
/**
 * クラス名は必ず文字列のまま書く。Tailwind はソースを走査してクラス名を拾うため、
 * 変数を差し込んで組み立てると、そのクラスの CSS が生成されない。
 * 落ち影を共通の定数にまとめられないのはこのため。
 */
const CARD_STYLES = {
  overdue: {
    card: 'border-[3px] border-danger bg-danger p-2 text-danger-ink shadow-[0_1px_1px_rgba(9,30,66,0.2)]',
    due: 'text-danger-ink',
  },
  tomorrow: {
    card: 'border-[3px] border-danger bg-surface p-2 text-ink shadow-[0_1px_1px_rgba(9,30,66,0.2)]',
    due: 'text-ink-sub',
  },
  soon: {
    card: 'border-[3px] border-warn bg-surface p-2 text-ink shadow-[0_1px_1px_rgba(9,30,66,0.2)]',
    due: 'text-ink-sub',
  },
  none: {
    // 色ではなく細さで区別する。太さが 2px 減るぶん内側の余白を 2px 増やし、
    // どの区分でもカードの大きさが変わらないようにしている
    card: 'border border-ink bg-surface p-[10px] text-ink shadow-[0_1px_1px_rgba(9,30,66,0.2)]',
    due: 'text-ink-sub',
  },
  /**
   * 「完了」列での上書き。終わったタスクを警告する意味がないため、期限を見ない。
   * 枠は期限に余裕のあるタスクと同じ細さにして、色分けの対象外であることを揃える
   */
  done: {
    card: 'border border-ink bg-done-bg p-[10px] text-done-ink shadow-[0_1px_1px_rgba(9,30,66,0.2)]',
    due: 'text-done-ink',
  },
} as const

/**
 * ゴミ箱アイコン（F-08）。
 *
 * fill / stroke を currentColor にしてあるので、色は置かれた場所の文字色に従う。
 * 期限による色分け（F-11, Step 6）で赤背景＋白文字になったタスクでも、完了列の
 * 薄いグレー＋黒文字でも、そのまま判別できる状態を保つための作り。
 */
function TrashIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M2.5 4h11" />
      <path d="M6.5 2.5h3" />
      <path d="M4 4l.7 9a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L12 4" />
      <path d="M6.6 6.5v5M9.4 6.5v5" />
    </svg>
  )
}

/**
 * カードの見た目そのもの（画面設計 2章）。
 * 表示するのはタイトルと期限だけで、説明文は出さない。
 *
 * ボーダーの幅は Step 2 の時点で確保してある。区分によって幅が変わらないので、
 * 色が付いてもカードの大きさは動かない。
 *
 * **列に並ぶカードと、ドラッグ中にポインタへ追従する本体の両方がこれを使う**（F-13）。
 * 見た目を1か所に持つためで、片方だけ直して食い違うことを避けている。
 * ドラッグの仕掛けはここには無く、外側の `TaskCard` が持つ。
 */
function TaskCardView({
  card,
  isDone,
  onOpen,
  onDelete,
  dragRef,
  dragProps,
  dragStyle,
  extraClassName = '',
}: Omit<Props, 'isDragDisabled'> & {
  dragRef?: (node: HTMLElement | null) => void
  dragProps?: Record<string, unknown>
  dragStyle?: CSSProperties
  extraClassName?: string
}) {
  const due = formatDueAt(card)
  // 「完了」列に在ることだけを条件に上書きする。差し戻せば色分けが復活する
  const style = isDone ? CARD_STYLES.done : CARD_STYLES[dueStatus(card)]

  /**
   * dnd-kit がカードに付けるキー操作（F-13）。**上書きせずに、後ろに自分の処理を足す。**
   *
   * `dragProps` を展開してから `onKeyDown` を書くと、**dnd-kit のものが消えて掴めなくなる。**
   * 逆に前に書くと自分のものが消える。順に呼ぶ形にして、どちらも生かす。
   */
  const dragKeyDown = dragProps?.onKeyDown as ((event: KeyboardEvent<HTMLElement>) => void) | undefined

  return (
    // 幅は 240px 固定で、列の中では中央に置く（F-15）。列の内側 280px との差 40px が
    // 左右 20px ずつの余白になり、完了列でチェックボックスを出すときの寄り代になる。
    // **全列で同じ幅**にしてあるので、完了列だけカードの大きさが変わることはない
    <article
      ref={dragRef}
      {...dragProps}
      /* **詳細を開く操作はカード全体で受ける**（F-07、#95）。
       *
       * 以前はタイトルだけを `<button>` にしていた。**カードそのものが既にボタンだった**
       * ため（dnd-kit が `role="button"` と `tabIndex` を付ける）、**タスク1件につき
       * Tab の停留点が4つあり、うち2つは名前まで同じ**という状態になっていた。
       * 20件の列なら80回。入れ子のボタンをやめて、カードで受ける形に寄せた。
       *
       * **ドラッグとは競合しない。** `PointerSensor` に 5px のしきい値があるので、
       * 動かさずに離せばクリックとして扱われる（掴む仕掛けを入れた時点からの前提）。 */
      onClick={() => onOpen(card.id)}
      /* キーボードでは **`Enter` で開き、`Space` で掴む。** dnd-kit の既定では
       * `Enter` も掴む側に割り当たっているので、そちらは `Space` だけに絞ってある
       * （BoardView の KeyboardSensor）。
       *
       * **中のボタンから浮いてきた `Enter` は無視する。** ゴミ箱の上で押した `Enter` は
       * 削除であって、詳細を開く操作ではない。 */
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
        dragKeyDown?.(event)
        if (event.key === 'Enter' && event.target === event.currentTarget) onOpen(card.id)
      }}
      // transform / transition は値が実行時に決まるので、クラス名ではなく style で当てる。
      // Tailwind はソースを走査してクラスを生成するため、動く値はクラスにできない
      style={dragStyle}
      className={`mx-auto w-60 cursor-pointer touch-none rounded-card ${style.card} ${extraClassName}`}
    >
      {/* タイトルはただの文字。**押せるのはカード全体**（上の onClick）なので、
          ここにボタンを入れると停留点が二重になる */}
      <h3 className="m-0 font-semibold [overflow-wrap:anywhere]">{card.title}</h3>
      {/* 期限が無くても行は残す。有無で高さが変わると縦の並びがばらつく。
          ゴミ箱アイコンはこの行の右端に常時表示する（画面設計 2章、F-08） */}
      <div className="mt-0.5 flex min-h-5 items-center justify-between gap-2">
        <p className={`m-0 text-xs tabular-nums ${style.due}`}>{due}</p>
        <button
          type="button"
          onClick={(event) => {
            // **カードへ伝わらないように止める**（#95）。止めないと、削除の確認モーダルと
            // 詳細モーダルが同時に開く（カード全体が詳細を開くようになったため）
            event.stopPropagation()
            onDelete(card.id)
          }}
          aria-label={`「${card.title}」を削除`}
          // 色はカードの文字色に追従させる（F-08）。赤背景では白、完了列では黒になる。
          // 薄くしないのは、どの背景でもコントラストを確保するため。ホバーの手応えは
          // 透明度で出す
          className="shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none text-current hover:opacity-70"
        >
          <TrashIcon />
        </button>
      </div>
    </article>
  )
}

/**
 * 列に並ぶタスク。ドラッグで掴める（F-13）。
 *
 * **掴む対象はカード全体で、専用のつまみは置かない。** 掴める範囲を広く取れるのは、
 * `PointerSensor` に距離のしきい値を置いているため（BoardView）。少し動かすまでは
 * ドラッグを始めないので、タイトルのクリックで詳細が開くこと（F-07）も、
 * ゴミ箱アイコンの削除（F-08）も今までどおり動く。
 *
 * `attributes` はキーボード操作のために要る。カード全体がフォーカスを受け取り、
 * そこで Space を押すと掴める。**中のボタンに乗っている間は掴まない** — dnd-kit の
 * KeyboardSensor が「押した先が掴む対象そのものか」を見るため、タイトルの上での
 * Enter は今までどおり詳細を開く。
 */
export function TaskCard({ card, isDone, isDragDisabled = false, onOpen, onDelete }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: card.id,
    disabled: isDragDisabled,
  })

  return (
    <TaskCardView
      card={card}
      isDone={isDone}
      onOpen={onOpen}
      onDelete={onDelete}
      dragRef={setNodeRef}
      dragProps={{ ...attributes, ...listeners }}
      // **useSortable が返す transform は当てない。** 当てると、落ち先の手前のカードが
      // ずれて隙間が空く（dnd-kit の標準の見せ方）。落ち先は線で示すと決めたので
      // （画面設計 3章）、隙間まで空くと示し方が二重になって読みにくい。
      //
      // **列をまたぐと隙間は原理的に出ない**（並び替えの範囲が列ごとに別々のため）ことも
      // あり、線に一本化した方が、同じ列でも別の列でも見え方が揃う
      // 掴んでいる間、元の位置は**透明にして場所だけ残す**（#76）。
      //
      // **消さないのが肝。** display を切ると並びが詰まり、掴んだ瞬間に列全体が
      // 動いてしまう。透明なら幅も高さもそのままなので、空いた場所が「ここに戻る／
      // ここから出ていく」という予約として読める。
      //
      // 当初は薄く（opacity-40）残していた。画面設計 3章の「まだそこに属していることを
      // 示す」に沿ったものだったが、**ポインタに追従する本体と同じカードが2枚見える**
      // ことになり、実際に触ると本体の方を目で追うため、薄い方は情報にならなかった
      extraClassName={isDragging ? 'opacity-0' : ''}
    />
  )
}

/**
 * ドラッグ中、ポインタに追従する本体（画面設計 3章）。
 *
 * **元のカードを動かすのではなく、別に描いて上に浮かせる。** 元のカードを動かすと、
 * 列のスクロール領域（`overflow`）に切り取られて列の外へ出られない。加えて、掴んだ
 * カードの位置は落ち先の判定にも使われるため、切り取られたり元の位置へ戻ったりすると
 * **判定そのものがずれる。** 実際、これが無い状態では「別の列へ入れると先頭か末尾に
 * しか入らない」「一定以上離すと元の位置へ戻る」という形で現れていた（#76）。
 *
 * 見た目は列に並んでいるときのまま保つ。掴んだ瞬間に姿が変わると、どれを掴んだのかを
 * もう一度確かめることになる。
 */
export function TaskCardOverlay({ card, isDone }: { card: Card; isDone: boolean }) {
  return (
    <TaskCardView
      card={card}
      isDone={isDone}
      // 浮いている本体は操作の対象ではない。押せる見た目のまま反応しないことがないよう、
      // 何もしない関数を渡す
      onOpen={() => {}}
      onDelete={() => {}}
      // 落ち影を濃くして、盤面から浮いていることを示す
      extraClassName="cursor-grabbing shadow-[0_8px_16px_rgba(9,30,66,0.32)]"
    />
  )
}
