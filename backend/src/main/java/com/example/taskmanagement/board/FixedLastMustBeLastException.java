package com.example.taskmanagement.board;

/**
 * 「完了」列（{@code is_fixed_last}）が末尾に無い並びを受け取ったときに投げる。
 *
 * <p>完了列自身を動かした場合と、他の列を完了より右へ動かした場合の両方がここに来る。
 * <strong>どちらも「末尾が完了列でない」という同じ状態</strong>なので、区別しない
 * （docs/design/api.md 3.5）。
 */
public class FixedLastMustBeLastException extends RuntimeException {

    public FixedLastMustBeLastException() {
        super("「完了」のリストは常に最右である必要があります");
    }
}
