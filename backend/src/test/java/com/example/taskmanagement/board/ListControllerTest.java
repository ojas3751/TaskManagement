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
 * リストの API の振る舞い（docs/design/api.md 3.2）。
 *
 * <p>タスク側は {@link BoardControllerTest} が持つ。同じコントローラだが、確かめている
 * 対象が別なのでファイルを分ける。
 *
 * <p>seed（V2）が作るのは 3 列（TODO / 進行中 / 完了）。テストごとの巻き戻しは
 * {@link IntegrationTest} が受け持つ。
 */
@IntegrationTest
class ListControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void 追加したリストは完了列の左隣に入る() throws Exception {
        mockMvc.perform(postList(UUID.randomUUID(), "設計"))
                .andExpect(status().isCreated())
                // 追加された 1 件ではなくボード全体を返す（api.md 2.7）
                .andExpect(jsonPath("$.lists.length()").value(4))
                .andExpect(jsonPath("$.lists[2].title").value("設計"))
                .andExpect(jsonPath("$.lists[2].position").value(2))
                // 追加したリストは改名・削除・移動を許す（F-03〜F-05）
                .andExpect(jsonPath("$.lists[2].is_default").value(false))
                .andExpect(jsonPath("$.lists[2].is_fixed_last").value(false))
                // 完了列は押し出されて最右のまま。ここが動かないと F-05 の前提が崩れる
                .andExpect(jsonPath("$.lists[3].title").value("完了"))
                .andExpect(jsonPath("$.lists[3].position").value(3))
                .andExpect(jsonPath("$.lists[3].is_fixed_last").value(true));
    }

    @Test
    void 後から追加したリストが完了列の隣に来る() throws Exception {
        mockMvc.perform(postList(UUID.randomUUID(), "先に足したリスト")).andExpect(status().isCreated());

        mockMvc.perform(postList(UUID.randomUUID(), "後から足したリスト"))
                .andExpect(status().isCreated())
                // 再採番の結果まで応答に乗っていることを確かめる。追加のたびに完了列より
                // 手前へ積まれ、完了列は最右に残る
                .andExpect(jsonPath("$.lists[2].title").value("先に足したリスト"))
                .andExpect(jsonPath("$.lists[3].title").value("後から足したリスト"))
                .andExpect(jsonPath("$.lists[3].position").value(3))
                .andExpect(jsonPath("$.lists[4].title").value("完了"))
                .andExpect(jsonPath("$.lists[4].position").value(4));
    }

    @Test
    void リスト名が空なら400を返す() throws Exception {
        mockMvc.perform(postList(UUID.randomUUID(), "  "))
                // タスク名と同じ title という欄名で届くが、CARD_ ではなく LIST_ が返ること。
                // GlobalExceptionHandler が欄名だけで対応づけていた頃は、ここで
                // CARD_TITLE_REQUIRED が返っていた
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("LIST_TITLE_REQUIRED"))
                .andExpect(jsonPath("$.field").value("title"));
    }

    @Test
    void リスト名が50文字を超えたら400を返す() throws Exception {
        mockMvc.perform(postList(UUID.randomUUID(), "あ".repeat(51)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("LIST_TITLE_TOO_LONG"))
                // 文言もタスク側（100文字）ではなくリスト側（50文字）であること
                .andExpect(jsonPath("$.message").value("リスト名は50文字以内で入力してください。"));
    }

    @Test
    void リストが50文字ちょうどなら追加できる() throws Exception {
        mockMvc.perform(postList(UUID.randomUUID(), "あ".repeat(50)))
                .andExpect(status().isCreated());
    }

    @Test
    void 追加したリストが10件を超えたら409を返す() throws Exception {
        // 数えるのは追加分だけ。seed の 3 列は上限に含めないので、ここは 10 回通る
        for (int i = 0; i < 10; i++) {
            mockMvc.perform(postList(UUID.randomUUID(), "リスト" + i)).andExpect(status().isCreated());
        }

        mockMvc.perform(postList(UUID.randomUUID(), "11件目"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("LIST_LIMIT_EXCEEDED"))
                .andExpect(jsonPath("$.message").value("追加できるリストは10件までです"));
    }

    private static RequestBuilder postList(UUID id, String title) {
        String body = """
                {"id": "%s", "title": "%s"}
                """.formatted(id, title);

        return post("/api/lists").contentType(MediaType.APPLICATION_JSON).content(body);
    }
}
