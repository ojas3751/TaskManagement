package com.example.taskmanagement.board;

/**
 * 1 つのボードに追加できるリストの上限（10 件）に達しているときに投げる。
 *
 * <p>数えるのは追加されたリストだけで、seed の 3 列は含めない
 * （docs/design/api.md 2.3）。上限をサーバーで守る点は
 * {@link CardLimitExceededException} と同じ。
 */
public class ListLimitExceededException extends RuntimeException {

    public ListLimitExceededException() {
        super("追加できるリストが上限に達しています");
    }
}
