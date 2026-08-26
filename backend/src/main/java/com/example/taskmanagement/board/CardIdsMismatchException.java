package com.example.taskmanagement.board;

/**
 * 送られてきた {@code to_card_ids} が、移動後の移動先リストの顔ぶれと一致しないときに投げる
 * （docs/design/api.md 3.9）。
 *
 * <p>別のタブで同じリストを操作した後など、画面が持っている並びが古いときに起きる。
 *
 * <p>受け取った配列をそのまま信じて position を振らないのは、**画面側の思い込みで DB の
 * 並びが書き換わってしまう**ため。たとえば古い画面が知らないタスクは配列に含まれず、
 * そのまま適用すると position を振られないタスクが残る。
 */
public class CardIdsMismatchException extends RuntimeException {

    public CardIdsMismatchException() {
        super("並び順が最新ではありません");
    }
}
