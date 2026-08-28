package com.example.taskmanagement.board;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * PATCH /api/lists/{id} のリクエスト（docs/design/api.md 3.3）。
 *
 * <p>受け取るのは名前だけ。position はこのエンドポイントでは変えられず、並び替えは
 * PATCH /api/lists/reorder が担う（F-05）。
 *
 * @param title リスト名。空でなく 50 文字以内
 */
public record UpdateListRequest(
        @NotBlank @Size(max = 50) String title) {
}
