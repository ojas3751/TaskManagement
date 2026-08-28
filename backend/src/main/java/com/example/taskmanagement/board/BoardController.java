package com.example.taskmanagement.board;

import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class BoardController {

    private final BoardService boardService;

    public BoardController(BoardService boardService) {
        this.boardService = boardService;
    }

    /**
     * ボード・リスト・タスクの一括取得（F-01）。仕様は docs/design/api.md 3.1。
     *
     * <p>リストごとにタスクを取りに行く作りにしないのは、リクエスト数が列数に比例して
     * 増えるため（api.md 2.2）。
     */
    @GetMapping("/api/board")
    public BoardResponse getBoard() {
        return boardService.getBoard();
    }

    /**
     * リストの追加（F-02）。仕様は docs/design/api.md 3.2。
     *
     * <p>挿入位置は body に含めない。追加先は「完了」列の左隣と決まっており、position の
     * 採番はサーバーだけが持つ。
     */
    @PostMapping("/api/lists")
    @ResponseStatus(HttpStatus.CREATED)
    public BoardResponse createList(@Valid @RequestBody CreateListRequest request) {
        return boardService.createList(request);
    }

    /**
     * リスト名の変更（F-03）。仕様は docs/design/api.md 3.3。
     *
     * <p>PUT ではなく PATCH なのは、リストの全項目を置き換えるわけではないため。
     * position はここでは変えられず、並び替えは PATCH /api/lists/reorder が担う。
     */
    @PatchMapping("/api/lists/{id}")
    public BoardResponse updateList(@PathVariable UUID id,
                                    @Valid @RequestBody UpdateListRequest request) {
        return boardService.updateList(id, request);
    }

    /**
     * リストの削除（F-04）。仕様は docs/design/api.md 3.4。
     *
     * <p>中のタスクも一緒に消える。204 ではなくボード全体を返すのは、削除で変わるのが
     * 対象のリストだけではなく、後続のリストの position も詰まるため（api.md 2.7）。
     */
    @DeleteMapping("/api/lists/{id}")
    public BoardResponse deleteList(@PathVariable UUID id) {
        return boardService.deleteList(id);
    }

    /**
     * タスクの追加（F-06）。仕様は docs/design/api.md 3.6。
     *
     * <p>返すのは処理後のボード全体（api.md 2.7）。画面側は応答を待たずに描いたうえで、
     * 返ってきた全体で置き換える。先に描くのは待たせないため、置き換えるのは position の
     * 正解をサーバーだけが持つようにするためで、この 2 つは両立する。
     *
     * <p>{@code @Valid} を付けないと CreateCardRequest の制約が動かない。違反は
     * MethodArgumentNotValidException として GlobalExceptionHandler に渡る。
     */
    @PostMapping("/api/cards")
    @ResponseStatus(HttpStatus.CREATED)
    public BoardResponse createCard(@Valid @RequestBody CreateCardRequest request) {
        return boardService.createCard(request);
    }

    /**
     * タスクの編集（F-07, F-09）。仕様は docs/design/api.md 3.7。
     *
     * <p>PUT ではなく PATCH なのは、タスクの全項目を置き換えるわけではないため。list_id と
     * position はこのエンドポイントでは変えられず、移動は PATCH /api/cards/move が担う。
     */
    @PatchMapping("/api/cards/{id}")
    public BoardResponse updateCard(@PathVariable UUID id,
                                    @Valid @RequestBody UpdateCardRequest request) {
        return boardService.updateCard(id, request);
    }

    /**
     * タスクの削除（F-08）。仕様は docs/design/api.md 3.8。
     *
     * <p>204 ではなくボード全体を返す（api.md 2.7）。削除で変わるのは対象のタスクだけでは
     * なく、同じリストの後続タスクの position も詰まるため。
     */
    @DeleteMapping("/api/cards/{id}")
    public BoardResponse deleteCard(@PathVariable UUID id) {
        return boardService.deleteCard(id);
    }

    /**
     * タスクの移動（F-13, F-23）。仕様は docs/design/api.md 3.9。
     *
     * <p>パスに ID を含めず /api/cards/move としているのは、この操作が 1 件のタスクだけでなく
     * <strong>リスト内の並び全体</strong>を書き換えるため。/api/cards/{id} の形にすると、
     * 変更対象がその 1 件に閉じているように読める。
     */
    @PatchMapping("/api/cards/move")
    public BoardResponse moveCard(@Valid @RequestBody MoveCardRequest request) {
        return boardService.moveCard(request);
    }
}
