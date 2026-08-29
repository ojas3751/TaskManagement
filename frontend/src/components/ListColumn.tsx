import { useState } from 'react'
import type { TaskList } from '../api/types'
import { NameInputModal } from './NameInputModal'
import { TaskCard } from './TaskCard'

type Props = {
  list: TaskList
  /** 左へ動かせるか。左端の列では false（F-05） */
  canMoveLeft: boolean
  /** 右へ動かせるか。完了列の左隣では false（完了より右へは行けない） */
  canMoveRight: boolean
  onOpenList: (listId: string) => void
  onMoveList: (listId: string, direction: -1 | 1) => void
  onAddCard: (listId: string, title: string) => void
  onOpenCard: (cardId: string) => void
  onDeleteCard: (cardId: string) => void
}

/**
 * 鉛筆アイコン（F-03）。
 *
 * 画像ファイルも絵文字も使わず図形で描く（画面設計 2章の注記）。フォントによって
 * 字形や色が変わると、文字色への追従ができないため。stroke を currentColor に
 * してあるので、色は置かれた場所の文字色に従う。TrashIcon と同じ作り。
 */
function PencilIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11.2 2.3a1.3 1.3 0 0 1 1.9 0l.6.6a1.3 1.3 0 0 1 0 1.9L5.6 12.9l-3 .5.5-3z" />
      <path d="M10.3 3.2l2.5 2.5" />
    </svg>
  )
}

/**
 * 並び替えの矢印（F-05）。
 *
 * 図形で描く理由は PencilIcon と同じ。左右は同じ図形を反転させる（scale-x-[-1]）ため、
 * パスは1つで済む。
 *
 * **端では消さずに、押せない状態で残す。** 消すと列によってボタンの数が変わり、
 * 見出しの位置が左右にずれる。押せないことは見た目（薄さ）と disabled で伝える。
 */
function ArrowButton({
  direction,
  listTitle,
  disabled,
  onClick,
}: {
  direction: -1 | 1
  listTitle: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`「${listTitle}」を${direction === -1 ? '左' : '右'}へ移動`}
      className="flex size-5 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-ink-sub hover:text-ink disabled:cursor-default disabled:opacity-30 disabled:hover:text-ink-sub"
    >
      <svg
        viewBox="0 0 16 16"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={direction === 1 ? 'scale-x-[-1]' : undefined}
      >
        <path d="M10 3L5 8l5 5" />
      </svg>
    </button>
  )
}

/**
 * 列（画面設計 1章）。
 *
 * 並び替えの矢印・見出し・[+ タスク追加]・タスクの一覧を出す。
 * 完了列のチェックボックス（F-15）はまだ置かない。
 *
 * **スクロールするのはタスクの一覧だけ（F-25）。** 矢印・リスト名・[+ タスク追加] は
 * その外に置くので、どれだけスクロールしても隠れない。**これが F-25 の目的そのもの**で、
 * 見出しが流れて消えると、列が多いときにどの列を触っているか分からなくなる。
 */
