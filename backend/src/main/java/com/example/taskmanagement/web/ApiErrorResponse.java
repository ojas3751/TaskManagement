package com.example.taskmanagement.web;

/**
 * エラー応答の共通の形（docs/design/api.md 2.4）。すべてのエラーをこの形に揃える。
 *
 * @param code    画面側が分岐に使う識別子。メッセージの文言が変わっても壊れないようにするため
 * @param message そのまま画面に出せる日本語。画面側で文言を組み立てない
 * @param field   原因となった入力欄。該当しない場合は null
 */
public record ApiErrorResponse(String code, String message, String field) {

    public static ApiErrorResponse of(String code, String message) {
        return new ApiErrorResponse(code, message, null);
    }
}
