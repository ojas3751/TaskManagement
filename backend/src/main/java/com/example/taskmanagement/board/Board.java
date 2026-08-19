package com.example.taskmanagement.board;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

/**
 * ボード。現状1件のみだが、F-19（ボードの複数管理）に備えてテーブルとして独立させている。
 *
 * <p>スキーマは V1__create_tables.sql が正。{@code ddl-auto=validate} により、
 * このクラスと食い違うと起動時にエラーになる。
 */
@Entity
@Table(name = "boards")
public class Board {

    /**
     * id はアプリ側で採番する。{@code @GeneratedValue} も DB 側の {@code gen_random_uuid()} も
     * 使わない。サーバーに問い合わせる前に id が決まっていないと、画面側の楽観的更新
     * （応答を待たずに描画する実装）が成立しないため。
     * 詳細は docs/design/database.md「JPA / Hibernate 固有の注意点」を参照。
     */
    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "title", nullable = false)
    private String title;

    /**
     * 並びは position の昇順。API は並べ替えずにこの順で返す（docs/design/api.md 3.1）。
     *
     * <p>型が Set なのは、List（Hibernate の言う bag）を親子で2段ぶん JOIN FETCH すると
     * {@code MultipleBagFetchException} になるため。@OrderBy が付いた Set には
     * LinkedHashSet が使われ、SQL が返した順序が保たれる。
     */
    @OneToMany(mappedBy = "board", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position ASC")
    private Set<TaskList> lists = new LinkedHashSet<>();

    /** API では返さない（docs/design/api.md 2.6）。DB には記録している。 */
    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime updatedAt;

    /** JPA が使う。アプリケーションからは呼ばない。 */
    protected Board() {
    }

    public Board(UUID id, String title) {
        this.id = id;
        this.title = title;
    }

    public UUID getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public Set<TaskList> getLists() {
        return lists;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
