package com.example.taskmanagement.board;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.taskmanagement.support.IntegrationTest;
import java.util.Arrays;
import java.util.UUID;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.RequestBuilder;

/**
 * リストの API の振る舞い（docs/design/api.md 3.2〜3.5）。
 *
 * <p>タスク側は {@link BoardControllerTest} が持つ。同じコントローラだが、確かめている
 * 対象が別なのでファイルを分ける。
 *
 * <p>seed（V2）が作るのは 3 列（TODO / 進行中 / 完了）。テストごとの巻き戻しは
 * {@link IntegrationTest} が受け持つ。
 */
@IntegrationTest
class ListControllerTest {

    /** seed が作る 3 列。V2__seed_default_board.sql の固定 ID。 */
    private static final String TODO_LIST_ID = "00000000-0000-4000-8000-000000000101";
    private static final String DOING_LIST_ID = "00000000-0000-4000-8000-000000000102";
    private static final String DONE_LIST_ID = "00000000-0000-4000-8000-000000000103";

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

    @Test
    void 追加したリストは改名できる() throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(postList(id, "改名前")).andExpect(status().isCreated());

        mockMvc.perform(patchList(id, "改名後"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lists[2].title").value("改名後"))
                // 名前だけが変わり、位置は動かない。並び替えは別のエンドポイント（F-05）
                .andExpect(jsonPath("$.lists[2].position").value(2))
                .andExpect(jsonPath("$.lists[3].title").value("完了"));
    }

    @Test
    void デフォルトの3列は改名できない() throws Exception {
        // 画面は改名ボタンを出さないが、API 単独で呼ばれても守る（api.md 2.3）
        for (String listId : new String[] {TODO_LIST_ID, DOING_LIST_ID, DONE_LIST_ID}) {
            mockMvc.perform(patchList(UUID.fromString(listId), "書き換えてみる"))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("LIST_PROTECTED"));
        }
    }

