package com.example.taskmanagement.board;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
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
     * <p>返すのは追加された 1 件だけ。ボード全体を返さないのは、画面側が既に同じ内容を
     * 描き終えており、全体を受け取っても捨てるだけになるため。
     *
     * <p>{@code @Valid} を付けないと CreateCardRequest の制約が動かない。違反は
     * MethodArgumentNotValidException として GlobalExceptionHandler に渡る。
     */
    @PostMapping("/api/cards")
    @ResponseStatus(HttpStatus.CREATED)
    public BoardResponse.CardResponse createCard(@Valid @RequestBody CreateCardRequest request) {
        return boardService.createCard(request);
    }
}
