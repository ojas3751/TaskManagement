package com.example.taskmanagement.web;

import com.example.taskmanagement.board.BoardNotFoundException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 例外をエラー応答の共通の形へ変換する（docs/design/api.md 2.4）。
 *
 * <p>各コントローラで個別に組み立てると、エンドポイントが増えるにつれて形が揺れる。
 * 一箇所に集約する。
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BoardNotFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleBoardNotFound(BoardNotFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiErrorResponse.of("BOARD_NOT_FOUND", "ボードが見つかりません。再読み込みしてください"));
    }
}
