package com.example.taskmanagement.board;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.taskmanagement.support.IntegrationTest;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.RequestBuilder;

/**
 * タスクの API の振る舞い（docs/design/api.md 2.7, 3.6, 3.7）。
 *
 * <p>seed（V2）はリストを 3 つ作るがカードは 1 件も作らないので、各テストは空のリストから
 * 始まる前提で書ける。テストごとの巻き戻しは {@link IntegrationTest} が受け持つ。
 */
@IntegrationTest
class BoardControllerTest {

    /** seed が作る TODO 列。V2__seed_default_board.sql の固定 ID。 */
    private static final String TODO_LIST_ID = "00000000-0000-4000-8000-000000000101";

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

    private static RequestBuilder patchCard(UUID id, String body) {
        return patch("/api/cards/{id}", id).contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private static RequestBuilder postCard(UUID id, String title) {
        String body = """
                {"id": "%s", "list_id": "%s", "title": "%s"}
                """.formatted(id, TODO_LIST_ID, title);

        return post("/api/cards").contentType(MediaType.APPLICATION_JSON).content(body);
    }
}
