import type { CollisionDetection, KeyboardCoordinateGetter } from '@dnd-kit/core'
import type { Board } from '../api/types'
import { listIdsInOrder } from './reorderLists'

/**
 * 列そのものを掴めるようにするときの id（F-21）。
 *
 * **タスクの id とも、タスクの落ち先である列の受け口（`list:`）とも分ける必要がある。**
 * dnd-kit は掴めるものと受け口を id で区別するので、3種類が同じ名前空間に並ぶ。
 * 接頭辞で分けるのは `dropTarget.ts` と同じ考え方（タスクの id は UUID でコロンを含まない）。
 *
 * **`list:` を使い回さない。** あちらは「この列の末尾に落とす」という意味の受け口で、
 * 意味が違うものに同じ id を与えると、どちらの経路で来たのかが読めなくなる。
 */
const COLUMN_PREFIX = 'column:'

/**
 * 動かせる列の末尾を表す目印（F-21）。**「完了」列そのものを使う。**
 *
 * 落ち先には「どの列の手前でもない＝いちばん右」という結果が要る。**そのための受け口を
 * 別に作らない。** 完了列は常に最右で、その手前が動かせる列の末尾なので、**「完了の手前」
 * と言えば足りる。**
 *
 * **専用の受け口を列の間に挟む形は取りやめた**（#93）。幅を持たない縦長の箱になり、
 * **列とは形が違うため、キーボードで動かすときにそこを目標にすると下へ引っ張られる。**
 * 完了列なら正しい列の形をしている。
 *
 * 完了列は掴めないが、**落ち先としては登録しておく**必要がある（ListColumn 側で
 * `draggable` だけを切っている）。
 */
export function fixedLastListId(board: Board): string | null {
  return board.lists.find((list) => list.is_fixed_last)?.id ?? null
}

export function toColumnDraggableId(listId: string): string {
  return `${COLUMN_PREFIX}${listId}`
}

/** 列の id を取り出す。列を掴む id でなければ null */
export function fromColumnDraggableId(id: string): string | null {
  return id.startsWith(COLUMN_PREFIX) ? id.slice(COLUMN_PREFIX.length) : null
}

/**
 * 動かせる列の id を表示順で返す。**「完了」は含まない。**
 *
 * 完了列は常に最右に固定されている（機能仕様書 1.1）。掴めもしないし、その右へ他の列を
 * 落とすこともできないので、**並び替えの対象そのものから外して数える。** 含めたまま
 * 添字を扱うと、「完了より右」を毎回どこかで弾く処理が要る。
 */
export function movableListIds(board: Board): string[] {
  const fixedLast = new Set(board.lists.filter((list) => list.is_fixed_last).map((l) => l.id))
  return listIdsInOrder(board).filter((id) => !fixedLast.has(id))
}

/** 掴んでいる列を除いた、動かせる列の並び */
export function movableListIdsWithout(board: Board, draggingId: string): string[] {
  return movableListIds(board).filter((id) => id !== draggingId)
}

/**
 * dnd-kit が返す `over` の id から、何番目に落ちるかを求める（F-21）。
 *
 * **位置は「掴んでいる列を除いた並び」で数える。** タスクのときと同じで、抜いてから
 * 挿す手順に数え方を合わせないと、自分より右へ動かしたときに 1 つずれる。
 *
 * 決まらない場合は null を返す。呼び出し側は移動しない。
 */
export function resolveListDropIndex(
  board: Board,
  overId: string,
  draggingId: string,
): number | null {
  const others = movableListIdsWithout(board, draggingId)

  const overListId = fromColumnDraggableId(overId)
  if (overListId === null) return null

  // 完了列の手前＝動かせる列の末尾
  if (overListId === fixedLastListId(board)) return others.length

  const index = others.indexOf(overListId)
  return index < 0 ? null : index
}

/**
 * その並び替えを反映した list_ids を返す（F-21）。**完了列は必ず末尾に付ける。**
 *
 * サーバーへ送る配列も、画面へ先に描く並びも、これ 1 つから作る。`[←] [→]` の
 * `withSwappedList` と役割は同じで、**求め方が「隣と入れ替える」か「指定の位置へ挿す」か
 * だけが違う。**
 */
