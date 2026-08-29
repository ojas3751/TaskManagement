package com.example.taskmanagement.board;

import jakarta.persistence.EntityManager;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BoardService {

    /** 1 つのリストに置けるタスクの上限（docs/design/api.md 2.3）。 */
    private static final int MAX_CARDS_PER_LIST = 200;

    /**
     * 1 つのボードに追加できるリストの上限（docs/design/api.md 2.3）。
     *
     * <p>数えるのは追加されたリストだけで、seed の 3 列は含めない。
     */
    private static final int MAX_ADDED_LISTS_PER_BOARD = 10;

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
     * リストを「完了」列の左隣に追加する（F-02）。仕様は docs/design/api.md 3.2。
     *
     * <p>挿入位置は受け取らない。完了列は常に最右であり（is_fixed_last）、新しいリストは
     * その手前に入ると決まっているため、位置を指定させる余地がない。
     *
     * <p>完了列以降を +1 してから、空いた番号を新しいリストに振る。この 2 つは同じ
     * トランザクションに入れる。途中で失敗して「+1 だけされた」状態が残ると、連番に穴が
     * 空いたまま誰も直せなくなる（createCard と同じ理由）。
     *
     * <p>ID と persist の扱い、ボード全体を返す理由も createCard と同じ。
     *
     * @throws ListNotFoundException      完了列が見つからないとき。seed で必ず存在する前提
     *                                    なので、これはデータの異常であり素通りさせない
     * @throws ListLimitExceededException ボードのリストが既に上限に達しているとき
     */
    @Transactional
    public BoardResponse createList(CreateListRequest request) {
        // 挿入位置の基準。ここから board も辿れるので、ボードを別に読み直さない
        TaskList fixedLast = taskListRepository.findByIsFixedLastTrue()
                .orElseThrow(ListNotFoundException::new);

        // LAZY なプロキシだが、id を取るだけなら SELECT は飛ばない（ID は既に分かっている）
        UUID boardId = fixedLast.getBoard().getId();

        if (taskListRepository.countByBoardIdAndIsDefaultFalse(boardId) >= MAX_ADDED_LISTS_PER_BOARD) {
            throw new ListLimitExceededException();
        }

        int position = fixedLast.getPosition();

        // 先に位置を控えてからずらす。shiftPositionsDown の clearAutomatically で
        // fixedLast は管理下から外れるため、この後に getPosition を呼んでも意味がない
        taskListRepository.shiftPositionsDown(boardId, position);

        Board board = entityManager.getReference(Board.class, boardId);

        // 追加したリストは既定の 3 列ではないので、改名・削除・移動をすべて許す
        // （is_default = false, is_fixed_last = false）
        TaskList list = new TaskList(request.id(), board, request.title(), false, false, position);

        entityManager.persist(list);

        return loadBoard();
    }

    /**
     * リスト名を変える（F-03）。仕様は docs/design/api.md 3.3。
     *
     * <p>save() を呼んでいないのは updateCard と同じ理由（ダーティチェック）。
     *
     * @throws ListNotFoundException  対象のリストが存在しないとき
     * @throws ListProtectedException デフォルトの 3 列を変えようとしたとき
     */
    @Transactional
    public BoardResponse updateList(UUID listId, UpdateListRequest request) {
        TaskList list = taskListRepository.findById(listId).orElseThrow(ListNotFoundException::new);

        // 画面はデフォルト列に改名ボタンを出さないが、API 単独で呼ばれても守る（api.md 2.3）
        if (list.isDefault()) {
            throw new ListProtectedException();
        }

        list.rename(request.title());

        return loadBoard();
    }

    /**
     * リストを、中のタスクごと削除する（F-04）。仕様は docs/design/api.md 3.4。
     *
     * <p>タスクは lists.cards の {@code cascade = ALL} と {@code orphanRemoval} で一緒に消える
     * （DB 側にも ON DELETE CASCADE がある）。
     *
     * <p>削除と、空いた位置を詰める処理を同じトランザクションに入れる。理由は deleteCard と
     * 同じで、「消えたが詰めていない」状態が残ると position の連番に穴が空く。
     *
     * @throws ListNotFoundException  対象のリストが存在しないとき
     * @throws ListProtectedException デフォルトの 3 列を消そうとしたとき
     */
    @Transactional
    public BoardResponse deleteList(UUID listId) {
        TaskList list = taskListRepository.findById(listId).orElseThrow(ListNotFoundException::new);

        // 画面は削除の入口を出さないが、API 単独で呼ばれても守る（api.md 2.3）
        if (list.isDefault()) {
            throw new ListProtectedException();
        }

        Board board = list.getBoard();
        UUID boardId = board.getId();

        // delete(list) を直接呼ばず、ボードから外して orphanRemoval に消させる。
        // 理由は Board.removeList の Javadoc を参照（cascade = ALL が削除を打ち消す）
        board.removeList(list);

        // 削除を予約しただけでは DELETE が飛んでいない。続く再採番は永続化コンテキストを
        // 迂回して DB を直接読み書きするため、先に書き出す（deleteCard と同じ）
        taskListRepository.flush();

        renumberLists(boardId);

        return loadBoard();
    }

    /** ボード内のリストを、今の並び順のまま 0 から振り直す（空番を残さない）。 */
    private void renumberLists(UUID boardId) {
        List<TaskList> lists = taskListRepository.findByBoardIdOrderByPositionAsc(boardId);

        for (int position = 0; position < lists.size(); position++) {
            taskListRepository.placeList(lists.get(position).getId(), position);
        }
    }

    /**
     * リストを並び替える（F-05）。仕様は docs/design/api.md 3.5。
     *
     * <p>変更後の並び順すべてを受け取り、配列の添字をそのまま position にする。1 件だけ
     * 「これをここへ動かす」と受け取る形にしないのは、<strong>「完了列が最右か」を末尾の
     * 要素だけ見て判定できる</strong>ため。移動元・移動先を個別に検査せずに済む。
     *
     * <p>受け取った配列をそのまま信じないのは moveCard と同じ理由。画面の情報が古いと、
     * position を振られないリストが残る。
     *
     * @throws ListNotFoundException          完了列が見つからないとき。seed で必ず存在する前提
     * @throws ListIdsMismatchException       送られてきた並びが今の顔ぶれと一致しないとき
     * @throws FixedLastMustBeLastException   完了列が末尾に無いとき
     */
    @Transactional
    public BoardResponse reorderLists(ReorderListsRequest request) {
        TaskList fixedLast = taskListRepository.findByIsFixedLastTrue()
                .orElseThrow(ListNotFoundException::new);

        UUID boardId = fixedLast.getBoard().getId();
        List<UUID> given = request.listIds();

        verifyListOrder(boardId, given);

        // 完了列は常に最右（api.md 2.3）。並び順を丸ごと受け取っているので、
        // 末尾を見るだけで「完了自身が動いた」も「他の列が完了より右へ来た」も同時に弾ける
        if (!given.get(given.size() - 1).equals(fixedLast.getId())) {
            throw new FixedLastMustBeLastException();
        }

        for (int position = 0; position < given.size(); position++) {
            taskListRepository.placeList(given.get(position), position);
        }

        return loadBoard();
    }

    /** 送られてきた並びが、いまのボードのリストの顔ぶれと過不足なく一致するか確かめる。 */
    private void verifyListOrder(UUID boardId, List<UUID> given) {
        Set<UUID> expected = taskListRepository.findByBoardIdOrderByPositionAsc(boardId).stream()
                .map(TaskList::getId)
                .collect(Collectors.toCollection(HashSet::new));

        Set<UUID> unique = new HashSet<>(given);

        // 件数も見るのは、同じ ID が 2 回入っていても集合にすると 1 件に潰れてしまうため
        if (unique.size() != given.size() || !unique.equals(expected)) {
            throw new ListIdsMismatchException();
        }
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

    /**
     * タスクを削除する（F-08）。仕様は docs/design/api.md 3.8。
     *
     * <p>削除と、空いた位置を詰める処理を同じトランザクションに入れる。途中で失敗して
     * 「消えたが詰めていない」状態が残ると、position の連番に穴が空いたまま誰も直せなくなる。
     *
     * <p>詰める対象を決めるために、削除する前に所属リストと位置を控えておく。
     *
     * @throws CardNotFoundException 対象のタスクが存在しないとき
     */
    @Transactional
    public BoardResponse deleteCard(UUID cardId) {
        Card card = cardRepository.findById(cardId).orElseThrow(CardNotFoundException::new);

        TaskList list = card.getList();
        UUID listId = list.getId();
        int position = card.getPosition();

        // EntityManager.remove を直接呼ばず、リストから外して orphanRemoval に消させる。
        // 理由は TaskList.removeCard の Javadoc を参照（cascade = ALL が削除を打ち消す）
        list.removeCard(card);

        // 削除を予約しただけでは、まだ DELETE が飛んでいない。続く一括 UPDATE は
        // 永続化コンテキストを迂回して DB を直接書き換えるため、先に書き出しておかないと
        // 「詰めたのに消えていない」状態のボードを読んでしまう
        cardRepository.flush();

        cardRepository.shiftPositionsUp(listId, position);

        return loadBoard();
    }

    /**
     * タスクを移動する（F-13, F-23）。仕様は docs/design/api.md 3.9。
     *
     * <p>移動先の並びは受け取ったとおりに振り直し、移動元は残ったタスクを詰めて振り直す。
     * 移動元の並びを受け取らないのは、タスクが 1 件抜けるだけで並びの意図は変わらないため。
     *
     * <p>すべて同じトランザクションに入れる。移動先だけ書き換わって移動元が詰まっていない
     * 状態が残ると、position の連番に穴が空いたまま誰も直せなくなる。
     *
     * @throws CardNotFoundException      タスクが存在しないとき
     * @throws ListNotFoundException      移動元または移動先のリストが存在しないとき
     * @throws CardLimitExceededException 移動先が既に上限に達しているとき
     * @throws CardIdsMismatchException   送られてきた並びが移動後の顔ぶれと一致しないとき
     */
    @Transactional
    public BoardResponse moveCard(MoveCardRequest request) {
        Card card = cardRepository.findById(request.cardId()).orElseThrow(CardNotFoundException::new);

        if (!taskListRepository.existsById(request.fromListId())
                || !taskListRepository.existsById(request.toListId())) {
            throw new ListNotFoundException();
        }

        // 画面が思っている移動元と、DB 上の所属が食い違っている。別のタブで動かした後など、
        // 画面の情報が古い場合に起きる。そのまま進めると誤ったリストを詰め直してしまう
        if (!card.getList().getId().equals(request.fromListId())) {
            throw new CardIdsMismatchException();
        }

        boolean sameList = request.fromListId().equals(request.toListId());

        if (!sameList && cardRepository.countByListId(request.toListId()) >= MAX_CARDS_PER_LIST) {
            throw new CardLimitExceededException();
        }

        verifyDestinationOrder(request, sameList);

        // 移動先を、受け取った並びのとおりに振り直す。添字がそのまま position になる
        TaskList toList = entityManager.getReference(TaskList.class, request.toListId());
        for (int position = 0; position < request.toCardIds().size(); position++) {
            cardRepository.placeCard(request.toCardIds().get(position), toList, position);
        }

        // 移動元は 1 件抜けた分だけ詰める。同じリスト内の並び替えなら上で振り直し済み
        if (!sameList) {
            renumber(request.fromListId());
        }

        return loadBoard();
    }

    /**
     * 送られてきた並びが、移動後の移動先リストの顔ぶれと一致するか確かめる。
     *
     * <p>受け取った配列をそのまま信じないのは、画面側の思い込みで DB の並びが書き換わって
     * しまうため。古い画面が知らないタスクは配列に含まれず、そのまま適用すると position を
     * 振られないタスクが残る。
     */
    private void verifyDestinationOrder(MoveCardRequest request, boolean sameList) {
        Set<UUID> expected = cardRepository.findByListIdOrderByPositionAsc(request.toListId()).stream()
                .map(Card::getId)
                .collect(Collectors.toCollection(HashSet::new));

        // 別のリストへ移すときは、移動してくるタスクが顔ぶれに加わる
        if (!sameList) {
            expected.add(request.cardId());
        }

        Set<UUID> given = new HashSet<>(request.toCardIds());

        // 件数も見るのは、同じ ID が 2 回入っていても集合にすると 1 件に潰れてしまうため
        if (given.size() != request.toCardIds().size() || !given.equals(expected)) {
            throw new CardIdsMismatchException();
        }
    }

    /** リスト内のタスクを、今の並び順のまま 0 から振り直す（空番を残さない）。 */
    private void renumber(UUID listId) {
        TaskList list = entityManager.getReference(TaskList.class, listId);
        List<Card> cards = cardRepository.findByListIdOrderByPositionAsc(listId);

        for (int position = 0; position < cards.size(); position++) {
            cardRepository.placeCard(cards.get(position).getId(), list, position);
        }
    }
}
