package com.example.taskmanagement.board;

/**
 * ボードが 1 件も見つからないときに投げる。
 *
 * <p>ボードとデフォルト 3 列は seed で必ず存在する前提（F-01）のため、これが起きるのは
 * データの異常。空のレスポンスを返して素通りさせると、画面側は「タスクが 0 件のボード」と
 * 区別できない。
 */
public class BoardNotFoundException extends RuntimeException {

    public BoardNotFoundException() {
        super("ボードが見つかりません");
    }
}
