import { useState } from 'react'
import type { TaskList } from '../api/types'
import { NameInputModal } from './NameInputModal'
import { TaskCard } from './TaskCard'

type Props = {
  list: TaskList
  onAddCard: (listId: string, title: string) => void
  onOpenCard: (cardId: string) => void
  onDeleteCard: (cardId: string) => void
}

/**
 * 列（画面設計 1章）。
 *
 * この段階では見出し・[+ タスク追加]・タスクの一覧を出す。
 * 列の並び替え・改名・削除（Step 9）、完了列のチェックボックスと
 * 折りたたみ（Step 10）はまだ置かない。
 */
export function ListColumn({ list, onAddCard, onOpenCard, onDeleteCard }: Props) {
  // 開閉は列ごとに独立していて他と共有する必要がないので、ここで持つ
  const [isAdding, setIsAdding] = useState(false)

  const cards = [...list.cards].sort((a, b) => a.position - b.position)

  return (
    <section className="flex w-65 shrink-0 flex-col gap-2 self-start rounded-card bg-list-bg p-2.5">
      <h2 className="m-0 text-center text-sm font-bold [overflow-wrap:anywhere]">
        {list.title}
      </h2>

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

      {cards.length === 0 ? (
        <p className="m-0 py-4 text-center text-ink-sub">（タスクなし）</p>
      ) : (
        <div className="flex flex-col gap-2">
          {cards.map((card) => (
            <TaskCard
              key={card.id}
              card={card}
              // 「完了」列かどうかは is_fixed_last で判定する。列名で見ると、
              // 改名（F-03, Step 9）できるようになった時点で壊れる
              isDone={list.is_fixed_last}
              onOpen={onOpenCard}
              onDelete={onDeleteCard}
            />
          ))}
        </div>
      )}

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
