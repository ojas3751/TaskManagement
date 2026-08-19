package com.example.taskmanagement.board;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BoardService {

    private final BoardRepository boardRepository;

    public BoardService(BoardRepository boardRepository) {
        this.boardRepository = boardRepository;
    }

    /**
     * ボード全体を取得する。
     *
     * <p>readOnly = true は「このなかでは書き込みをしない」という宣言。変更の追跡が省ける
     * ぶん効率がよく、読み取りのつもりが書き込んでいたという事故への歯止めにもなる。
     *
     * @throws BoardNotFoundException ボードが 1 件も無いとき。seed で必ず存在する前提
     *         （F-01）なので、これはデータの異常であり素通りさせない
     */
    @Transactional(readOnly = true)
    public BoardResponse getBoard() {
        return boardRepository.findBoardWithListsAndCards()
                .map(BoardResponse::from)
                .orElseThrow(BoardNotFoundException::new);
    }
}
