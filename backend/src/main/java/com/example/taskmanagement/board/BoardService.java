package com.example.taskmanagement.board;

import jakarta.persistence.EntityManager;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BoardService {

    /** 1 つのリストに置けるタスクの上限（docs/design/api.md 2.3）。 */
    private static final int MAX_CARDS_PER_LIST = 200;

    private final BoardRepository boardRepository;
    private final TaskListRepository taskListRepository;
    private final CardRepository cardRepository;
    private final EntityManager entityManager;

    public BoardService(BoardRepository boardRepository,
                        TaskListRepository taskListRepository,
                        CardRepository cardRepository,
                        EntityManager entityManager) {
        this.boardRepository = boardRepository;
        this.taskListRepository = taskListRepository;
        this.cardRepository = cardRepository;
        this.entityManager = entityManager;
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
        return loadBoard();
    }

    /**
     * ボード全体を読み直して返す。
     *
     * <p>更新系はいずれも処理後のボード全体を返すため（docs/design/api.md 2.7）、
     * その組み立てをここに集約する。
     *
     * @throws BoardNotFoundException ボードが 1 件も無いとき。seed で必ず存在する前提
     *         （F-01）なので、これはデータの異常であり素通りさせない
     */
    private BoardResponse loadBoard() {
        return boardRepository.findBoardWithListsAndCards()
                .map(BoardResponse::from)
                .orElseThrow(BoardNotFoundException::new);
    }

    /**
     * タスクをリストの先頭に追加する（F-06）。仕様は docs/design/api.md 3.6。
     *
     * <p>既存タスクの position を一括で +1 してから、新規に 0 を振る。この 2 つは
     * 同じトランザクションに入れる。途中で失敗して「+1 だけされた」状態が残ると、
     * 連番に穴が空いたまま誰も直せなくなるため。
     *
     * <p>ID はリクエストで渡されたものをそのまま使う。画面側はサーバーの応答を待たずに
     * 採番した ID でカードを描いており、ここで振り直すと画面と DB の ID が食い違う。
     *
     * <p>返すのは処理後のボード全体（api.md 2.7）。画面側は position を自前で計算せず、
     * これで丸ごと置き換える。採番の知識をサーバーだけが持つようにするため。
     *
     * @throws ListNotFoundException     追加先のリストが存在しないとき
     * @throws CardLimitExceededException そのリストが既に上限に達しているとき
     */
    @Transactional
    public BoardResponse createCard(CreateCardRequest request) {
        UUID listId = request.listId();

        if (!taskListRepository.existsById(listId)) {
            throw new ListNotFoundException();
        }
        if (cardRepository.countByListId(listId) >= MAX_CARDS_PER_LIST) {
            throw new CardLimitExceededException();
        }

        cardRepository.shiftPositionsDown(listId);

        // getReference はプロキシを返すだけで SELECT を発行しない。ここで必要なのは
        // cards.list_id に書く値だけで、リストの中身は使わない。findById で実体を取ると、
        // shiftPositionsDown の clearAutomatically が永続化コンテキストを空にする都合上、
        // persist の直前にもう一度 lists を読みに行くことになる。存在確認は上の
        // existsById が済ませているので、プロキシで足りる。
        TaskList list = entityManager.getReference(TaskList.class, listId);

        Card card = new Card(request.id(), list, request.title(), "", null, false, 0);

        // save() ではなく persist() を使う。ID をアプリ側で採番している以上、save() からは
        // 「ID を持つ = 既存の行かもしれない」と見えて merge に倒れ、INSERT の前に不要な
        // SELECT が 1 回走る。新規追加であることはここでは確定しているので、明示的に INSERT する。
        entityManager.persist(card);

        // loadBoard の SELECT の前に Hibernate が自動で flush するため、いま persist した
        // カードもこの結果に含まれる
        return loadBoard();
    }

    /**
     * タスクのタイトル・説明文・期限を更新する（F-07）。仕様は docs/design/api.md 3.7。
     *
     * <p>4 項目すべてを毎回受け取る。部分更新にしないのは、詳細モーダルが 4 項目をまとめて
     * 保存するため。
     *
     * <p>save() を呼んでいないのは、トランザクションの中で取得したエンティティの値を変えれば、
     * コミット時に JPA が変更を検知して UPDATE を出すため（ダーティチェック）。
     *
     * @throws CardNotFoundException            対象のタスクが存在しないとき
     * @throws DueTimeWithoutDueDateException  日付が無いのに時分だけ指定されたとき
     */
    @Transactional
    public BoardResponse updateCard(UUID cardId, UpdateCardRequest request) {
        // 日付が無いのに時分だけある状態は表示のしようがないので、値として受け付けない。
        // 2 項目にまたがる検証なので @Valid ではなくここで見る
        if (request.dueAt() == null && request.hasDueTime()) {
            throw new DueTimeWithoutDueDateException();
        }

        Card card = cardRepository.findById(cardId).orElseThrow(CardNotFoundException::new);

        card.updateDetails(request.title(), request.description(),
                request.dueAt(), request.hasDueTime());

        return loadBoard();
    }
}