export function withMovedList(board: Board, listId: string, index: number): string[] {
  const others = movableListIdsWithout(board, listId)
  const moved = [...others.slice(0, index), listId, ...others.slice(index)]

  const fixedLast = listIdsInOrder(board).filter((id) =>
    board.lists.some((list) => list.id === id && list.is_fixed_last),
  )
  return [...moved, ...fixedLast]
}

/**
 * その移動が並びを変えるかどうか。
 *
 * 同じ場所へ落としただけなら送らない。**送っても結果は同じだが、失敗しうる通信を 1 本
 * 増やし、その間ずっと盤面を触れなくする。** 添字ではなく**移動後の並び**で比べるのは
 * `isSamePlace`（タスク）と同じ理由で、数え方の取り違えに影響されないため。
 */
export function isSameListPlace(board: Board, listId: string, index: number): boolean {
  const current = listIdsInOrder(board)
  const next = withMovedList(board, listId, index)
  return current.length === next.length && current.every((id, i) => id === next[i])
}

/**
 * どこに落ちるかの判定（F-21）。**ポインタのX座標で決める。**
 *
 * 列は横に並ぶので、タスクのY座標をそのままX座標に読み替えたもの。列の中線より左なら
 * その列の手前、どの中線にも届かなければ末尾（＝完了列の左隣）。
 *
 * **距離ベースの判定（closestCenter / closestCorners）は使わない。** 理由はタスクと
 * 同じで、列と列の間の余白にポインタがあっても、いちばん近い受け口が選ばれてしまう
 * （`dropTarget.ts` の注記、#76）。
 *
 * **掴んでいる列自身は候補から外す。** 場所を空けたまま残してあるので、外さないと
 * 自分自身が落ち先になる。
 *
 * **キーボード操作のときだけ距離で決める。** 掴んで矢印で動かす操作にポインタは存在
 * しないため。ここもタスクと同じ作り。
 */
export function createListDropCollisionDetection(board: Board): CollisionDetection {
  return (args) => {
    const { active, droppableRects, pointerCoordinates } = args
    const draggingId = fromColumnDraggableId(String(active.id))
    if (draggingId === null) return []
    if (!pointerCoordinates) return closestColumn(args, board)

    const pointer = pointerCoordinates

    for (const id of movableListIdsWithout(board, draggingId)) {
      const rect = droppableRects.get(toColumnDraggableId(id))
      if (!rect) continue
      if (pointer.x < rect.left + rect.width / 2) return [{ id: toColumnDraggableId(id) }]
    }

    return toEndCollision(board)
  }
}

/**
 * キーボードで動かしているときの落ち先。
 *
 * dnd-kit のキーボードセンサーは「掴んでいるものの座標」を動かすので、**ポインタは
 * 無いが矩形はある。** ただし、**マウスと同じ「中線を越えたか」では決められない。**
 *
 * **列の幅はすべて同じ 300px なので、矢印を1回押すと矩形が隣の列とほぼ重なる。**
 * そのとき中心も隣の列の中線とほぼ同じ位置に来るため、**越えたかどうかの境目そのものに
 * 乗る。** 実際、引き返すときに1回目の入力が空振りし、2回押さないと落ち先が変わらない
 * 状態になっていた（#93 で発見）。左右のどちらでも起きる。
 *
 * **そこで、矩形がいまどの列の場所に載っているかで決める。** キーボードで動かすと、
 * 掴んでいる矩形は**列の場所そのものへ飛ぶ**（列は等幅で等間隔に並んでいるため）。
 * いちばん近い場所を選び、それが自分より右なら後ろ、左なら手前に入れる。**距離は
 * 「どの列の場所か」を決めるためだけに使い、前後は並びの添字で決める**ので、境目の
 * 揺れが影響しない。押した回数と落ち先の動きが1対1で対応する。
 *
 * **掴んでいる列自身の場所も候補に入れる。** 外すと、掴んだ直後（まだ1回も動かして
 * いない時点）でも必ず隣が選ばれ、**線がいきなり隣へ飛ぶ**（#93 で実際に起きた）。
 * 自分の場所がいちばん近いなら、落ち先はいまの位置。
 */
