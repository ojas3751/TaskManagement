package com.example.taskmanagement.board;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;

/**
 * PATCH /api/cards/move のリクエスト（docs/design/api.md 3.9）。
 *
 * <p>ドラッグ&ドロップ（F-13）と詳細モーダルからの移動（F-23）が同じ形を使う。入力手段が
 * 違うだけで、行われる操作は同一のため。
 *
 * @param cardId     移動するタスク
 * @param fromListId 移動元のリスト。同一リスト内の並び替えでは toListId と同じ値になる
 * @param toListId   移動先のリスト
 * @param toCardIds  <strong>移動後の、移動先リストの並び順すべて。</strong>配列の添字が
 *                   そのまま position になる。cardId を必ず含む。
 *                   <p>移動元の並びは受け取らない。タスクが 1 件抜けるだけなので、残りを
 *                   詰めて振り直せば足りる。両方を画面に組み立てさせると、送る側の仕事が
 *                   増えるうえ、片方だけ間違っていても気づけない
 */
public record MoveCardRequest(
        @NotNull UUID cardId,
        @NotNull UUID fromListId,
        @NotNull UUID toListId,
        @NotEmpty List<@NotNull UUID> toCardIds) {
}
