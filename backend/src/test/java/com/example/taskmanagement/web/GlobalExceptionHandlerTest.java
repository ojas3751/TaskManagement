package com.example.taskmanagement.web;

import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.taskmanagement.board.BoardController;
import com.example.taskmanagement.board.BoardService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * エラー応答の共通の形（docs/design/api.md 2.4）。
 *
 * <p>DB を実際に止めた状態は自動テストで作りにくいので、サービスを差し替えて例外だけを
 * 起こす。ここで確かめたいのは「例外が共通の形に変換されるか」であって、DB の落ち方ではない。
 *
 * <p>DB を使わないため {@code @WebMvcTest} で Web 層だけを立ち上げる。コンテナを起動する
 * 統合テストと分けているのは、この確認に DB が要らないため。
 */
@WebMvcTest(BoardController.class)
@ActiveProfiles("test")
class GlobalExceptionHandlerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private BoardService boardService;

    @Test
    void DBに接続できないときは503とDB_UNAVAILABLEを返す() throws Exception {
        given(boardService.getBoard()).willThrow(new DataAccessResourceFailureException("接続できない"));

        mockMvc.perform(get("/api/board"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("DB_UNAVAILABLE"))
                // 何を起動すればよいかまで伝える。利用者が自分で Docker を起動する前提のため
                .andExpect(jsonPath("$.message").value(
                        "データベースに接続できません。Docker が起動しているか確認してください"));
    }

    @Test
    void トランザクションを開始できないときも503とDB_UNAVAILABLEを返す() throws Exception {
        // DB が落ちている状態で最初に起きるのはこちら。CannotCreateTransactionException は
        // DataAccessException を継承していない別系統なので、取りこぼしやすい
        given(boardService.getBoard())
                .willThrow(new CannotCreateTransactionException("トランザクションを開始できない"));

        mockMvc.perform(get("/api/board"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("DB_UNAVAILABLE"));
    }

    @Test
    void 想定外の例外は500とINTERNAL_ERRORを返す() throws Exception {
        given(boardService.getBoard()).willThrow(new IllegalStateException("想定していない何か"));

        mockMvc.perform(get("/api/board"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
                // 詳細は画面に出さない。利用者の対処に繋がらず、内部構造を晒すだけのため
                .andExpect(jsonPath("$.message").value("エラーが発生しました。"));
    }

    @Test
    void 本文が壊れているときは500ではなく400を返す() throws Exception {
        // 想定外ハンドラに落ちると 500 になるが、原因は送られてきた内容にあるので 400 が正しい
        mockMvc.perform(post("/api/cards").contentType(MediaType.APPLICATION_JSON).content("{"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }
}
