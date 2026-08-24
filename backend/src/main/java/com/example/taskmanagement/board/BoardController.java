package com.example.taskmanagement.board;

import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class BoardController {

    private final BoardService boardService;

    public BoardController(BoardService boardService) {
        this.boardService = boardService;
    }

    /**
     * ボード・リスト・タスクの一括取得（F-01）。仕様は docs/design/api.md 3.1。
     *
     * <p>リストごとにタスクを取りに行く作りにしないのは、リクエスト数が列数に比例して
     * 増えるため（api.md 2.2）。
     */
    @GetMapping("/api/board")
    public BoardResponse getBoard() {
        return boardService.getBoard();
    }

    /**
     * タスクの追加（F-06）。仕様は docs/design/api.md 3.6。
     *
     * <p>返すのは処理後のボード全体（api.md 2.7）。画面側は応答を待たずに描いたうえで、
     * 返ってきた全体で置き換える。先に描くのは待たせないため、置き換えるのは position の
     * 正解をサーバーだけが持つようにするためで、この 2 つは両立する。
     *
     * <p>{@code @Valid} を付けないと CreateCardRequest の制約が動かない。違反は
     * MethodArgumentNotValidException として GlobalExceptionHandler に渡る。
     */
    @PostMapping("/api/cards")
    @ResponseStatus(HttpStatus.CREATED)
    public BoardResponse createCard(@Valid @RequestBody CreateCardRequest request) {
        return boardService.createCard(request);
    }

    /**
     * タスクの編集（F-07, F-09）。仕様は docs/design/api.md 3.7。
     *
     * <p>PUT ではなく PATCH なのは、タスクの全項目を置き換えるわけではないため。list_id と
     * position はこのエンドポイントでは変えられず、移動は PATCH /api/cards/move が担う。
     */
    @PatchMapping("/api/cards/{id}")
    public BoardResponse updateCard(@PathVariable UUID id,
                                    @Valid @RequestBody UpdateCardRequest request) {
        return boardService.updateCard(id, request);
    }
}
