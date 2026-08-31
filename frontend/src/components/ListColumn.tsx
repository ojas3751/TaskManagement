import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Fragment, useState } from 'react'
import type { TaskList } from '../api/types'
import { toListDroppableId } from '../lib/dropTarget'
import { NameInputModal } from './NameInputModal'
import { SelectableTaskRow } from './SelectableTaskRow'
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
  /** 選択したタスクをまとめて削除する（F-15）。確認モーダルは App が出す */
  onBulkDeleteCards: (cardIds: string[]) => void
  /** 応答待ちの間はタスクを掴ませない（F-13）。他の操作と同じ扱い */
  isDragDisabled: boolean
  /** いま掴まれているタスク。掴んでいなければ null */
  draggingCardId: string | null
  /**
   * この列に落ちる位置（F-13）。落ち先が他の列なら null。
   *
   * **掴んでいるタスクを除いた並びでの位置。** 落ち先を決める側（dropTarget.ts）と
   * 数え方を揃えてある。
   */
  dropIndex: number | null
}

/**
 * 挿入位置の線（画面設計 3章）。
 *
 * **どこに落ちるかを、指を離す前に見せる。** 落ちた場所が予想と違うと、利用者は毎回
 * 結果を確認してからやり直すことになる。
 *
 * 線だけで示し、カードは動かさない。dnd-kit の標準は「他のカードが動いて隙間が空く」だが、
 * **列をまたぐと効かない**（並び替えの範囲が列ごとに別々のため）。線なら同じ見せ方で
 * 両方を扱える。
 *
 * 高さのぶんだけ並びが動かないよう、**場所を取らずに描く**（h-0 と負のマージン）。
 * 線が出た瞬間にカードが 2px ずつ下へずれると、それ自体が落ち先の誤解を生む。
 */
