import type { Board } from '../api/types'

/**
 * 表示順（position の昇順）に並べたリストの id。
 *
 * サーバーへ送る配列も、画面で隣を探すのも、この並びが基準になる。
 */
export function listIdsInOrder(board: Board): string[] {
  return [...board.lists].sort((a, b) => a.position - b.position).map((list) => list.id)
}

/**
 * 1つのリストを隣と入れ替えた並びを返す（F-05）。
 *
 * 動かせない場合（端にいる、そのリストが無い）は**今の並びをそのまま返す**。呼び出し側は
 * ボタンを押せなくして防いでいるので、ここは最後の歯止め。例外にしないのは、
 * 「動かせなかった」がエラーではなく単に何も起きない状態のため。
 *
 * **完了列より右へ行けないことは、ここでは見ない。** 判断の正本はサーバー
 * （409 FIXED_LAST_MUST_BE_LAST、api.md 3.5）で、画面はボタンを出さないことで表現する。
 * 両方に条件を書くと、片方だけ直したときに食い違う。
 *
 * @param direction -1 で左へ、1 で右へ
 */
export function withSwappedList(board: Board, listId: string, direction: -1 | 1): string[] {
  const ids = listIdsInOrder(board)
  const from = ids.indexOf(listId)
  const to = from + direction

  if (from === -1 || to < 0 || to >= ids.length) return ids

  const next = [...ids]
  next[from] = ids[to]
  next[to] = ids[from]
  return next
}

/**
 * 与えられた並びのとおりに position を振り直した board を返す（元の board は変更しない）。
 *
 * 応答を待たずに画面へ反映するために使う。**ここではサーバーと同じ採番をする**
 * （添字がそのまま position）。タスクの追加や削除では暫定値で済ませているが、並び替えは
 * 位置そのものが操作の結果なので、正しい並びで描かないと結果が見えない。
 */
export function withListOrder(board: Board, listIds: string[]): Board {
  return {
    ...board,
    lists: board.lists.map((list) => {
      const position = listIds.indexOf(list.id)
      return position === -1 ? list : { ...list, position }
    }),
  }
}
