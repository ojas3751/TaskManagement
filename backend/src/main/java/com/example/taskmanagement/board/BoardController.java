package com.example.taskmanagement.board;

import org.springframework.web.bind.annotation.GetMapping;
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
}
