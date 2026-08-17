-- タスク管理アプリの初期スキーマ
-- 設計の根拠は docs/design/database.md を参照。
--
-- 注意: 一度適用したこのファイルは編集しない。
-- Flyway がチェックサムを記録しており、後から書き換えると起動時にエラーになる。
-- 変更が必要になったら V2 以降を新しく追加すること。

-- ボード
-- 現状1件のみだが、F-19（ボードの複数管理）に備えてテーブルとして独立させる。
CREATE TABLE boards (
    id         uuid        NOT NULL,
    title      text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT boards_pkey PRIMARY KEY (id)
);

-- リスト（列）
CREATE TABLE lists (
    id            uuid        NOT NULL,
    board_id      uuid        NOT NULL,
    title         text        NOT NULL,
    is_default    boolean     NOT NULL DEFAULT false,
    is_fixed_last boolean     NOT NULL DEFAULT false,
    position      integer     NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT lists_pkey       PRIMARY KEY (id),
    CONSTRAINT lists_board_fkey FOREIGN KEY (board_id)
        REFERENCES boards (id) ON DELETE CASCADE,

    -- 空文字と50文字超を弾く。画面側の入力制限は迂回できるため DB でも守る。
    CONSTRAINT lists_title_not_blank CHECK (btrim(title) <> ''),
    CONSTRAINT lists_title_length    CHECK (char_length(title) <= 50)
);

-- タスク（利用者向けの呼称は「タスク」、テーブル名は cards のまま）
-- 対応関係の理由は docs/requirements.md の「用語」を参照。
CREATE TABLE cards (
    id           uuid        NOT NULL,
    -- 所属リストの唯一の情報源。board_id は持たせない（lists を辿れば特定できる）。
    list_id      uuid        NOT NULL,
    title        text        NOT NULL,
    -- 未入力は空文字。NULL と空文字を混在させない。
    description  text        NOT NULL DEFAULT '',
    -- NULL は「期限なし」。
    due_at       timestamptz,
    -- 時分が指定されたか。due_at が 00:00 のとき、未入力か0時指定かを区別するために持つ。
    has_due_time boolean     NOT NULL DEFAULT false,
    position     integer     NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT cards_pkey      PRIMARY KEY (id),
    CONSTRAINT cards_list_fkey FOREIGN KEY (list_id)
        REFERENCES lists (id) ON DELETE CASCADE,

    CONSTRAINT cards_title_not_blank      CHECK (btrim(title) <> ''),
    CONSTRAINT cards_title_length         CHECK (char_length(title) <= 100),
    CONSTRAINT cards_description_length   CHECK (char_length(description) <= 5000),
    -- 期限なしなのに時刻指定あり、という状態を作らせない。
    CONSTRAINT cards_due_time_needs_date  CHECK (due_at IS NOT NULL OR has_due_time = false)
);

-- 並び順つきの取得（GET /api/board）で使う。
-- (list_id, position) に UNIQUE は付けない。一括再採番の途中で必ず値が重複するため。
CREATE INDEX lists_board_position_idx ON lists (board_id, position);
CREATE INDEX cards_list_position_idx  ON cards (list_id, position);
