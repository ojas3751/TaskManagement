package com.example.taskmanagement.board;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/**
 * POST /api/cards のリクエスト（docs/design/api.md 3.6）。
 *
 * <p>受け取るのはこの 3 つだけ。説明文と期限は追加時に受け取らず、追加直後は
 * 空文字・期限なしになる。編集は PATCH /api/cards/{id} が担当する。
 *
 * <p>JSON の {@code list_id} がここの {@code listId} に対応する。レスポンスと同じく
 * {@code spring.jackson.property-naming-strategy=SNAKE_CASE} が効くので、
 * フィールド名は camelCase のままでよい。
 *
 * @param id     クライアントが採番した UUID。楽観的更新のため、サーバーでは振らない
 * @param listId 追加先のリスト
 * @param title  タスク名。空でなく 100 文字以内
 */
public record CreateCardRequest(
        @NotNull UUID id,
        @NotNull UUID listId,
        @NotBlank @Size(max = 100) String title) {
}
