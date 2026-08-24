package com.example.taskmanagement.board;

/**
 * 指定された ID のタスクが存在しないときに投げる。
 *
 * <p>別のタブでタスクが削除された後に、古い画面から保存しようとした場合などに起きる。
 */
public class CardNotFoundException extends RuntimeException {

    public CardNotFoundException() {
        super("タスクが見つかりません");
    }
}
