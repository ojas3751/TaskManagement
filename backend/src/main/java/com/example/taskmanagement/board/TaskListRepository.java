package com.example.taskmanagement.board;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * リストの取得。タスク追加時に、指定された list_id が実在するかの確認と、
 * Card に持たせる親の参照の解決に使う。リストの追加（F-02）では、挿入位置の決定と
 * position の振り直しにも使う。
 */
public interface TaskListRepository extends JpaRepository<TaskList, UUID> {

    /**
     * ボード内の「追加された」リストの件数。10 件の上限判定に使う（docs/design/api.md 2.3）。
     *
     * <p>seed の 3 列（{@code is_default}）は数えない。利用者が消せない列を上限に含めると、
     * 使える枠が列の初期構成に左右されるため。
     *
     * <p>{@code max(position)} で代用しない理由は {@link CardRepository#countByListId} と同じ。
     */
    int countByBoardIdAndIsDefaultFalse(UUID boardId);

    /**
     * 「完了」列を取得する（F-02 の挿入位置の基準）。
     *
     * <p>列名ではなく {@code is_fixed_last} で引く。名前で引くと、改名できるようになった
     * 時点（F-03）で壊れる。
     *
     * <p>ボードを跨いで探しているのは、MVP のボードが 1 件しかないため（api.md 3.1）。
     * F-19 でボードが増えたら、ここに board_id の条件が要る。
     */
    Optional<TaskList> findByIsFixedLastTrue();

    /**
     * 指定位置以降のリストの position をまとめて 1 つ後ろへずらす。
     *
     * <p>「完了」列の左隣への挿入（F-02）は「完了列の位置から後ろを +1 して、空いた番号を
     * 新しいリストに振る」で実現する。
     *
     * <p>一括 UPDATE の注意点は {@link CardRepository#shiftPositionsDown} と同じ。
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update TaskList l set l.position = l.position + 1
            where l.board.id = :boardId and l.position >= :position
            """)
    void shiftPositionsDown(@Param("boardId") UUID boardId, @Param("position") int position);
}
