package com.example.taskmanagement.web;

import com.example.taskmanagement.board.BoardNotFoundException;
import com.example.taskmanagement.board.CardLimitExceededException;
import com.example.taskmanagement.board.ListNotFoundException;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
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

    /**
     * 入力検証の違反を、画面側が分岐に使えるコードへ対応づける表。
     *
     * <p>キーは「入力欄の名前 + 違反した制約の名前」。Bean Validation の既定メッセージを
     * そのまま返さないのは、英語であることと、文言が変わると画面側の分岐が壊れるため
     * （docs/design/api.md 2.4）。
     */
    private static final Map<String, ApiErrorResponse> VALIDATION_ERRORS = Map.of(
            "title:NotBlank", new ApiErrorResponse("CARD_TITLE_REQUIRED", "入力してください。", "title"),
            "title:Size", new ApiErrorResponse("CARD_TITLE_TOO_LONG", "タイトルは100文字以内で入力してください。", "title"));

    @ExceptionHandler(BoardNotFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleBoardNotFound(BoardNotFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiErrorResponse.of("BOARD_NOT_FOUND", "ボードが見つかりません。再読み込みしてください"));
    }

    @ExceptionHandler(ListNotFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleListNotFound(ListNotFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiErrorResponse.of("LIST_NOT_FOUND", "リストが見つかりません。再読み込みしてください"));
    }

    @ExceptionHandler(CardLimitExceededException.class)
    public ResponseEntity<ApiErrorResponse> handleCardLimitExceeded(CardLimitExceededException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ApiErrorResponse.of("CARD_LIMIT_EXCEEDED", "1つのリストに置けるタスクは200件までです"));
    }

    /**
     * リクエスト本文の検証エラー（{@code @Valid} が弾いたもの）。
     *
     * <p>違反が複数あっても返すのは最初の 1 件だけ。画面側は入力欄ごとにメッセージを
     * 出し分ける作りにしておらず、複数返しても最初の 1 件しか使わないため。
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiErrorResponse> handleValidationFailure(MethodArgumentNotValidException e) {
        ApiErrorResponse body = e.getBindingResult().getFieldErrors().stream()
                .map(GlobalExceptionHandler::toApiError)
                .findFirst()
                .orElseGet(() -> ApiErrorResponse.of("INVALID_REQUEST", "入力内容が正しくありません。"));

        return ResponseEntity.badRequest().body(body);
    }

    private static ApiErrorResponse toApiError(FieldError error) {
        String key = error.getField() + ":" + error.getCode();
        return VALIDATION_ERRORS.getOrDefault(
                key,
                new ApiErrorResponse("INVALID_REQUEST", "入力内容が正しくありません。", error.getField()));
    }
}
