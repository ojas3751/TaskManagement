package com.example.taskmanagement.board;

/**
 * デフォルトの 3 列（{@code is_default}）に改名・削除を試みたときに投げる。
 *
 * <p>画面側でもボタンを出さないが、それだけに任せない。API は単独で呼ばれても
 * 保護されたリストを書き換えない（docs/design/api.md 2.3）。
 */
public class ListProtectedException extends RuntimeException {

    public ListProtectedException() {
        super("デフォルトのリストは変更できません");
    }
}