function InsertionLine() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none -my-px h-0.5 rounded-full bg-ink"
    />
  )
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
 * 並び替えの矢印・見出し・タスクの一覧を出す。見出しの下の1行は列によって中身が変わり、
 * **完了列は選択の行（F-15）、それ以外は [+ タスク追加]**（#20）。
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
  onBulkDeleteCards,
  isDragDisabled,
  draggingCardId,
  dropIndex,
}: Props) {
  // 開閉は列ごとに独立していて他と共有する必要がないので、ここで持つ。
  // リストの詳細モーダルは App が持つ（削除の確認モーダルへ続くため）
  const [isAdding, setIsAdding] = useState(false)

  /**
   * 選択中のタスク（F-15）。**DB には保存しない**（機能仕様書 1.4）。画面上の一時的な
   * 状態であり、テーブルに持たせると再読み込み時の初期化責務が発生するため。
   *
   * 完了列以外では常に空のまま。チェックボックスを出していないので触れようがない。
   */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const cards = [...list.cards].sort((a, b) => a.position - b.position)

  /**
   * 列そのものをドロップの受け口として登録する（F-13）。
   *
   * **これが無いと、タスクが 0 件の列には落とせない。** dnd-kit が重なりを見るのは
   * 登録された受け口だけで、カードが 1 枚も無い列には見るものが無くなるため。
   * 画面設計 3章の「（タスクなし）の領域全体が受け口になる」がこれにあたる。
   *
   * 件数のある列にも付ける。カードとカードの間や下の余白に落としたときの行き先になる。
   */
  const { setNodeRef: setDropRef } = useDroppable({ id: toListDroppableId(list.id) })

  /**
   * 線をどのタスクの手前に引くか（F-13）。末尾に引く場合は null。
   *
   * `dropIndex` は**掴んでいるタスクを除いた並び**で数えられているので、同じ並びから
   * 引く。掴んでいるタスクは透明で場所だけ残っているため、除かずに数えると 1 つずれる。
   */
  const beforeCardId =
    dropIndex === null
      ? null
      : (cards.filter((card) => card.id !== draggingCardId)[dropIndex]?.id ?? null)

  // 末尾に引くのは、落ち先がこの列で、かつ手前に引く相手がいないとき
  const showLineAtEnd = dropIndex !== null && beforeCardId === null

  // チェックボックスを出すのは完了列だけ（画面設計 1章）。列名ではなく is_fixed_last で
  // 見る。名前で判定すると、改名（F-03）できるようになった時点で壊れる
  const isSelectable = list.is_fixed_last

  // 盤面が差し替わると、消えたタスクの id が選択に残りうる。**いま在るものだけを数える**
  const selected = cards.filter((card) => selectedIds.has(card.id))

  const toggle = (cardId: string, isChecked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (isChecked) next.add(cardId)
      else next.delete(cardId)
      return next
    })
  }

  return (
    // max-h-full で、盤面から渡された高さを上限として受け取る（F-25）。
    // self-start と併せて「収まるうちは中身なりの高さ、超えたらそこで頭打ち」になる
    /* 幅 300px は全列共通（BoardView の [+ リスト追加] も同じ値にすること）。
       内側は 280px。240px のカードを中央に置くと左右 20px ずつ空き、チェックボックスを
       出すときに右へ 12px 寄せると左が 32px・右が 8px になる（F-15）。

       **縦スクロールバーの分を見込んで 284px から広げた。** scrollbar-width: thin でも
       10px 前後を内側から取るため、284px では寄せたカードの右端が切れる（内側 264px −
       スクロールバー ≒ 254px に対して、カード 240px ＋ 左 24px が入らない）。
       カードを縮めずに列を広げるのは、幅より読みやすさを採る判断（#70）に合わせたもの */
    <section className="flex max-h-full w-75 shrink-0 flex-col gap-2 self-start rounded-card bg-list-bg p-2.5">
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

      {/* 見出しの下の1行。**完了列は選択の行、それ以外は [＋ タスク追加]**（#20）。

          **完了列に [＋ タスク追加] を出さない理由。** 実際のタスク管理では、完了に
          直接タスクを起票する場面がほぼ無い。完了へ入れる手段はドラッグ&ドロップ（F-13）と
          詳細モーダルのリスト選択欄（F-23）があるので、消しても行き止まりにならない。

          **消すのは完了列だけで、「進行中」や追加した列には出したままにする。**
          Issue #20 は当初「進行中」も対象にしていたが、取りやめた。**完了列以外は
          「そこへ直接起票したいか」の判断がブラッシュアップ案（F-22 のホバーでの完了操作
          など）の前提と混ざり、いまは決められないため。**

          **選択の行は、1件も選んでいなくても出す。** 出し分けにすると完了列だけこの行が
          消えて、タスクの先頭が1行ぶん上がる。編集アイコン（v1.4）・並び替えの行（v1.6）と
          同じ問題で、横に並べたときに列ごとの基準がずれる。**0件のときは押せない状態に
          しておく**ので、チェックせずに全件消せるようにはならない */}
      {isSelectable ? (
        /* 選択に関わる操作は**この1行にまとめる**。列の上下に散らすと、選択してから
           削除するまでの視線が縦に往復する。並びは「広げる → 取り消す → 実行する」の順。

           **枠と余白は [＋ タスク追加] と同じにする**（border 1px ＋ px-2 py-1）。
           他の列と高さが違うと、完了列だけタスクの先頭がずれる。

           幅は中身なりにして両端へ寄せる。等分にすると、件数が3桁になったときに
           「200件を削除」が収まらない */
        <div className="flex justify-between gap-1">
          <button
            type="button"
            onClick={() => setSelectedIds(new Set(cards.map((card) => card.id)))}
            // 広げる先が無いときは押せない。0件の列で押しても何も起きないため
            disabled={cards.length === 0}
            className="cursor-pointer rounded-card border border-line bg-surface px-2 py-1 whitespace-nowrap text-ink-sub hover:text-ink disabled:cursor-default disabled:opacity-40 disabled:hover:text-ink-sub"
          >
            全選択
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            disabled={selected.length === 0}
            className="cursor-pointer rounded-card border border-line bg-surface px-2 py-1 whitespace-nowrap text-ink-sub hover:text-ink disabled:cursor-default disabled:opacity-40 disabled:hover:text-ink-sub"
          >
            選択解除
          </button>
          <button
            type="button"
            onClick={() => {
              onBulkDeleteCards(selected.map((card) => card.id))
              // 送った内容は App が持っている。列が覚えておく必要はない
              setSelectedIds(new Set())
            }}
            // **0件では押せない。** 確認モーダル1枚で全件削除に到達できるより、
            // まず1件チェックさせる方が誤操作を抑えられる（F-15 からの方針）
            disabled={selected.length === 0}
            // danger は白文字とのコントラスト 6.0:1（index.css）。ConfirmModal の
            // 「削除する」と同じ扱いで、取り消せない操作であることを色でも示す
            className="cursor-pointer rounded-card border border-danger bg-surface px-2 py-1 whitespace-nowrap text-danger hover:bg-danger hover:text-danger-ink disabled:cursor-default disabled:opacity-40 disabled:hover:bg-surface disabled:hover:text-danger"
          >
            {selected.length}件を削除
          </button>
        </div>
      ) : (
        /* 列の最上部に置く（画面設計 1章）。末尾に置くと、追加したタスクが
           列の先頭に入る仕様（F-06）と噛み合わず、結果を見るのにスクロールが要る */
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          // 点線にしているのは、タスクのカードと並んだときに「これはタスクではない」と
          // 一目で分かるようにするため。実線だと、中身が空のカードのように見える
          className="cursor-pointer rounded-card border border-dashed border-ink-sub bg-surface px-2 py-1 text-left text-ink-sub hover:bg-surface hover:text-ink"
        >
          ＋ タスク追加
        </button>
      )}

      {/* ここだけがスクロールする（F-25）。

          **min-h-0 が要る。** flex の子は既定で min-height: auto となり中身より
          小さくならないため、これが無いと縮まずに列が上限を突き抜ける。

          **flex-1 は付けない。** 付けると中身が少ない列まで画面の下端まで伸び、
          いまの見た目が変わる。min-h-0 だけなら、収まるうちは中身なりの高さで、
          上限に達したときだけ縮んでスクロールする。F-25 が求めているのは
          「はみ出さないこと」だけなので、それ以外は動かさない。

          空状態も同じ入れ物に入れる。ドロップの受け口（F-13）としては
          タスクがある場合と同じ扱いになるため */}
      {/* 横はスクロールさせない（overflow-x-hidden）。カードは列に収まる幅で固定して
          あるので、横に溢れるのは想定外の状態であり、スクロールで見せるものではない。

          **縦のスクロールバーは細くする。** 既定の幅（15px 前後）はカードの右余白より
          太く、列の内側をはっきり削る。scrollbar-width は Tailwind のユーティリティに
          無いので、プロパティを直接指定する */}
      {/* **上下に 1px の余白を取る。** 挿入位置の線は、並びを動かさないために負のマージンで
          場所を取らずに描いている（InsertionLine）。そのぶん、線が先頭や末尾に出たときは
          この領域から 1px はみ出す。**はみ出せば縦のスクロールバーが出る**ため、
          線が収まるだけの余白を先に確保しておく。線が半分しか見えないのも同じ原因 */}
      <div
        ref={setDropRef}
        className="flex min-h-0 flex-col gap-2 overflow-x-hidden overflow-y-auto py-px [scrollbar-width:thin]"
      >
        {/* 並び替えの範囲はこの列の中（F-13）。**items には表示順どおりの id を渡す。**
            dnd-kit はこの配列の添字で「何番目に落ちるか」を決めるので、position の
            昇順に並べた cards から作る必要がある */}
        <SortableContext
          items={cards.map((card) => card.id)}
          strategy={verticalListSortingStrategy}
        >
          {cards.length === 0 ? (
            <p className="m-0 py-4 text-center text-ink-sub">（タスクなし）</p>
          ) : (
            cards.map((card) => (
              <Fragment key={card.id}>
                {beforeCardId === card.id && <InsertionLine />}
                {isSelectable ? (
                  <SelectableTaskRow
                    card={card}
                    isSelected={selectedIds.has(card.id)}
                    isDragDisabled={isDragDisabled}
                    onToggle={toggle}
                    onOpen={onOpenCard}
                    onDelete={onDeleteCard}
                  />
                ) : (
                  <TaskCard
                    card={card}
                    // 「完了」列かどうかは is_fixed_last で判定する。列名で見ると、
                    // 改名（F-03, Step 9）できるようになった時点で壊れる
                    isDone={list.is_fixed_last}
                    isDragDisabled={isDragDisabled}
                    onOpen={onOpenCard}
                    onDelete={onDeleteCard}
                  />
                )}
              </Fragment>
            ))
          )}

          {/* 末尾に落ちる場合の線。タスクが0件の列では「（タスクなし）」の下に出る */}
          {showLineAtEnd && <InsertionLine />}
        </SortableContext>
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
