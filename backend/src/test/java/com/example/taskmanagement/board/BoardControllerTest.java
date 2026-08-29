package com.example.taskmanagement.board;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.taskmanagement.support.IntegrationTest;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.RequestBuilder;

/**
 * タスクの API の振る舞い（docs/design/api.md 2.7, 3.6, 3.7, 3.8）。
 *
 * <p>seed（V2）はリストを 3 つ作るがカードは 1 件も作らないので、各テストは空のリストから
 * 始まる前提で書ける。テストごとの巻き戻しは {@link IntegrationTest} が受け持つ。
 */
@IntegrationTest
class BoardControllerTest {

    /** seed が作る 3 列。V2__seed_default_board.sql の固定 ID。 */
    private static final String TODO_LIST_ID = "00000000-0000-4000-8000-000000000101";
    private static final String DOING_LIST_ID = "00000000-0000-4000-8000-000000000102";
    private static final String DONE_LIST_ID = "00000000-0000-4000-8000-000000000103";

    @Autowired
    private MockMvc mockMvc;

    @Test
    void 追加するとボード全体が返る() throws Exception {
        mockMvc.perform(postCard(UUID.randomUUID(), "最初のタスク"))
                .andExpect(status().isCreated())
                // 追加された 1 件ではなくボード全体を返す（api.md 2.7）。
                // 画面側が position を自前で計算せずに済ませるための約束
                .andExpect(jsonPath("$.title").value("マイタスク"))
                .andExpect(jsonPath("$.lists.length()").value(3))
                .andExpect(jsonPath("$.lists[0].cards.length()").value(1))
                .andExpect(jsonPath("$.lists[0].cards[0].title").value("最初のタスク"))
                .andExpect(jsonPath("$.lists[0].cards[0].position").value(0));
    }

    @Test
    void 後から追加したタスクが先頭に来て既存が押し下がる() throws Exception {
        mockMvc.perform(postCard(UUID.randomUUID(), "先に入れたタスク"))
                .andExpect(status().isCreated());

        mockMvc.perform(postCard(UUID.randomUUID(), "後から入れたタスク"))
                .andExpect(status().isCreated())
                // 再採番の結果まで応答に乗っていることを確かめる。ここが 1 件返しでは
                // 表現できず、画面側が同じ計算を持つ羽目になっていた
                .andExpect(jsonPath("$.lists[0].cards[0].title").value("後から入れたタスク"))
                .andExpect(jsonPath("$.lists[0].cards[0].position").value(0))
                .andExpect(jsonPath("$.lists[0].cards[1].title").value("先に入れたタスク"))
                .andExpect(jsonPath("$.lists[0].cards[1].position").value(1));
    }

    @Test
    void 存在しないリストへの追加は404を返す() throws Exception {
        String body = """
                {"id": "%s", "list_id": "%s", "title": "行き先のないタスク"}
                """.formatted(UUID.randomUUID(), UUID.randomUUID());

        mockMvc.perform(post("/api/cards").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("LIST_NOT_FOUND"));
    }

    @Test
    void 編集するとタイトルと説明文が入れ替わる() throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(postCard(id, "編集前のタイトル")).andExpect(status().isCreated());

