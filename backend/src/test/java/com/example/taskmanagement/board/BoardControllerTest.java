package com.example.taskmanagement.board;

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
 * POST /api/cards の振る舞い（docs/design/api.md 3.6, 2.7）。
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

    private static RequestBuilder postCard(UUID id, String title) {
        String body = """
                {"id": "%s", "list_id": "%s", "title": "%s"}
                """.formatted(id, TODO_LIST_ID, title);

        return post("/api/cards").contentType(MediaType.APPLICATION_JSON).content(body);
    }
}
