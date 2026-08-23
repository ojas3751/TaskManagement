package com.example.taskmanagement.board;

/**
 * 指定された ID のリストが存在しないときに投げる。
 *
 * <p>別のタブでリストが削除された後に、古い画面から追加しようとした場合などに起きる。
 */
public class ListNotFoundException extends RuntimeException {

    public ListNotFoundException() {
        super("リストが見つかりません");
    }
}
