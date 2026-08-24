package com.example.taskmanagement.board;

/**
 * 期限の日付が無いのに時分だけが指定されたときに投げる（docs/design/api.md 3.7）。
 *
 * <p>「9時30分。ただし何月何日かは未定」という期限は表示のしようがないため、値として認めない。
 *
 * <p>Bean Validation ではなくサービスで判定している。この検証は due_at と has_due_time の
 * 2 項目にまたがる相関チェックであり、GlobalExceptionHandler が持つ
 * 「入力欄名 + 制約名 → エラーコード」の対応表に乗らないため。
 */
public class DueTimeWithoutDueDateException extends RuntimeException {

    public DueTimeWithoutDueDateException() {
        super("期限の日付が指定されていません");
    }
}
