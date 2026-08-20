import type { TaskList } from '../api/types'
import { TaskCard } from './TaskCard'

type Props = { list: TaskList }

/**
 * 列（画面設計 1章）。
 *
 * この段階では見出しとタスクの一覧だけを出す。
 * 列の並び替え・改名・削除（Step 9）、完了列のチェックボックスと
 * 折りたたみ（Step 10）、[+ タスク追加]（Step 3）はまだ置かない。
 */
export function ListColumn({ list }: Props) {
  const cards = [...list.cards].sort((a, b) => a.position - b.position)

  return (
    <section className="flex w-65 shrink-0 flex-col gap-2 self-start rounded-card bg-list-bg p-2.5">
      <h2 className="m-0 text-center text-sm font-bold [overflow-wrap:anywhere]">
        {list.title}
      </h2>

      {cards.length === 0 ? (
        <p className="m-0 py-4 text-center text-ink-sub">（タスクなし）</p>
      ) : (
        <div className="flex flex-col gap-2">
          {cards.map((card) => (
            <TaskCard key={card.id} card={card} />
          ))}
        </div>
      )}
    </section>
  )
}
