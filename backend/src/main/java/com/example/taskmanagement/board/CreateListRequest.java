package com.example.taskmanagement.board;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/**
 * POST /api/lists のリクエスト（docs/design/api.md 3.2）。
 *
 * <p>挿入位置は受け取らない。追加先は常に「完了」列（{@code is_fixed_last}）の左隣であり、
 * position の採番はサーバーだけが持つ（api.md 3.2）。
 *
 * @param id    クライアントが採番した UUID。楽観的更新のため、サーバーでは振らない
 * @param title リスト名。空でなく 50 文字以内
 */
public record CreateListRequest(
        @NotNull UUID id,
        @NotBlank @Size(max = 50) String title) {
}
