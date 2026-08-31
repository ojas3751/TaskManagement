import {
  type CollisionDetection,
  type DroppableContainer,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { Board } from '../api/types'
import { fromColumnDraggableId } from './listDropTarget'

/**
 * 列そのものをドロップの受け口として登録するときの id（F-13）。
 *
 * **タスクの id と衝突しない形にする必要がある。** dnd-kit は受け口を id で区別するので、
 * 列とタスクが同じ名前空間に並ぶ。列の id をそのまま使うと、`over` に返ってきた id が
 * 「列」なのか「タスク」なのか判別できない。
 *
 * タスクの id は UUID（データベース設計）でコロンを含まないため、接頭辞で分けられる。
 */
const LIST_PREFIX = 'list:'

export function toListDroppableId(listId: string): string {
  return `${LIST_PREFIX}${listId}`
}

export function isListDroppableId(id: string): boolean {
  return id.startsWith(LIST_PREFIX)
}

/** 列の受け口の id から列の id を取り出す。列の受け口でなければ null */
export function fromListDroppableId(id: string): string | null {
  return isListDroppableId(id) ? id.slice(LIST_PREFIX.length) : null
}

/** 落ちる先。`index` は移動先リストの中で何番目に入るか */
export type DropTarget = {
  listId: string
  index: number
}

/** 掴んでいるタスクを除いた、その列の並び（position の昇順） */
export function orderedIdsWithout(board: Board, listId: string, draggingId: string): string[] {
  const list = board.lists.find((l) => l.id === listId)
  if (!list) return []

  return [...list.cards]
    .sort((a, b) => a.position - b.position)
    .map((card) => card.id)
    .filter((id) => id !== draggingId)
}

/**
 * dnd-kit が返す `over` の id から、落ちる先を求める（F-13）。
 *
 * 重なった相手は 2 種類ある。
 *
 * - **タスク**（**そのタスクの手前**に入る）
 * - **列そのもの**（末尾に入る）。タスクが 0 件の列に落とせるのはこの経路
 *
 * **位置は「掴んでいるタスクを除いた並び」で数える。** `toCardIdsForInsert` が
 * 抜いてから挿す手順なので、数え方を合わせないと同じ列の中で 1 つずれる。
 *
 * 落ちる先が決まらない場合は null を返す。呼び出し側は移動しない。
 */
export function resolveDropTarget(
  board: Board,
  overId: string,
  draggingId: string,
): DropTarget | null {
  const overListId = fromListDroppableId(overId)
  if (overListId !== null) {
    const list = board.lists.find((l) => l.id === overListId)
    return list
      ? { listId: overListId, index: orderedIdsWithout(board, overListId, draggingId).length }
      : null
  }

  const list = board.lists.find((l) => l.cards.some((card) => card.id === overId))
  if (!list) return null

  const index = orderedIdsWithout(board, list.id, draggingId).indexOf(overId)
  return index < 0 ? null : { listId: list.id, index }
}

/**
 * どこに落ちるかの判定（F-13）。
 *
 * **ポインタのY座標で決める。** 画面設計 3章の「ポインタのY座標が、どのタスクの
 * 前後に入るかを示す」がこれにあたる。中線より上ならそのタスクの手前、どのタスクの
 * 中線にも届かなければ末尾。
 *
 * **dnd-kit が持つ距離ベースの判定（closestCenter / closestCorners）は使えない。**
 * 受け口の重心や四隅との近さで選ぶため、
 *
 * - 列と列の間の余白にポインタがあっても、いちばん近い列が移動先になる（#76）
 * - カードとカードの隙間では、カードではなく列そのものが選ばれ、末尾へ飛ぶ
 *
 * **掴んでいるタスク自身は候補から外す。** 透明にして場所だけ残してあるので、
 * 外さないと自分自身が落ち先になる。空いた場所は隣のタスクの領域として扱われる。
 *
 * **キーボード操作のときだけ距離で決める。** 掴んで矢印で動かす操作にポインタは
 * 存在しないので、Y座標を問えない。
 */
export function createDropCollisionDetection(board: Board): CollisionDetection {
  return (args) => {
    const { active, droppableContainers, droppableRects, pointerCoordinates } = args
    if (!pointerCoordinates) return keyboardCardCollision(args, board)

    const pointer = pointerCoordinates

    // ポインタが載っている列。**どこにも載っていなければ何も返さない。**
    // そのまま離せば移動しない（画面設計 3章）
    const listContainer = droppableContainers.find((container) => {
      if (fromListDroppableId(String(container.id)) === null) return false
      const rect = droppableRects.get(container.id)
      if (!rect) return false
      return (
        pointer.x >= rect.left &&
        pointer.x <= rect.left + rect.width &&
        pointer.y >= rect.top &&
        pointer.y <= rect.top + rect.height
      )
    })
    if (!listContainer) return []

    const listId = fromListDroppableId(String(listContainer.id))
    if (listId === null) return []

    for (const id of orderedIdsWithout(board, listId, String(active.id))) {
      const rect = droppableRects.get(id)
      if (!rect) continue
      if (pointer.y < rect.top + rect.height / 2) return [{ id }]
    }

    return [{ id: listContainer.id }]
  }
}

/** そのタスクがいまいる列の id */
export function listIdOfCard(board: Board, cardId: string): string | null {
  return board.lists.find((list) => list.cards.some((card) => card.id === cardId))?.id ?? null
}

/**
 * いま掴んでいるものが**乗っている列**（#97）。
 *
 * **「元いた列」と混同しないこと。** 盤面は落とすまで変わらないので、`listIdOfCard` は
 * ドラッグ中もずっと**元の列**を返す。キーボードで隣の列へ移った後は、行き先も、
 * 上下に動ける範囲も、**乗っている列**で決まる。
 *
 * この取り違えで3つの不具合が出ていた。①別の列で `↓` を連打すると**元の列の行数ぶん**
 * 下がる ②別の列で**一番上に置けない** ③**元いた列が一番左だと、そこへ戻れない**。
 *
 * 列の受け口の矩形に対して、掴んでいるものの中心のX座標を見る。どの列にも載っていなければ
 * いちばん近い列にする（列と列の間の余白に居るとき）。
 */
function hoveredListId(
  board: Board,
  rect: { left: number; width: number },
  droppableRects: Map<string, { left: number; width: number }>,
): string | null {
  const center = rect.left + rect.width / 2

  let nearest: string | null = null
  let shortest = Number.POSITIVE_INFINITY

  for (const list of board.lists) {
    const listRect = droppableRects.get(toListDroppableId(list.id))
    if (!listRect) continue

    if (center >= listRect.left && center <= listRect.left + listRect.width) return list.id

    const distance = Math.abs(center - (listRect.left + listRect.width / 2))
    if (distance < shortest) {
      shortest = distance
      nearest = list.id
    }
  }
  return nearest
}

/**
 * その列で、掴んでいるものを置ける場所の上端の一覧（#97）。**上から順。**
 *
 * **元いた列では、カードの数だけ場所がある。** 自分がいまいる場所も1つに数えるため
 * （いちばん下の場所へ動かすことが「末尾に入れる」にあたる）。
 *
 * **別の列では、カードの数より1つ多い。** 自分はまだそこに居ないので、**最後のカードの
 * 後ろ**が余分に1つ増える。ここを数え落とすと末尾に入れられない。
 *
 * 余分な1つの位置は、**最後のカードの下端＋間隔**。間隔は隣り合う2枚から測る
 * （値を定数で持たない）。1枚しか無いときは、そのカードの高さぶん下に置く。
 */
function slotTops(
  board: Board,
  listId: string,
  droppableRects: Map<string, { top: number; height: number }>,
  isOwnList: boolean,
): number[] {
  const rects = orderedIds(board, listId)
    .map((id) => droppableRects.get(id))
    .filter((rect) => rect !== undefined)

  const tops = rects.map((rect) => rect.top)
  if (isOwnList || rects.length === 0) return tops

  const last = rects[rects.length - 1]
  const gap = rects.length >= 2 ? rects[1].top - (rects[0].top + rects[0].height) : 0
  return [...tops, last.top + last.height + gap]
}

/** 表示順（position の昇順）に並べた、その列のタスクの id */
export function orderedIds(board: Board, listId: string): string[] {
  const list = board.lists.find((l) => l.id === listId)
  if (!list) return []
  return [...list.cards].sort((a, b) => a.position - b.position).map((card) => card.id)
}

/**
 * キーボードで動かしているときの落ち先（F-13、#97）。
 *
 * **`closestCorners` に任せるのをやめた。** あれは受け口を距離だけで選ぶので、
 *
 * - **列を区別しない。** 2件の列の一番下を狙うと、**4件の列の3番目**が選ばれる
 * - **「末尾」を指せない。** 末尾を表す受け口（`list:`）は列の**上端**から始まるため、
 *   下方向の候補として選ばれない
 *
 * **列の並び替え（#93）で作ったものと同じ考え方にする。** いちばん近い場所を選び、
 * **自分の場所も候補に入れて**、掴んでいるタスクとの前後関係で入れる側を決める。
 * こうすると「最後のカードの場所へ動かす＝末尾に入れる」が自然に表せる。
 */
function keyboardCardCollision(
  args: Parameters<CollisionDetection>[0],
  board: Board,
): ReturnType<CollisionDetection> {
  const { active, collisionRect, droppableRects } = args
  const cardId = String(active.id)

  // **いま乗っている列**で決める。元いた列ではない（hoveredListId のコメント）
  const listId = hoveredListId(board, collisionRect, droppableRects)
  if (listId === null) return []

  const end = [{ id: toListDroppableId(listId) }]
  const others = orderedIdsWithout(board, listId, cardId)

  /** `others` の何番目に入るかを、受け口の id で表す。末尾なら列そのもの */
  const at = (index: number) => {
    const before = others[index]
    return before ? [{ id: before }] : end
  }

  const isOwnList = listId === listIdOfCard(board, cardId)
  const tops = slotTops(board, listId, droppableRects, isOwnList)
  if (tops.length === 0) return end

  // **場所の一覧の中で、いまいちばん近いものを選ぶ。** 座標を動かす側（withinList）と
  // 同じ数え方をしているので、押した回数と落ち先が1対1で対応する。
  // **中線で前後を決める方式は採らない** — 上端が揃ったときに境目に乗り、
  // 別の列では一番上に置けなくなる（#97）
  let slot = 0
  let shortest = Number.POSITIVE_INFINITY
  tops.forEach((top, index) => {
    const distance = Math.abs(collisionRect.top - top)
    if (distance < shortest) {
      shortest = distance
      slot = index
    }
  })

  // **場所の番号が、そのまま「何番目に入るか」になる。** 別の列では自分がまだそこに
  // 居ないため、元いた列では自分を抜いて数え直すぶんが相殺されるため、どちらも同じ式で済む。
  // （元の列で [A,B,C] の A を掴んだ場合、B の場所を選ぶ＝「B の後ろ」で、
  //   自分を抜いた並び [B,C] では添字 1。場所の番号も 1）
  return at(slot)
}

/**
 * キーボードでタスクを動かすときの座標（F-13、#97）。
 *
 * **dnd-kit の `sortableKeyboardCoordinates` を使うが、候補を絞ってから渡す。**
 *
 * あれは**登録されている受け口をすべて候補にする**（押した向きで絞り、いちばん近いものを
 * 選ぶだけ）。そこに**列のタスク一覧そのものの受け口**（`list:`）が入っている。これは
 * タスクが0件の列に落とせるようにするためのもので、**カードより一回り大きく、左端も
 * 上端もカードの外側にある。**
 *
 * その結果、**一番上のカードで `↑` を押すと、上に他のカードが無いためこの受け口が選ばれ、
 * その左上へ飛ぶ**（掴んだカードが左へずれる）。さらに押すと、自分の列にはもう上が無いので
 * **他の列の同じ受け口へ渡り歩き、いちばん左の列の左上に張り付く。**
 *
 * **上下は自前で計算する。** 絞り込みでは足りないため。dnd-kit の絞り込みは
 * **「いまより下（上）にあるか」しか見ておらず、列を区別しない。** 2件の列の一番下から
 * `↓` を押すと、**4件の列の3番目**が選ばれる。**同じ列のカードの場所を、順に移るだけ**に
 * 変えた。
 *
 * **自分の場所も1つの場所として数える。** 3件の列なら行き先は3つあり、**いちばん下の
 * 場所へ動かすことが「末尾に入れる」**にあたる。落ち先の判定側（keyboardCardCollision）も
 * 同じ数え方をしている。
 *
 * **左右は絞り込みで足りる。** 列をまたぐ移動なので、**行き先が他の列にある**ことが
 * 向きから決まる。0件の列にはカードが無いため、**その列の受け口を候補に残す**必要がある。
 *
 * **列を掴むための受け口（`column:`）は、上下・左右のどちらでも外す。** タスクの
 * 行き先ではないため。**編集モード外では列を掴めないようにしてあるが、受け口としては
 * 候補に残っている**（掴めないことと、落とせないことは別に切れる）。**列の左上へ飛ぶ
 * 現象は、こちらが原因だった**（#97 で実測して確定）。
 *
 * **#93 で列の並び替えに起きたのと構造は同じ**（形の違う受け口が移動先の候補に混ざる）。
 */
export function createCardKeyboardCoordinateGetter(board: Board): KeyboardCoordinateGetter {
  return (event, args) => {
    const direction = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (direction !== 0) return withinList(args, board, direction)

    const containers = args.context.droppableContainers
    const { collisionRect, droppableRects } = args.context

    // **外すのは「いま乗っている列」。元いた列ではない。** 元の列を外すと、
    // そこが一番左だった場合に**二度と戻れなくなる**（#97）
    const hovered = collisionRect ? hoveredListId(board, collisionRect, droppableRects) : null

    // `getEnabled` と `get` しか使われない（dnd-kit の実装で確認）。元のオブジェクトを
    // 包まずに作り直しているのは、Map を継承した実体で、複製すると get が壊れるため
    const keep = (entry: DroppableContainer) => {
      const id = String(entry.id)
      if (fromColumnDraggableId(id) !== null) return false

      // **いま乗っている列のものは、どれも候補にしない。** 左右は列をまたぐ移動であり、
      // その列の受け口はカードより左端が外側にあるため、**列をまたがずに
      // 数十pxだけ左へずれる**動きになる
      const listId = fromListDroppableId(id)
      if (listId !== null) return listId !== hovered
      return listIdOfCard(board, id) !== hovered
    }

    const filtered = {
      getEnabled: () => containers.getEnabled().filter(keep),
      get: (id: string) => containers.get(id),
    }

    return sortableKeyboardCoordinates(event, {
      ...args,
      context: { ...args.context, droppableContainers: filtered as typeof containers },
    })
  }
}

/**
 * 上下キーで、同じ列の中を1つずつ動く（#97）。
 *
 * **行き先はカードの「場所」で、自分がいまいる場所も1つに数える。** 3件の列なら場所は
 * 3つあり、**いちばん下の場所へ動かすことが「末尾に入れる」**にあたる。落ち先を決める
 * `keyboardCardCollision` も同じ数え方をしている。
 *
 * **端では動かさない。** 押しても何も起きないのが正しい。
 *
 * **X座標は変えない。** 上下の移動で横にずれる理由が無い。
 */
function withinList(
  args: Parameters<KeyboardCoordinateGetter>[1],
  board: Board,
  direction: -1 | 1,
): ReturnType<KeyboardCoordinateGetter> {
  const { active, collisionRect, droppableRects } = args.context
  if (!active || !collisionRect) return undefined

  // **いま乗っている列**の中を動く。元いた列ではない（hoveredListId のコメント）
  const listId = hoveredListId(board, collisionRect, droppableRects)
  if (listId === null) return undefined

  const tops = slotTops(board, listId, droppableRects, listId === listIdOfCard(board, String(active.id)))
  if (tops.length === 0) return undefined

  // いまどの場所に載っているか。**上端どうしの近さで決める**
  let current = 0
  let shortest = Number.POSITIVE_INFINITY
  tops.forEach((top, index) => {
    const distance = Math.abs(collisionRect.top - top)
    if (distance < shortest) {
      shortest = distance
      current = index
    }
  })

  const next = current + direction
  if (next < 0 || next >= tops.length) return undefined

  return { x: args.currentCoordinates.x, y: tops[next] }
}

/**
 * その移動が盤面を変えるかどうか。
 *
 * 同じ列の同じ位置へ落としただけなら送らない。**送っても結果は同じだが、失敗しうる
 * 通信を 1 本増やし、その間ずっと盤面を触れなくする**ことになる。
 *
 * 添字どうしを比べるのではなく、**移動後の並びが今と同じか**で見る。添字の比較は
 * 「抜く前に数えるか、抜いた後に数えるか」を取り違えると静かに間違うが、並びどうしなら
 * 数え方に依らない。
 */
export function isSamePlace(board: Board, cardId: string, target: DropTarget): boolean {
  const list = board.lists.find((l) => l.cards.some((card) => card.id === cardId))
  if (!list || list.id !== target.listId) return false

  const current = [...list.cards].sort((a, b) => a.position - b.position).map((card) => card.id)

  const others = orderedIdsWithout(board, target.listId, cardId)
  const next = [...others.slice(0, target.index), cardId, ...others.slice(target.index)]

  return current.length === next.length && current.every((id, i) => id === next[i])
}
