package com.example.taskmanagement.board;

/**
 * 選択削除（F-15）で、削除するタスクが 1 件も指定されなかったときに投げる。
 *
 * <p>画面側は 0 件のときボタンを押せなくしているが、API 単独で呼ばれても守る
 * （docs/design/api.md 2.3 と同じ考え方）。
 */
public class CardIdsRequiredException extends RuntimeException {

    public CardIdsRequiredException() {
        super("削除するタスクが指定されていません");
    }
}
