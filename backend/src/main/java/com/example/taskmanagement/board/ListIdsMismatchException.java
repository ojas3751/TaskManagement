package com.example.taskmanagement.board;

/**
 * 送られてきた並びが、既存のリストの顔ぶれと一致しないときに投げる。
 *
 * <p>画面が持っている情報が古いときに起きる（別のタブで列を足した後など）。そのまま適用すると、
 * position を振られないリストが残る。{@link CardIdsMismatchException} のリスト版。
 */
public class ListIdsMismatchException extends RuntimeException {

    public ListIdsMismatchException() {
        super("送られてきたリストの並びが、現在の顔ぶれと一致しません");
    }
}
