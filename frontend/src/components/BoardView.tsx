import { useState } from 'react'
import type { Board } from '../api/types'
import { ListColumn } from './ListColumn'
import { NameInputModal } from './NameInputModal'

type Props = {
  board: Board
  onAddList: (title: string) => void
  onRenameList: (listId: string, title: string) => void
  onAddCard: (listId: string, title: string) => void
  onOpenCard: (cardId: string) => void
  onDeleteCard: (cardId: string) => void
}

/**
 * ボードの本体。列を横に並べる（画面設計 1章）。
 *
 * 列が増えると横幅に収まらなくなるので、はみ出した分は横スクロールで見せる。
 * 列を縮めて詰め込むと 1 列あたりのタスクが読めなくなるため。
 */
export function BoardView({
  board,
  onAddList,
  onRenameList,
  onAddCard,
  onOpenCard,
  onDeleteCard,
}: Props) {
  // 開閉はこの画面だけの状態なのでここで持つ（ListColumn の [+ タスク追加] と同じ）
  const [isAdding, setIsAdding] = useState(false)

  const lists = [...board.lists].sort((a, b) => a.position - b.position)

  return (
    <div className="flex items-start gap-3 overflow-x-auto px-5 pb-8 pt-4">
      {lists.map((list) => (
        <ListColumn
          key={list.id}
          list={list}
          onRenameList={onRenameList}
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