    @Test
    void 存在しないリストの改名は404を返す() throws Exception {
        mockMvc.perform(patchList(UUID.randomUUID(), "どこにもないリスト"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("LIST_NOT_FOUND"));
    }

    @Test
    void 改名でリスト名が空なら400を返す() throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(postList(id, "名前を消してみるリスト")).andExpect(status().isCreated());

        // 追加のときと同じく、CARD_ ではなく LIST_ が返ること。対応表に
        // updateListRequest を登録しないと、汎用の INVALID_REQUEST に落ちる
        mockMvc.perform(patchList(id, "  "))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("LIST_TITLE_REQUIRED"));
    }

    @Test
    void 改名でリスト名が50文字を超えたら400を返す() throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(postList(id, "長い名前にするリスト")).andExpect(status().isCreated());

        mockMvc.perform(patchList(id, "あ".repeat(51)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("LIST_TITLE_TOO_LONG"))
                .andExpect(jsonPath("$.message").value("リスト名は50文字以内で入力してください。"));
    }

    @Test
    void 追加したリストは中のタスクごと削除できる() throws Exception {
        UUID listId = UUID.randomUUID();
        mockMvc.perform(postList(listId, "消すリスト")).andExpect(status().isCreated());

        String card = """
                {"id": "%s", "list_id": "%s", "title": "道連れになるタスク"}
                """.formatted(UUID.randomUUID(), listId);
        mockMvc.perform(post("/api/cards").contentType(MediaType.APPLICATION_JSON).content(card))
                .andExpect(status().isCreated());

        mockMvc.perform(delete("/api/lists/{id}", listId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lists.length()").value(3))
                // seed の3列だけが残る。中のタスクも一緒に消えるので、どこかへ移ることはない
                .andExpect(jsonPath("$.lists[*].title", contains("TODO", "進行中", "完了")))
                .andExpect(jsonPath("$.lists[*].cards.length()", everyItem(is(0))));
    }

    @Test
    void 削除すると残ったリストのpositionが詰まる() throws Exception {
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        mockMvc.perform(postList(first, "1つ目")).andExpect(status().isCreated());
        mockMvc.perform(postList(second, "2つ目")).andExpect(status().isCreated());

        // 真ん中（position = 2 の「1つ目」）を消す。末尾を消すだけでは詰める処理が動かない
        mockMvc.perform(delete("/api/lists/{id}", first))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lists[2].title").value("2つ目"))
                .andExpect(jsonPath("$.lists[2].position").value(2))
                // 穴が空いたままなら完了列の position は 4 のまま
                .andExpect(jsonPath("$.lists[3].title").value("完了"))
                .andExpect(jsonPath("$.lists[3].position").value(3));
    }

    @Test
    void デフォルトの3列は削除できない() throws Exception {
        for (String listId : new String[] {TODO_LIST_ID, DOING_LIST_ID, DONE_LIST_ID}) {
            mockMvc.perform(delete("/api/lists/{id}", UUID.fromString(listId)))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("LIST_PROTECTED"));
        }
    }

    @Test
    void 存在しないリストの削除は404を返す() throws Exception {
        mockMvc.perform(delete("/api/lists/{id}", UUID.randomUUID()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("LIST_NOT_FOUND"));
    }

    @Test
    void 並び替えると受け取った順に振り直される() throws Exception {
        mockMvc.perform(reorderLists(DOING_LIST_ID, TODO_LIST_ID, DONE_LIST_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lists[0].title").value("進行中"))
                .andExpect(jsonPath("$.lists[0].position").value(0))
                .andExpect(jsonPath("$.lists[1].title").value("TODO"))
                .andExpect(jsonPath("$.lists[1].position").value(1))
                .andExpect(jsonPath("$.lists[2].title").value("完了"))
                .andExpect(jsonPath("$.lists[2].position").value(2));
    }

    @Test
    void 追加したリストも並び替えの対象になる() throws Exception {
        UUID added = UUID.randomUUID();
        mockMvc.perform(postList(added, "設計")).andExpect(status().isCreated());

        // 追加直後は 3 番目（完了の左隣）。これを先頭へ動かす
        mockMvc.perform(reorderLists(added.toString(), TODO_LIST_ID, DOING_LIST_ID, DONE_LIST_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lists[0].title").value("設計"))
                .andExpect(jsonPath("$.lists[0].position").value(0));
    }

    @Test
    void 完了列を末尾から動かすと409を返す() throws Exception {
        mockMvc.perform(reorderLists(DONE_LIST_ID, TODO_LIST_ID, DOING_LIST_ID))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("FIXED_LAST_MUST_BE_LAST"));
    }

    @Test
    void 他のリストを完了より右へ動かすと409を返す() throws Exception {
        // 「完了が末尾に無い」という同じ状態なので、完了自身を動かした場合と区別しない
        mockMvc.perform(reorderLists(TODO_LIST_ID, DONE_LIST_ID, DOING_LIST_ID))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("FIXED_LAST_MUST_BE_LAST"));
    }

    @Test
    void 並びに過不足があれば400を返す() throws Exception {
        // 進行中が抜けている。画面の情報が古いときに起きる
        mockMvc.perform(reorderLists(TODO_LIST_ID, DONE_LIST_ID))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("LIST_IDS_MISMATCH"));
    }

    @Test
    void 並びに同じIDが2回あれば400を返す() throws Exception {
        // 件数は合っているが顔ぶれが違う。集合にすると潰れるので件数も見ている
        mockMvc.perform(reorderLists(TODO_LIST_ID, TODO_LIST_ID, DONE_LIST_ID))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("LIST_IDS_MISMATCH"));
    }

    @Test
    void 並びに知らないリストが混ざっていたら400を返す() throws Exception {
        mockMvc.perform(reorderLists(TODO_LIST_ID, UUID.randomUUID().toString(), DONE_LIST_ID))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("LIST_IDS_MISMATCH"));
    }

    private static RequestBuilder reorderLists(String... listIds) {
        String ids = Arrays.stream(listIds)
                .map("\"%s\""::formatted)
                .collect(Collectors.joining(", "));

        return patch("/api/lists/reorder")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"list_ids": [%s]}
                        """.formatted(ids));
    }

    private static RequestBuilder patchList(UUID id, String title) {
        String body = """
                {"title": "%s"}
                """.formatted(title);

        return patch("/api/lists/{id}", id).contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private static RequestBuilder postList(UUID id, String title) {
        String body = """
                {"id": "%s", "title": "%s"}
                """.formatted(id, title);

        return post("/api/lists").contentType(MediaType.APPLICATION_JSON).content(body);
    }
}
