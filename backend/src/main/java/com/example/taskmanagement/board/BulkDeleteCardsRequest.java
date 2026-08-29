package com.example.taskmanagement.board;

import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;

/**
 * POST /api/cards/bulk-delete のリクエスト（docs/design/api.md 3.10）。
 *
 * <p><strong>{@code @NotEmpty} は付けない。</strong>付けると {@code @Valid} が
 * MethodArgumentNotValidException を投げ、GlobalExceptionHandler の VALIDATION_TARGETS に
 * 載っていないリクエストは汎用の {@code INVALID_REQUEST} になる。仕様が定めている
 * {@code CARD_IDS_REQUIRED} を返せない（ReorderListsRequest が実際にその状態）。
 *
 * <p>そのため<strong>空かどうかの判定は BoardService が行う。</strong>2 項目にまたがる検証を
 * DueTimeWithoutDueDateException で扱っているのと同じ考え方で、「@Valid の枠組みで表せない
 * ものはサービスが投げる」に揃えてある。
 *
 * @param cardIds 削除するタスクの ID。<strong>重複していてもよい</strong>（サービスが集合にして潰す）
 */
public record BulkDeleteCardsRequest(
        List<@NotNull UUID> cardIds) {
}