export function ListColumn({
  list,
  canMoveLeft,
  canMoveRight,
  onOpenList,
  onMoveList,
  onAddCard,
  onOpenCard,
  onDeleteCard,
}: Props) {
  // 開閉は列ごとに独立していて他と共有する必要がないので、ここで持つ。
  // リストの詳細モーダルは App が持つ（削除の確認モーダルへ続くため）
  const [isAdding, setIsAdding] = useState(false)

  const cards = [...list.cards].sort((a, b) => a.position - b.position)

  return (
    // max-h-full で、盤面から渡された高さを上限として受け取る（F-25）。
    // self-start と併せて「収まるうちは中身なりの高さ、超えたらそこで頭打ち」になる
    <section className="flex max-h-full w-65 shrink-0 flex-col gap-2 self-start rounded-card bg-list-bg p-2.5">
      {/* 並び替えの行（F-05）。リスト名の**上**に置き、両端に寄せる。

          見出しの行（リスト名の横）に入れないのは、**260px しかない列幅をリスト名と
          奪い合い、名前が早く … で切れる**ため。上の行なら名前の幅は減らない。

          **「完了」列にはボタンを出さないが、行の高さは空ける。** 出し分けで高さが
          変わると、完了列だけタスクが1行ぶん上にずれ、編集アイコンで避けた
          「列ごとにタスクの開始位置が違う」状態に戻る */}
      <div className="flex h-5 items-center justify-between">
        {!list.is_fixed_last && (
          <>
            <ArrowButton
              direction={-1}
              listTitle={list.title}
              disabled={!canMoveLeft}
              onClick={() => onMoveList(list.id, -1)}
            />
            <ArrowButton
              direction={1}
              listTitle={list.title}
              disabled={!canMoveRight}
              onClick={() => onMoveList(list.id, 1)}
            />
          </>
        )}
      </div>

      {/* 見出しの行。編集アイコンを左端に置き、リスト名はその右に置く。

          **見出しの下に置かないのは、列ごとにタスクの開始位置がずれるため。**
          アイコンは追加した列にしか出ないので、下に1行取ると**その列だけタスクが
          1行分下がり、横に並べたときに先頭が揃わない。** 見出しの行に収めれば、
          出ても出なくても列の高さは変わらない。

          **リスト名は1行に固定し、はみ出す分は末尾を … で省略する。** 折り返すと、
          名前の長さで列の高さが変わり、同じ理由で開始位置がずれる。上限の50文字は
          この列幅で4行前後になり、一覧が主目的の画面で見出しに割く量ではない。

          **切り詰めるのは見た目だけで、名前そのものは DOM に残る**（CSS による省略）。
          読み上げには全文が渡る */}
      <div className="flex h-5 items-center gap-1">
        {/* 追加した列にだけ出す（画面設計 1章）。デフォルトの3列は改名できない。
            列名ではなく is_default で判定する。名前で見ると、改名した直後に
            自分自身が判定から外れる */}
        {!list.is_default && (
          <button
            type="button"
            onClick={() => onOpenList(list.id)}
            aria-label={`「${list.title}」の詳細`}
            // ボタンなので Tab でフォーカスでき、Enter / Space でも開く（要件 6.6）。
            // ダブルクリックだけにしないのはこのため
            className="flex h-5 shrink-0 cursor-pointer items-center border-0 bg-transparent p-0 text-ink-sub hover:text-ink"
          >
            <PencilIcon />
          </button>
        )}

        {/* title はマウス向け。**キーボードでは出ない**（ブラウザが hover でしか
            出さない）が、フルネームはアイコンの aria-label と、そこから開く
            モーダルの入力欄で読める（#55 で決めた）。そのためだけに自前の
            ツールチップを作ると、列ごとに Tab の停留点が1つ増える。

            **見た目（大きさ・書体）はブラウザと OS が決めるので指定できない。**
            自前で描けば変えられるが、それは仕組みごとの置き換えになる。

            min-w-0 が要るのは、flex の子は既定で中身より小さくならず、
            これが無いと truncate が効かないため */}
        <h2
          title={list.title}
          className="m-0 min-w-0 flex-1 truncate text-center text-sm/5 font-bold"
        >
          {list.title}
        </h2>

        {/* アイコンと同じ幅を右側にも空ける。片側だけに置くと、その分だけリスト名が
            左に寄り、アイコンの無いデフォルト列と見出しの位置が揃わない */}
        {!list.is_default && <span aria-hidden="true" className="h-5 w-3.5 shrink-0" />}
      </div>

      {/* 列の最上部に置く（画面設計 1章）。末尾に置くと、追加したタスクが
          列の先頭に入る仕様（F-06）と噛み合わず、結果を見るのにスクロールが要る */}
      <button
        type="button"
        onClick={() => setIsAdding(true)}
        // 点線にしているのは、タスクのカードと並んだときに「これはタスクではない」と
        // 一目で分かるようにするため。実線だと、中身が空のカードのように見える
        className="cursor-pointer rounded-card border border-dashed border-ink-sub bg-surface px-2 py-1 text-left text-ink-sub hover:bg-surface hover:text-ink"
      >
        ＋ タスク追加
      </button>

      {/* ここだけがスクロールする（F-25）。

          **min-h-0 が要る。** flex の子は既定で min-height: auto となり中身より
          小さくならないため、これが無いと縮まずに列が上限を突き抜ける。

          **flex-1 は付けない。** 付けると中身が少ない列まで画面の下端まで伸び、
          いまの見た目が変わる。min-h-0 だけなら、収まるうちは中身なりの高さで、
          上限に達したときだけ縮んでスクロールする。F-25 が求めているのは
          「はみ出さないこと」だけなので、それ以外は動かさない。

          空状態も同じ入れ物に入れる。ドロップの受け口（F-13）としては
          タスクがある場合と同じ扱いになるため */}
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
        {cards.length === 0 ? (
          <p className="m-0 py-4 text-center text-ink-sub">（タスクなし）</p>
        ) : (
          cards.map((card) => (
            <TaskCard
              key={card.id}
              card={card}
              // 「完了」列かどうかは is_fixed_last で判定する。列名で見ると、
              // 改名（F-03, Step 9）できるようになった時点で壊れる
              isDone={list.is_fixed_last}
              onOpen={onOpenCard}
              onDelete={onDeleteCard}
            />
          ))
        )}
      </div>

      {isAdding && (
        <NameInputModal
          title="タスクの追加"
          label="タイトル"
          maxLength={100}
          submitLabel="追加"
          onSubmit={(title) => {
            setIsAdding(false)
            onAddCard(list.id, title)
          }}
          onCancel={() => setIsAdding(false)}
        />
      )}
    </section>
  )
}
