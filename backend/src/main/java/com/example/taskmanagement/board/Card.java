package com.example.taskmanagement.board;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * タスク。テーブル名は cards のまま（docs/README.md「呼び方について」）。
 */
@Entity
@Table(name = "cards")
public class Card {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    /** 所属リストの唯一の情報源。board_id は持たない（lists を辿れば特定できる）。 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "list_id", nullable = false)
    private TaskList list;

    @Column(name = "title", nullable = false)
    private String title;

    /** 未入力は空文字。null と空文字を混在させない（docs/design/api.md 2.5）。 */
    @Column(name = "description", nullable = false)
    private String description = "";

    /** null は「期限なし」。 */
    @Column(name = "due_at")
    private OffsetDateTime dueAt;

    /**
     * 時分が指定されたか。due_at が 00:00 のとき、未入力か 0 時指定かを区別するために持つ。
     * 表示に時分を出すかどうかはこの値だけで決め、due_at の値から推測しない
     * （docs/design/api.md 2.6）。
     */
    @Column(name = "has_due_time", nullable = false)
    private boolean hasDueTime;

    /** リスト内での並び順。0 始まりの単純連番。 */
    @Column(name = "position", nullable = false)
    private int position;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime updatedAt;

    /** JPA が使う。アプリケーションからは呼ばない。 */
    protected Card() {
    }

    public Card(UUID id, TaskList list, String title, String description,
                OffsetDateTime dueAt, boolean hasDueTime, int position) {
        this.id = id;
        this.list = list;
        this.title = title;
        this.description = description;
        this.dueAt = dueAt;
        this.hasDueTime = hasDueTime;
        this.position = position;
    }

    /**
     * 詳細モーダルで編集できる 4 項目をまとめて差し替える（F-07）。
     *
     * <p>setter を 4 つ並べず 1 つのメソッドにしているのは、API が部分更新を採らず
     * 「4 項目を毎回送る」と決めているため（docs/design/api.md 3.7）。個別に置ける形に
     * すると、呼び出し側が一部だけ更新でき、API の約束と食い違う使い方が生まれる。
     *
     * <p>list_id と position はここでは変えられない。移動は別の責務（api.md 3.9）。
     */
    public void updateDetails(String title, String description,
                              OffsetDateTime dueAt, boolean hasDueTime) {
        this.title = title;
        this.description = description;
        this.dueAt = dueAt;
        this.hasDueTime = hasDueTime;
    }

    public UUID getId() {
        return id;
    }

    public TaskList getList() {
        return list;
    }

    public String getTitle() {
        return title;
    }

    public String getDescription() {
        return description;
    }

    public OffsetDateTime getDueAt() {
        return dueAt;
    }

    public boolean isHasDueTime() {
        return hasDueTime;
    }

    public int getPosition() {
        return position;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
