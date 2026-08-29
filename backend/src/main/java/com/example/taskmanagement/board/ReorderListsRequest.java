package com.example.taskmanagement.board;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;

/**
 * PATCH /api/lists/reorder のリクエスト（docs/design/api.md 3.5）。
 *
 * @param listIds <strong>変更後の並び順すべて。</strong>配列の添字がそのまま position になる。
 *                <p>1 件だけ「これをここへ動かす」と受け取る形にしない。並び順を丸ごと受け取れば、
 *                「完了列が最右か」を<strong>末尾の要素だけ見て</strong>判定でき、移動元・移動先を
 *                個別に検査せずに済む（api.md 3.5 の注）。
 */
public record ReorderListsRequest(
        @NotEmpty List<@NotNull UUID> listIds) {
}
