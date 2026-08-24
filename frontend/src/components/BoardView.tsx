import type { Board } from '../api/types'
import { ListColumn } from './ListColumn'

type Props = {
  board: Board
  onAddCard: (listId: string, title: string) => void
  onOpenCard: (cardId: string) => void
}

/**
 * ボードの本体。列を横に並べる（画面設計 1章）。
 *
 * 列が増えると横幅に収まらなくなるので、はみ出した分は横スクロールで見せる。
 * 列を縮めて詰め込むと 1 列あたりのタスクが読めなくなるため。
 */
export function BoardView({ board, onAddCard, onOpenCard }: Props) {
  const lists = [...board.lists].sort((a, b) => a.position - b.position)

  return (
    <div className="flex items-start gap-3 overflow-x-auto px-5 pb-8 pt-4">
      {lists.map((list) => (
        <ListColumn key={list.id} list={list} onAddCard={onAddCard} onOpenCard={onOpenCard} />
      ))}
    </div>
  )
}
