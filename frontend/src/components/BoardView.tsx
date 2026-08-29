import { useState } from 'react'
import type { Board } from '../api/types'
import { ListColumn } from './ListColumn'
import { NameInputModal } from './NameInputModal'

type Props = {
  board: Board
  onAddList: (title: string) => void
  onOpenList: (listId: string) => void
  onMoveList: (listId: string, direction: -1 | 1) => void
  onAddCard: (listId: string, title: string) => void
  onOpenCard: (cardId: string) => void
  onDeleteCard: (cardId: string) => void
}

/**
 * ボードの本体。列を横に並べる（画面設計 1章）。
 *
 * 列が増えると横幅に収まらなくなるので、はみ出した分は横スクロールで見せる。
 * 列を縮めて詰め込むと 1 列あたりのタスクが読めなくなるため。
 *
 * **縦は自分ではスクロールしない（F-25）。** 縦を担うのは各列であって盤面ではない。
 * これは指定しないと成立しない。CSS では **overflow-x に auto を与えると、
 * overflow-y の visible が auto に格上げされる**ため、黙っていると盤面自身も縦の
 * スクロール領域になる。
 */
export function BoardView({
  board,
  onAddList,
  onOpenList,
  onMoveList,
  onAddCard,
  onOpenCard,
  onDeleteCard,
}: Props) {
  // 開閉はこの画面だけの状態なのでここで持つ（ListColumn の [+ タスク追加] と同じ）
  const [isAdding, setIsAdding] = useState(false)

  const lists = [...board.lists].sort((a, b) => a.position - b.position)

  return (
    // items-start は残す。列を中身なりの高さに保つため（ListColumn の max-h-full 参照）
    <div className="flex h-full items-start gap-3 overflow-x-auto overflow-y-hidden px-5 pb-8 pt-4">
      {lists.map((list, index) => (
        <ListColumn
          key={list.id}
          list={list}
          // 動かせるかは並びを知っているここで判断する（F-05）。列は自分の位置を知らない。
          //
          // 右へ動かせるのは「隣が完了列でないとき」だけ。完了列は常に最右なので、
          // その手前の列は右へ行けない。**サーバーも 409 で断る**が、押す前に分かる方がよい
          canMoveLeft={index > 0}
          canMoveRight={index < lists.length - 1 && !lists[index + 1].is_fixed_last}
          onOpenList={onOpenList}
          onMoveList={onMoveList}
          onAddCard={onAddCard}
          onOpenCard={onOpenCard}
          onDeleteCard={onDeleteCard}
        />
      ))}

      {/* 列の右端に置く（F-02）。画面設計 1章の図では盤面の下だが、列は横スクロール
          するので、下に置くとスクロール位置によって列との関係が読めなくなる。
          点線にしている理由は [+ タスク追加] と同じ */}
      <button
        type="button"
        onClick={() => setIsAdding(true)}
        className="w-65 shrink-0 cursor-pointer rounded-card border border-dashed border-ink-sub bg-list-bg px-2 py-2 text-left text-ink-sub hover:text-ink"
      >
        ＋ リスト追加
      </button>

      {isAdding && (
        <NameInputModal
          title="リストの追加"
          label="リスト名"
          maxLength={50}
          submitLabel="追加"
          onSubmit={(title) => {
            setIsAdding(false)
            onAddList(title)
          }}
          onCancel={() => setIsAdding(false)}
        />
      )}
    </div>
  )
}