        mockMvc.perform(patchCard(id, """
                        {"title": "編集後のタイトル",
                         "description": "1行目\\n2行目",
                         "due_at": null,
                         "has_due_time": false}
                        """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lists[0].cards[0].title").value("編集後のタイトル"))
                // 改行がそのまま往復すること（F-07 の完了の目安）
                .andExpect(jsonPath("$.lists[0].cards[0].description").value("1行目\n2行目"));
    }

    @Test
    void 期限は日付と時分の指定をまとめて保存できる() throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(postCard(id, "期限を入れるタスク")).andExpect(status().isCreated());

        mockMvc.perform(patchCard(id, """
                        {"title": "期限を入れるタスク",
                         "description": "",
                         "due_at": "2026-08-30T09:00:00+09:00",
                         "has_due_time": true}
                        """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lists[0].cards[0].due_at").value("2026-08-30T09:00:00+09:00"))
                .andExpect(jsonPath("$.lists[0].cards[0].has_due_time").value(true));
    }

    @Test
    void タイトルが空なら400を返す() throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(postCard(id, "タイトルを消してみるタスク")).andExpect(status().isCreated());

        mockMvc.perform(patchCard(id, """
                        {"title": "  ", "description": "", "due_at": null, "has_due_time": false}
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("CARD_TITLE_REQUIRED"));
    }

    @Test
    void タイトルが100文字を超えたら400を返す() throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(postCard(id, "長いタイトルにするタスク")).andExpect(status().isCreated());

        mockMvc.perform(patchCard(id, """
                        {"title": "%s", "description": "", "due_at": null, "has_due_time": false}
                        """.formatted("あ".repeat(101))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("CARD_TITLE_TOO_LONG"));
    }

    @Test
    void 説明文が5000文字を超えたら400を返す() throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(postCard(id, "長い説明文にするタスク")).andExpect(status().isCreated());

        mockMvc.perform(patchCard(id, """
                        {"title": "長い説明文にするタスク", "description": "%s",
                         "due_at": null, "has_due_time": false}
                        """.formatted("あ".repeat(5001))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("CARD_DESCRIPTION_TOO_LONG"));
    }

    @Test
    void 日付なしで時分だけ指定したら400を返す() throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(postCard(id, "期限のおかしいタスク")).andExpect(status().isCreated());

        // 「9時30分。ただし何月何日かは未定」は表示のしようがないので値として認めない。
        // 2 項目にまたがる検証なので、@Valid ではなく BoardService が弾いている
        mockMvc.perform(patchCard(id, """
                        {"title": "期限のおかしいタスク", "description": "",
                         "due_at": null, "has_due_time": true}
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("DUE_TIME_WITHOUT_DUE_DATE"));
    }

    @Test
    void 存在しないタスクの編集は404を返す() throws Exception {
        mockMvc.perform(patchCard(UUID.randomUUID(), """
                        {"title": "どこにもないタスク", "description": "",
                         "due_at": null, "has_due_time": false}
                        """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("CARD_NOT_FOUND"));
    }

    @Test
    void 削除すると残ったタスクのpositionが詰まる() throws Exception {
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        UUID third = UUID.randomUUID();
        // 先頭に積まれるので、並びは 3枚目・2枚目・1枚目 になる
        mockMvc.perform(postCard(first, "1枚目")).andExpect(status().isCreated());
        mockMvc.perform(postCard(second, "2枚目")).andExpect(status().isCreated());
        mockMvc.perform(postCard(third, "3枚目")).andExpect(status().isCreated());

        // 真ん中（position = 1 の「2枚目」）を消す。末尾を消すだけでは、
        // 後続を詰める処理が動かないので確認にならない
        mockMvc.perform(delete("/api/cards/{id}", second))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lists[0].cards.length()").value(2))
                .andExpect(jsonPath("$.lists[0].cards[0].title").value("3枚目"))
                .andExpect(jsonPath("$.lists[0].cards[0].position").value(0))
                // 穴が空いたままなら position は 2 のまま
                .andExpect(jsonPath("$.lists[0].cards[1].title").value("1枚目"))
                .andExpect(jsonPath("$.lists[0].cards[1].position").value(1));
    }

    @Test
    void 存在しないタスクの削除は404を返す() throws Exception {
        mockMvc.perform(delete("/api/cards/{id}", UUID.randomUUID()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("CARD_NOT_FOUND"));
    }

    @Test
    void まとめて削除すると残ったタスクのpositionが詰まる() throws Exception {
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        UUID third = UUID.randomUUID();
        UUID fourth = UUID.randomUUID();
        // 先頭に積まれるので、並びは 4枚目・3枚目・2枚目・1枚目 になる
        mockMvc.perform(postCard(first, "1枚目")).andExpect(status().isCreated());
        mockMvc.perform(postCard(second, "2枚目")).andExpect(status().isCreated());
        mockMvc.perform(postCard(third, "3枚目")).andExpect(status().isCreated());
        mockMvc.perform(postCard(fourth, "4枚目")).andExpect(status().isCreated());

        // 離れた 2 件（position = 0 の「4枚目」と position = 2 の「2枚目」）を消す。
        // 隣り合う 2 件だと、1 件ずつ詰める処理でも通ってしまい確認にならない
        mockMvc.perform(bulkDelete(fourth, second))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lists[0].cards.length()").value(2))
                // 抜けた数だけ詰まっていること。位置ごとに詰め幅が違うので、
                // shiftPositionsUp の考え方ではここが合わない
                .andExpect(jsonPath("$.lists[0].cards[0].title").value("3枚目"))
                .andExpect(jsonPath("$.lists[0].cards[0].position").value(0))
                .andExpect(jsonPath("$.lists[0].cards[1].title").value("1枚目"))
                .andExpect(jsonPath("$.lists[0].cards[1].position").value(1));
    }

    @Test
    void 存在しないIDが混ざっていたら1件も削除しない() throws Exception {
        UUID existing = UUID.randomUUID();
        mockMvc.perform(postCard(existing, "巻き添えにしないタスク")).andExpect(status().isCreated());

        mockMvc.perform(bulkDelete(existing, UUID.randomUUID()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("CARD_NOT_FOUND"));

        // 「消せたものだけ消す」作りだと、ここで 0 件になっている（api.md 3.10）
        mockMvc.perform(getBoard())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lists[0].cards.length()").value(1))
                .andExpect(jsonPath("$.lists[0].cards[0].title").value("巻き添えにしないタスク"));
    }

    @Test
    void 削除対象が空なら400を返す() throws Exception {
        mockMvc.perform(post("/api/cards/bulk-delete")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"card_ids": []}
                                """))
                .andExpect(status().isBadRequest())
                // @NotEmpty に任せると汎用の INVALID_REQUEST になる。
                // 仕様どおりのコードを返すため BoardService が投げている
                .andExpect(jsonPath("$.code").value("CARD_IDS_REQUIRED"));
    }

    @Test
    void 複数のリストにまたがって削除しても両方が詰まる() throws Exception {
        UUID todoKept = UUID.randomUUID();
        UUID todoGone = UUID.randomUUID();
        UUID doingKept = UUID.randomUUID();
        UUID doingGone = UUID.randomUUID();
        mockMvc.perform(postCard(todoKept, "TODOに残る")).andExpect(status().isCreated());
        mockMvc.perform(postCard(todoGone, "TODOから消える")).andExpect(status().isCreated());
        mockMvc.perform(postCard(doingKept, "進行中に残る", DOING_LIST_ID)).andExpect(status().isCreated());
        mockMvc.perform(postCard(doingGone, "進行中から消える", DOING_LIST_ID)).andExpect(status().isCreated());

        // どちらのリストも、消える方が position = 0（先頭に積まれるため）
        mockMvc.perform(bulkDelete(todoGone, doingGone))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lists[0].cards.length()").value(1))
                .andExpect(jsonPath("$.lists[0].cards[0].title").value("TODOに残る"))
                .andExpect(jsonPath("$.lists[0].cards[0].position").value(0))
                .andExpect(jsonPath("$.lists[1].cards.length()").value(1))
                .andExpect(jsonPath("$.lists[1].cards[0].title").value("進行中に残る"))
                .andExpect(jsonPath("$.lists[1].cards[0].position").value(0));
    }

    @Test
    void 別のリストへ移すと移動先の末尾に付き移動元が詰まる() throws Exception {
        UUID stay = UUID.randomUUID();
        UUID moving = UUID.randomUUID();
        UUID alreadyThere = UUID.randomUUID();
        mockMvc.perform(postCard(stay, "TODOに残る")).andExpect(status().isCreated());
        // 先頭に積まれるので、TODO は [moving, stay] の順になる
        mockMvc.perform(postCard(moving, "移動するタスク")).andExpect(status().isCreated());
        mockMvc.perform(postCard(alreadyThere, "進行中に元からある", DOING_LIST_ID)).andExpect(status().isCreated());

        mockMvc.perform(moveCard("""
                        {"card_id": "%s", "from_list_id": "%s", "to_list_id": "%s",
                         "to_card_ids": ["%s", "%s"]}
                        """.formatted(moving, TODO_LIST_ID, DOING_LIST_ID, alreadyThere, moving)))
                .andExpect(status().isOk())
                // 移動元は 1 件になり、position が 0 に詰まる（抜けた分の空番を残さない）
                .andExpect(jsonPath("$.lists[0].cards.length()").value(1))
                .andExpect(jsonPath("$.lists[0].cards[0].title").value("TODOに残る"))
                .andExpect(jsonPath("$.lists[0].cards[0].position").value(0))
                // 移動先は受け取った並びのとおり。F-23 は末尾に付けた配列を送る
                .andExpect(jsonPath("$.lists[1].cards.length()").value(2))
                .andExpect(jsonPath("$.lists[1].cards[0].title").value("進行中に元からある"))
                .andExpect(jsonPath("$.lists[1].cards[1].title").value("移動するタスク"))
                .andExpect(jsonPath("$.lists[1].cards[1].position").value(1));
    }

    @Test
    void 完了列から他のリストへ差し戻せる() throws Exception {
        UUID card = UUID.randomUUID();
        mockMvc.perform(postCard(card, "終わったつもりのタスク", DONE_LIST_ID)).andExpect(status().isCreated());

        // UC-03。完了は移動元にも移動先にもなれる必要がある
        mockMvc.perform(moveCard("""
                        {"card_id": "%s", "from_list_id": "%s", "to_list_id": "%s",
                         "to_card_ids": ["%s"]}
                        """.formatted(card, DONE_LIST_ID, TODO_LIST_ID, card)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lists[0].cards[0].title").value("終わったつもりのタスク"))
                .andExpect(jsonPath("$.lists[2].cards.length()").value(0));
    }

    @Test
    void 同じリスト内で並び替えられる() throws Exception {
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        mockMvc.perform(postCard(first, "1枚目")).andExpect(status().isCreated());
        mockMvc.perform(postCard(second, "2枚目")).andExpect(status().isCreated());

        // 追加直後は [2枚目, 1枚目]。これを入れ替える（Step 11 のドラッグ&ドロップで使う経路）
        mockMvc.perform(moveCard("""
                        {"card_id": "%s", "from_list_id": "%s", "to_list_id": "%s",
                         "to_card_ids": ["%s", "%s"]}
                        """.formatted(first, TODO_LIST_ID, TODO_LIST_ID, first, second)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lists[0].cards[0].title").value("1枚目"))
                .andExpect(jsonPath("$.lists[0].cards[1].title").value("2枚目"));
    }

    @Test
    void 並びに知らないタスクが混ざっていたら400を返す() throws Exception {
        UUID card = UUID.randomUUID();
        mockMvc.perform(postCard(card, "移動するタスク")).andExpect(status().isCreated());

        // 移動先に存在しない ID が含まれている。画面の情報が古いときに起きる
        mockMvc.perform(moveCard("""
                        {"card_id": "%s", "from_list_id": "%s", "to_list_id": "%s",
                         "to_card_ids": ["%s", "%s"]}
                        """.formatted(card, TODO_LIST_ID, DOING_LIST_ID, card, UUID.randomUUID())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("CARD_IDS_MISMATCH"));
    }

    @Test
    void 並びに移動するタスクが含まれていなければ400を返す() throws Exception {
        UUID card = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        mockMvc.perform(postCard(card, "移動するタスク")).andExpect(status().isCreated());
        mockMvc.perform(postCard(other, "進行中のタスク", DOING_LIST_ID)).andExpect(status().isCreated());

        mockMvc.perform(moveCard("""
                        {"card_id": "%s", "from_list_id": "%s", "to_list_id": "%s",
                         "to_card_ids": ["%s"]}
                        """.formatted(card, TODO_LIST_ID, DOING_LIST_ID, other)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("CARD_IDS_MISMATCH"));
    }

    @Test
    void 移動元のリストが実際の所属と違えば400を返す() throws Exception {
        UUID card = UUID.randomUUID();
        mockMvc.perform(postCard(card, "TODOにいるタスク")).andExpect(status().isCreated());

        // 画面は「進行中にいる」と思っているが、実際は TODO にいる
        mockMvc.perform(moveCard("""
                        {"card_id": "%s", "from_list_id": "%s", "to_list_id": "%s",
                         "to_card_ids": ["%s"]}
                        """.formatted(card, DOING_LIST_ID, DONE_LIST_ID, card)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("CARD_IDS_MISMATCH"));
    }

    @Test
    void 存在しないタスクの移動は404を返す() throws Exception {
        UUID missing = UUID.randomUUID();

        mockMvc.perform(moveCard("""
                        {"card_id": "%s", "from_list_id": "%s", "to_list_id": "%s",
                         "to_card_ids": ["%s"]}
                        """.formatted(missing, TODO_LIST_ID, DOING_LIST_ID, missing)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("CARD_NOT_FOUND"));
    }

    @Test
    void 存在しないリストへの移動は404を返す() throws Exception {
        UUID card = UUID.randomUUID();
        mockMvc.perform(postCard(card, "移動するタスク")).andExpect(status().isCreated());

        mockMvc.perform(moveCard("""
                        {"card_id": "%s", "from_list_id": "%s", "to_list_id": "%s",
                         "to_card_ids": ["%s"]}
                        """.formatted(card, TODO_LIST_ID, UUID.randomUUID(), card)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("LIST_NOT_FOUND"));
    }

    private static RequestBuilder moveCard(String body) {
        return patch("/api/cards/move").contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private static RequestBuilder patchCard(UUID id, String body) {
        return patch("/api/cards/{id}", id).contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private static RequestBuilder getBoard() {
        return get("/api/board");
    }

    /** 選択削除（F-15）。ID を並べるだけで呼べるようにしておく */
    private static RequestBuilder bulkDelete(UUID... ids) {
        String body = """
                {"card_ids": [%s]}
                """.formatted(Stream.of(ids)
                        .map(id -> "\"" + id + "\"")
                        .collect(Collectors.joining(", ")));

        return post("/api/cards/bulk-delete").contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private static RequestBuilder postCard(UUID id, String title) {
        return postCard(id, title, TODO_LIST_ID);
    }

    private static RequestBuilder postCard(UUID id, String title, String listId) {
        String body = """
                {"id": "%s", "list_id": "%s", "title": "%s"}
                """.formatted(id, listId, title);

        return post("/api/cards").contentType(MediaType.APPLICATION_JSON).content(body);
    }
}
