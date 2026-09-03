package com.example.taskmanagement.board;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CardRepository extends JpaRepository<Card, UUID> {

    /**
     * リスト内のタスク件数。200 件の上限判定に使う（docs/design/api.md 2.3）。
     *
     * <p>{@code max(position)} で代用しないのは、position が 0 始まりの連番であることに
     * 依存した判定になるため。件数の上限は件数で数える（docs/design/database.md 4章）。
     */
    int countByListId(UUID listId);

    /**
     * リスト内の既存タスクの position をまとめて 1 つ後ろへずらす。
     *
     * <p>先頭への追加（F-06）は「既存を +1 して新規に 0 を振る」で実現する
     * （docs/design/database.md 4章）。1 件ずつ読み出して更新すると最大 200 回の
     * UPDATE になるので、JPQL の一括 UPDATE にする。
     *
     * <p>一括 UPDATE は永続化コンテキストを迂回して DB を直接書き換える。そのため
     * flushAutomatically で実行前に保留中の変更を書き出し、clearAutomatically で実行後に
     * 古い値を持ったままのエンティティを捨てる。これを付けないと、同じトランザクション内で
     * 読み直したときに +1 前の position が返る。
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Card c set c.position = c.position + 1 where c.list.id = :listId")
    void shiftPositionsDown(@Param("listId") UUID listId);

    /**
     * 削除された位置より後ろのタスクの position を 1 つ前へ詰める。
     *
     * <p>削除（F-08）で空いた番号を残さないため（docs/design/api.md 3.8）。position は
     * 0 始まりの連番であることを前提に扱っているので、穴が空いたままだと以降の採番が狂う。
     *
     * <p>一括 UPDATE の注意点は {@link #shiftPositionsDown} と同じ。
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update Card c set c.position = c.position - 1
            where c.list.id = :listId and c.position > :position
            """)
    void shiftPositionsUp(@Param("listId") UUID listId, @Param("position") int position);

    /** リスト内のタスクを並び順で取得する。移動元を詰め直すときに、残りの顔ぶれを知るために使う。 */
    List<Card> findByListIdOrderByPositionAsc(UUID listId);

    /**
     * タスクの所属リストと位置を置く（F-13, F-23）。
     *
     * <p>移動と並び替えを 1 つのメソッドで扱う。同じリスト内の並び替えは「今と同じリストに
     * 置き直す」ことになるだけで、別の処理にする理由がない。
     *
     * <p>コレクションを操作せず JPQL で直接書き換えているのは、TaskList.cards の
     * {@code orphanRemoval = true} を踏まないため。移動元のコレクションからタスクを外すと、
     * 「親から切り離された＝削除」と解釈されて消える。
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Card c set c.list = :list, c.position = :position where c.id = :id")
    void placeCard(@Param("id") UUID id, @Param("list") TaskList list, @Param("position") int position);
}
