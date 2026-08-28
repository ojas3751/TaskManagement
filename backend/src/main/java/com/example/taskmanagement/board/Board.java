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

    /**
     * リストをこのボードから外す（F-04）。
     *
     * <p><strong>削除はこの経路で行う。</strong>理由は {@link TaskList#removeCard} と同じで、
     * lists には {@link CascadeType#ALL} が付いているため、{@code delete(list)} を呼んでも
     * <strong>コレクションに残っている限り flush で PERSIST がカスケードし、削除の予約が
     * 取り消される。</strong>実際、統合テストで DELETE が発行されずに露出した（手動の確認では、
     * リクエストごとにボードを読み込む前だったため気づけなかった）。
     *
     * <p>コレクションから外せば {@code orphanRemoval = true} が DELETE を出す。中のタスクも
     * lists.cards のカスケードと DB 側の ON DELETE CASCADE で一緒に消える。
     */
    public void removeList(TaskList list) {
        lists.remove(list);
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
