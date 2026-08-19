package com.example.taskmanagement.board;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

/**
 * リスト（列）。テーブル名は lists。
 *
 * <p>クラス名を {@code List} にすると {@link java.util.List} と衝突するため {@code TaskList} とする。
 * 利用者に見える呼称は「リスト」（docs/README.md「呼び方について」）。
 */
@Entity
@Table(name = "lists")
public class TaskList {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    /**
     * 所属ボード。LAZY にしているのは、リスト単体を扱うときに親を毎回読みに行かせないため。
     * GET /api/board では Board 側から JOIN FETCH で辿るので、ここが遅延ロードでも問題ない。
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @Column(name = "title", nullable = false)
    private String title;

    /** true のリストは改名・削除を拒否する（docs/design/api.md 2.3）。 */
    @Column(name = "is_default", nullable = false)
    private boolean isDefault;

    /** true のリスト（完了列）は常に最右に固定する。 */
    @Column(name = "is_fixed_last", nullable = false)
    private boolean isFixedLast;

    /** ボード内での並び順。0 始まりの単純連番（docs/design/database.md 4章）。 */
    @Column(name = "position", nullable = false)
    private int position;

    /** 型が Set である理由は {@link Board#getLists()} と同じ。 */
    @OneToMany(mappedBy = "list", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position ASC")
    private Set<Card> cards = new LinkedHashSet<>();

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime updatedAt;

    /** JPA が使う。アプリケーションからは呼ばない。 */
    protected TaskList() {
    }

    public TaskList(UUID id, Board board, String title, boolean isDefault, boolean isFixedLast, int position) {
        this.id = id;
        this.board = board;
        this.title = title;
        this.isDefault = isDefault;
        this.isFixedLast = isFixedLast;
        this.position = position;
    }

    public UUID getId() {
        return id;
    }

    public Board getBoard() {
        return board;
    }

    public String getTitle() {
        return title;
    }

    public boolean isDefault() {
        return isDefault;
    }

    public boolean isFixedLast() {
        return isFixedLast;
    }

    public int getPosition() {
        return position;
    }

    public Set<Card> getCards() {
        return cards;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
