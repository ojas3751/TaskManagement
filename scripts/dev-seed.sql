-- 開発用のテストデータ（タスク）。
--
-- Flyway の管理外に置いている。db/migration/ に入れると一度適用したあと編集できず、
-- 今後空の DB を作るたびにテストデータが混ざるため。マイグレーションに含める seed は
-- 「仕様上必ず存在する前提のもの」だけとする（docs/design/database.md「スキーマの管理」）。
--
-- 適用方法（PowerShell には < のリダイレクトが無いのでパイプで渡す）:
--   Get-Content scripts/dev-seed.sql | docker compose exec -T db psql -U taskmanagement -d taskmanagement
--
-- 何度流しても同じ状態になるよう、先頭で全タスクを消してから入れ直す。
-- リストとボードは V2__seed_default_board.sql が入れたものをそのまま使う。

BEGIN;

DELETE FROM cards;

-- TODO 列（00000000-0000-4000-8000-000000000101）
--
-- position は 0 始まりの連番（docs/design/database.md 4章）。
-- 挿入順と position の昇順をあえて食い違わせている。API が並べ替えているのか、
-- たまたま挿入順で返っているだけなのかを区別するため。
INSERT INTO cards (id, list_id, title, description, due_at, has_due_time, position) VALUES
    -- position 2。挿入は先頭だが、取得時は3番目に来なければならない。
    ('00000000-0000-4000-8000-000000000203',
     '00000000-0000-4000-8000-000000000101',
     '期限を日時まで指定したタスク',
     '時分ありの表示確認用。has_due_time が true。',
     '2026-08-25T14:30:00+09:00', true, 2),

    -- position 0。期限なし・説明文なしの最小構成。description は空文字（null にしない）。
    ('00000000-0000-4000-8000-000000000201',
     '00000000-0000-4000-8000-000000000101',
     '期限なしのタスク',
     '', NULL, false, 0),

    -- position 1。日付のみ指定。due_at は 00:00 だが has_due_time は false。
    -- 「00:00 だから時刻未指定」と推測してはいけないことの確認用。
    ('00000000-0000-4000-8000-000000000202',
     '00000000-0000-4000-8000-000000000101',
     '期限を日付だけ指定したタスク',
     '時分なしの表示確認用。',
     '2026-08-22T00:00:00+09:00', false, 1);

-- 進行中 列（00000000-0000-4000-8000-000000000102）
INSERT INTO cards (id, list_id, title, description, due_at, has_due_time, position) VALUES
    -- 説明文に改行を含む。改行が保持されて返ることの確認用（F-07）。
    ('00000000-0000-4000-8000-000000000211',
     '00000000-0000-4000-8000-000000000102',
     '説明文に改行を含むタスク',
     E'1行目。\n2行目。\n\n空行を挟んだ4行目。',
     NULL, false, 0);

-- 完了 列（00000000-0000-4000-8000-000000000103）
INSERT INTO cards (id, list_id, title, description, due_at, has_due_time, position) VALUES
    ('00000000-0000-4000-8000-000000000221',
     '00000000-0000-4000-8000-000000000103',
     '完了したタスク その1',
     '', '2026-08-10T00:00:00+09:00', false, 0),

    ('00000000-0000-4000-8000-000000000222',
     '00000000-0000-4000-8000-000000000103',
     '完了したタスク その2',
     '', NULL, false, 1);

COMMIT;

-- 投入結果の確認。
SELECT l.title AS list, c.position, c.title, c.due_at, c.has_due_time
FROM cards c
JOIN lists l ON l.id = c.list_id
ORDER BY l.position, c.position;
