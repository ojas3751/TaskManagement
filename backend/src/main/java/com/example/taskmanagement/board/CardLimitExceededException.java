package com.example.taskmanagement.board;

/**
 * 1 つのリストに置けるタスクの上限（200 件）に達しているときに投げる。
 *
 * <p>画面側でも件数を見て抑止するが、それだけに任せない。上限はサーバーで守る
 * （docs/design/api.md 2.3）。
 */
public class CardLimitExceededException extends RuntimeException {

    public CardLimitExceededException() {
        super("リスト内のタスクが上限に達しています");
    }
}
