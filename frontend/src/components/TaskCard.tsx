import type { Card } from '../api/types'
import { dueStatus } from '../lib/dueStatus'
import { formatDueAt } from '../lib/formatDueAt'

type Props = {
  card: Card
  /** 「完了」列に置かれているか。true なら期限による色分けを上書きする（機能仕様書 2.7） */
  isDone: boolean
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
 * 一覧に出すタスク（画面設計 2章）。
 * 表示するのはタイトルと期限だけで、説明文は出さない。
 *
 * ボーダーの幅は Step 2 の時点で確保してある。区分によって幅が変わらないので、
 * 色が付いてもカードの大きさは動かない。
 */
export function TaskCard({ card, isDone, onOpen, onDelete }: Props) {
  const due = formatDueAt(card)
  // 「完了」列に在ることだけを条件に上書きする。差し戻せば色分けが復活する
  const style = isDone ? CARD_STYLES.done : CARD_STYLES[dueStatus(card)]

  return (
    <article className={`rounded-card ${style.card}`}>
      {/* クリックできるのはタイトル部分（画面設計 4章）。カード全体をボタンにすると、
          期限の行に置く削除アイコン（F-08, #26）がボタンの入れ子になってしまう */}
      <h3 className="m-0 font-semibold">
        <button
          type="button"
          onClick={() => onOpen(card.id)}
          // 文字色はカードから継承する。赤背景では白、完了列では黒になる
          className="w-full cursor-pointer border-0 bg-transparent p-0 text-left font-semibold text-current [overflow-wrap:anywhere] hover:underline"
        >
          {card.title}
        </button>
      </h3>
      {/* 期限が無くても行は残す。有無で高さが変わると縦の並びがばらつく。
          ゴミ箱アイコンはこの行の右端に常時表示する（画面設計 2章、F-08） */}
      <div className="mt-0.5 flex min-h-5 items-center justify-between gap-2">
        <p className={`m-0 text-xs tabular-nums ${style.due}`}>{due}</p>
        <button
          type="button"
          onClick={() => onDelete(card.id)}
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
