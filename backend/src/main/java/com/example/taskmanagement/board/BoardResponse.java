package com.example.taskmanagement.board;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * GET /api/board のレスポンス。形は docs/design/api.md 3.1 が正。
 *
 * <p>エンティティをそのまま返さないのは、返さないと決めたもの（created_at / updated_at）を
 * 露出させないため、および DB の構造変更が API の形に直接波及しないようにするため。
 *
 * <p>JSON のキーは snake_case に変換される。application.properties の
 * {@code spring.jackson.property-naming-strategy=SNAKE_CASE} が効くので、
 * ここのフィールド名は camelCase のままでよい（isDefault → is_default）。
 */
public record BoardResponse(UUID id, String title, List<ListResponse> lists) {

    public static BoardResponse from(Board board) {
        return new BoardResponse(
                board.getId(),
                board.getTitle(),
                board.getLists().stream().map(ListResponse::from).toList());
    }

    public record ListResponse(
            UUID id,
            String title,
            boolean isDefault,
            boolean isFixedLast,
            int position,
            List<CardResponse> cards) {

        static ListResponse from(TaskList list) {
            return new ListResponse(
                    list.getId(),
                    list.getTitle(),
                    list.isDefault(),
                    list.isFixedLast(),
                    list.getPosition(),
                    list.getCards().stream().map(CardResponse::from).toList());
        }
    }

    public record CardResponse(
            UUID id,
            String title,
            String description,
            OffsetDateTime dueAt,
            boolean hasDueTime,
            int position) {

        static CardResponse from(Card card) {
            return new CardResponse(
                    card.getId(),
                    card.getTitle(),
                    card.getDescription(),
                    card.getDueAt(),
                    card.isHasDueTime(),
                    card.getPosition());
        }
    }
}
