package com.example.taskmanagement.board;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface BoardRepository extends JpaRepository<Board, UUID> {

    /**
     * ボード・リスト・タスクを 1 クエリでまとめて取得する。
     *
     * <p>JOIN FETCH を使わずに board.getLists() → list.getCards() と辿ると、
     * リストの数だけ追加の SELECT が飛ぶ（N+1）。データは正しく取れてしまい画面上は
     * 正常に見えるため、発行 SQL のログを見ないと気づけない。
     * docs/design/database.md が「JPA では黙っていると必ず踏む」と明記している箇所。
     *
     * <p>{@code distinct} は、JOIN によって Board が行数ぶん重複して返るのを畳むため。
     *
     * <p>lists と cards は両方 @OrderBy("position ASC") が付いているため、
     * この 1 クエリの結果がそのまま position の昇順で組み立てられる。
     *
     * <p>両コレクションが Set なのは、List（Hibernate の言う bag）を 2 段ぶん同時に
     * JOIN FETCH すると {@code MultipleBagFetchException} になるため。実際にこの実装でも
     * 一度踏んだ。
     */
    @Query("""
            select distinct b from Board b
            left join fetch b.lists l
            left join fetch l.cards
            """)
    Optional<Board> findBoardWithListsAndCards();
}