function closestColumn(
  args: Parameters<CollisionDetection>[0],
  board: Board,
): ReturnType<CollisionDetection> {
  const { active, collisionRect, droppableRects } = args
  const draggingId = fromColumnDraggableId(String(active.id))
  if (draggingId === null) return []

  const movable = movableListIds(board)
  const others = movableListIdsWithout(board, draggingId)
  const center = collisionRect.left + collisionRect.width / 2

  let nearest: string | null = null
  let shortest = Number.POSITIVE_INFINITY

  for (const id of movable) {
    const rect = droppableRects.get(toColumnDraggableId(id))
    if (!rect) continue

    const distance = Math.abs(center - (rect.left + rect.width / 2))
    if (distance < shortest) {
      shortest = distance
      nearest = id
    }
  }

  if (nearest === null) return [{ id: LIST_END_DROPPABLE_ID }]

  // 自分の場所がいちばん近い＝いまの位置のまま。手前にいる列の数がそのまま添字になる
  const stayIndex = movable.indexOf(draggingId)
  const nearestIndex = movable.indexOf(nearest)

  const index =
    nearest === draggingId
      ? stayIndex
      : nearestIndex < stayIndex
        ? // 左にある列。その手前に入る
          others.indexOf(nearest)
        : // 右にある列。その後ろに入る
          others.indexOf(nearest) + 1

  const before = others[index]
  return before ? [{ id: toColumnDraggableId(before) }] : toEndCollision(board)
}

/**
 * キーボードで列を動かすときの座標（F-21）。**自前で計算する。**
 *
 * dnd-kit が用意している `sortableKeyboardCoordinates` は使わない。あれは
 * **「次に行くべき受け口の矩形」を探して、その位置へ飛ばす**作りなので、受け口の形が
 * 揃っていないと、意図しない縦方向の移動が混ざる。**列は中身なりの高さで、隣とは形が
 * 違う。** 実際、右を押すたびに掴んだ列がわずかに下へ沈む状態になっていた（#93）。
 *
 * **ここでは列を1つ分だけ横へずらし、Y座標は掴んだときのまま固定する。**
 * 列は等幅・等間隔に並んでいるので、間隔は隣り合う2つの左端の差から求まる（値を
 * 定数で持たない）。**上下のキーでは動かさない** — 列は横に並んでいるため。
 *
 * **両端では止める。** 行き過ぎた分だけ押し戻す手間を作らないため。
 */
export function createListKeyboardCoordinateGetter(board: Board): KeyboardCoordinateGetter {
  return (event, { currentCoordinates, context }) => {
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (direction === 0) return undefined

    const { active, droppableRects } = context
    if (!active) return undefined

    const activeRect = droppableRects.get(active.id)
    const rects = movableListIds(board)
      .map((id) => droppableRects.get(toColumnDraggableId(id)))
      .filter((rect) => rect !== undefined)

    // 間隔を求めるには2つ要る。1つしか動かせる列が無ければ、動かす先も無い
    if (!activeRect || rects.length < 2) return undefined

    const pitch = rects[1].left - rects[0].left
    const left = rects[0].left
    const right = rects[rects.length - 1].left

    return {
      x: Math.min(Math.max(currentCoordinates.x + direction * pitch, left), right),
      // **縦は動かさない。** 掴んだ高さのまま横へ運ぶ
      y: activeRect.top,
    }
  }
}

/**
 * 「動かせる列の末尾」を指す判定結果。**完了列を指す。**
 *
 * 完了列が無ければ何も返さない。そのまま離しても移動しない（`over` が決まらないため）。
 */
function toEndCollision(board: Board): ReturnType<CollisionDetection> {
  const done = fixedLastListId(board)
  return done ? [{ id: toColumnDraggableId(done) }] : []
}
