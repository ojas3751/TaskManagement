package com.example.taskmanagement.web;

import com.example.taskmanagement.board.BoardNotFoundException;
import com.example.taskmanagement.board.CardIdsMismatchException;
import com.example.taskmanagement.board.CardLimitExceededException;
import com.example.taskmanagement.board.CardNotFoundException;
import com.example.taskmanagement.board.DueTimeWithoutDueDateException;
import com.example.taskmanagement.board.ListNotFoundException;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.transaction.TransactionException;
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

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /**
     * 入力検証の違反を、画面側が分岐に使えるコードへ対応づける表。
     *
     * <p>キーは「入力欄の名前 + 違反した制約の名前」。Bean Validation の既定メッセージを
     * そのまま返さないのは、英語であることと、文言が変わると画面側の分岐が壊れるため
     * （docs/design/api.md 2.4）。
     */
    private static final Map<String, ApiErrorResponse> VALIDATION_ERRORS = Map.of(
            "title:NotBlank", new ApiErrorResponse("CARD_TITLE_REQUIRED", "入力してください。", "title"),
            "title:Size", new ApiErrorResponse("CARD_TITLE_TOO_LONG", "タイトルは100文字以内で入力してください。", "title"),
            "description:Size",
            new ApiErrorResponse("CARD_DESCRIPTION_TOO_LONG", "説明文は5,000文字以内で入力してください。", "description"));

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

    @ExceptionHandler(CardNotFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleCardNotFound(CardNotFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiErrorResponse.of("CARD_NOT_FOUND", "タスクが見つかりません。再読み込みしてください"));
    }

    /**
     * 期限の相関チェック（docs/design/api.md 3.7）。
     *
     * <p>他の入力検証と違って {@code @Valid} ではなくサービスが投げる。2 項目にまたがる
     * 検証であり、上の VALIDATION_ERRORS が使う「入力欄名 + 制約名」という鍵で表せないため。
     */
    @ExceptionHandler(DueTimeWithoutDueDateException.class)
    public ResponseEntity<ApiErrorResponse> handleDueTimeWithoutDueDate(DueTimeWithoutDueDateException e) {
        return ResponseEntity.badRequest()
                .body(new ApiErrorResponse("DUE_TIME_WITHOUT_DUE_DATE", "期限の日付を入力してください。", "due_at"));
    }

    /**
     * 送られてきた並びが移動後の顔ぶれと一致しない（docs/design/api.md 3.9）。
     *
     * <p>画面が持っている情報が古いときに起きるため、再読み込みを促す。
     */
    @ExceptionHandler(CardIdsMismatchException.class)
    public ResponseEntity<ApiErrorResponse> handleCardIdsMismatch(CardIdsMismatchException e) {
        return ResponseEntity.badRequest()
                .body(ApiErrorResponse.of("CARD_IDS_MISMATCH", "表示が最新ではありません。再読み込みしてください"));
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

    /**
     * DB に到達できない・DB 側で失敗した（docs/design/api.md 2.4）。
     *
     * <p>利用者が自分で Docker を起動する前提のため（要件定義書 P-4）、DB だけ落ちている
     * 状態は日常的に起きる。想定外のエラーに混ぜず、何を起動すればよいかまで伝える。
     *
     * <p><strong>TransactionException も併せて捕まえる。</strong>DB が落ちている状態で最初に
     * 起きるのは、クエリの失敗ではなく<strong>トランザクションを開始できないこと</strong>
     * （CannotCreateTransactionException）であり、これは DataAccessException を継承していない
     * 別系統の例外である。DataAccessException だけを見ていると、DB を止めたときにここへ来ず
     * 「エラーが発生しました」になる。実際に docker compose stop で確認して気づいた。
     *
     * <p>接続失敗とクエリの失敗は区別しない。画面側にできることは「DB を確認する」で同じであり、
     * 原因の切り分けはログを見る作業になるため。
     */
    @ExceptionHandler({DataAccessException.class, TransactionException.class})
    public ResponseEntity<ApiErrorResponse> handleDataAccessFailure(Exception e) {
        log.error("DB へのアクセスに失敗しました", e);
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(ApiErrorResponse.of("DB_UNAVAILABLE",
                        "データベースに接続できません。Docker が起動しているか確認してください"));
    }

    /**
     * リクエスト本文を読めなかった（JSON の壊れ、型の不一致など）。
     *
     * <p>下の想定外ハンドラに落ちると 500 になるが、原因は送られてきた内容にあるので 400 が正しい。
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiErrorResponse> handleUnreadableRequest(HttpMessageNotReadableException e) {
        return ResponseEntity.badRequest()
                .body(ApiErrorResponse.of("INVALID_REQUEST", "入力内容が正しくありません。"));
    }

    /**
     * 想定外のエラー（docs/design/api.md 2.4）。
     *
     * <p>本文まで共通の形に揃えるために置いている。これが無いと Spring 既定の応答が返り、
     * 画面側は code を読めず「エラー本体が読めない＝サーバーに届かなかった」と誤って
     * 判定してしまう。
     *
     * <p>詳細は画面に出さずログに残す。利用者に見せても対処に繋がらず、内部構造を
     * 晒すだけのため。
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorResponse> handleUnexpected(Exception e) {
        log.error("想定外のエラーが発生しました", e);
        return ResponseEntity.internalServerError()
                .body(ApiErrorResponse.of("INTERNAL_ERROR", "エラーが発生しました。"));
    }

    private static ApiErrorResponse toApiError(FieldError error) {
        String key = error.getField() + ":" + error.getCode();
        return VALIDATION_ERRORS.getOrDefault(
                key,
                new ApiErrorResponse("INVALID_REQUEST", "入力内容が正しくありません。", error.getField()));
    }
}
