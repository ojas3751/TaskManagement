package com.example.taskmanagement.board;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;

/**
 * PATCH /api/cards/{id} のリクエスト（docs/design/api.md 3.7）。
 *
 * <p><strong>4 項目すべてを毎回送る。</strong>部分更新にしないのは、詳細モーダルが 4 項目を
 * まとめて保存するため。送る側・受ける側の両方が単純になる。
 *
 * <p>したがって期限の 2 項目も最初から受け取る。画面側の入力欄が揃うのは Step 5（F-09）だが、
 * それまでは現在の値をそのまま送り返してもらう。
 *
 * @param title       タスク名。空でなく 100 文字以内
 * @param description 説明文。未入力は空文字を送る（null は送らない、api.md 2.5）
 * @param dueAt       期限。null は「期限なし」
 * @param hasDueTime  時分まで指定されたか。due_at が 00:00 のとき、未入力か 0 時指定かを
 *                    区別するために持つ。dueAt が null のとき true にはできない
 */
public record UpdateCardRequest(
        @NotBlank @Size(max = 100) String title,
        @NotNull @Size(max = 5000) String description,
        OffsetDateTime dueAt,
        boolean hasDueTime) {
}
