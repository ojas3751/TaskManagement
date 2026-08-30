# TaskManagement

Trello 風の単一ボード型タスク管理アプリ。**個人用・ローカル専用**（外部公開しない）。

タスクを列（リスト）に並べ、追加・編集・削除・列間の移動を行う。利用者は本人1名、利用端末は PC のブラウザのみ。認証は持たない。

Web 開発の学習を副次目的としており、**要件定義から順に文書を積み上げてから実装する**方針で進めている。何をどこに書いているかは [ドキュメント一覧](docs/README.md) を参照。

| | |
| --- | --- |
| **現在地** | **MVP 完成**（Step 0〜11 がすべて完了）。タスクの追加・編集・削除・移動、列の追加・改名・削除・並び替えが揃っている。全体像は [開発計画](docs/development-plan.md) |
| **入り口** | `http://localhost:3000` |
| **文書の起点** | [要件定義書](docs/requirements.md) |
| **作業ルール** | [CLAUDE.md](CLAUDE.md)（Issue → ブランチ → PR） |

---

## 技術スタック

言語・フレームワーク・DB は課題側からの指定。それ以外は指定に合わせて選定した。**選定理由**は [要件定義書](docs/requirements.md) の「技術スタック」にある。

| 層 | 技術 | 版 |
| --- | --- | --- |
| **バックエンド** | Java (Temurin, LTS) | **25.0.4** |
| | Spring Boot（Web MVC / Data JPA / Validation / Flyway） | **4.1.0** |
| | Gradle（Kotlin DSL、Wrapper 同梱） | 9.5.1 |
| **DB アクセス** | Spring Data JPA / Hibernate ORM | 7.4.1 |
| | Flyway（マイグレーション。`ddl-auto` は使わない） | 12.4.0 |
| **データベース** | PostgreSQL（**Docker コンテナ**。構成は `compose.yaml`） | **17.11** |
| **フロントエンド** | React（**Next.js は使わない**） | **19.2.8** |
| | TypeScript | **6.0.3** |
| | Vite | **8.2.1** |
| | Tailwind CSS | 4.3.3 |
| | oxlint | 1.78.0 |
| **実行環境** | Node.js (LTS) ／ npm ／ Docker Engine | 22.14.0 ／ 10.9.2 ／ 29.7.2 |

推移的に決まるものも含めた全一覧は [要件定義書](docs/requirements.md) の「実際のバージョン」にある。**版の正本は各ビルドファイル**（`backend/build.gradle.kts` / `frontend/package.json` / `compose.yaml`）であり、文書と食い違ったらビルドファイルが正しい。

---

## 構成

フロントエンドとバックエンドは分離している。

```
ブラウザ  ──http://localhost:3000──▶  Vite 開発サーバー (React SPA)
                                        │  /api/* を転送（プロキシ）
                                        ▼
                                     Spring Boot (localhost:8080)
                                        │
                                        ▼
                                     PostgreSQL (localhost:5432)
                                       ※ Docker コンテナ
```

**利用者が開くのは `localhost:3000` だけでよい。** `/api` へのリクエストだけが 8080 へ転送されるため、ブラウザから見た通信は同一オリジンになり、CORS の設定が要らない。

### ディレクトリ

```
backend/                 Spring Boot（Gradle プロジェクト）
  src/main/java/…/board/   ボード・リスト・タスク（エンティティ / Repository / Service / Controller）
  src/main/java/…/web/     エラー応答の共通処理（@ControllerAdvice）
  src/main/resources/
    application.properties ポート・接続情報・JSON とログの方針
    db/migration/          Flyway のマイグレーション（V1 スキーマ / V2 seed）
frontend/                React + Vite
  src/api/                 fetch を薄くラップした API クライアントと型
  src/components/          ボード画面のコンポーネント
  src/lib/                 表示用のロジック（期限の整形など）
  vite.config.ts           ポート 3000 固定と /api のプロキシ設定
compose.yaml             PostgreSQL のコンテナ構成
docs/                    設計ドキュメント（→ docs/README.md）
mock/                    画面モック（素の HTML/CSS/JS。バックエンド不要）
scripts/                 開発補助（ポート解放、seed）
.claude/                 作業ルールの強制（フック）と手順スキル
```

---

## セットアップ

初回のみ必要。**詳細な手順は [運用手順](docs/operations.md) の「初回セットアップ」にある**（JDK・Node.js・Docker Desktop の導入、DB のパスワード設定を含む）。要点は次の2つ。

```powershell
Copy-Item .env.example .env     # DB_PASSWORD を書く（docker compose が読む）
```

**バックエンドは `.env` を読まない。** 同じパスワードと接続情報を、ユーザー環境変数 `DB_PASSWORD` / `DB_URL` / `DB_USERNAME` にも設定する。接続情報をリポジトリにコミットしないための構成。

---

## 起動

```powershell
docker compose up -d              # DB
cd backend;  .\gradlew bootRun    # ターミナル1
cd frontend; npm run dev          # ターミナル2
```

ブラウザで `http://localhost:3000` を開く。停止は `Ctrl + C` と `docker compose down`（**`-v` を付けるとデータが消える**）。

繋がっているかは、プロセスではなく応答で確かめる。プロキシ経由が 200 なら3層が通っている。

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3000/api/board
```

### ポートは 3000 / 8080 / 5432 に固定

**別のポートでは動かない。** 3つが互いを番号で直接指しており（Vite のプロキシ先は `http://localhost:8080` にハードコード）、片方をずらすとプロセスは起動しても `/api/*` が繋がらない。**「8081 で立てて確認した」は確認になっていない。**

埋まっていたら、逃がさずに占有側を止める。

```powershell
pwsh -File scripts/free-port.ps1 3000 8080
```

止める前に、表示された PID とプロセス名を必ず見ること。5432 は対象外（DB は Docker が管理しているため `docker compose` で止める）。

---

## 開発コマンド

| 目的 | コマンド |
| --- | --- |
| バックエンド起動 | `cd backend; .\gradlew bootRun` |
| バックエンドのテスト | `cd backend; .\gradlew test` |
| フロントエンド起動 | `cd frontend; npm run dev` |
| 型チェック＋ビルド | `cd frontend; npm run build` |
| Lint | `cd frontend; npm run lint` |
| DB に psql で入る | `docker compose exec db psql -U taskmanagement -d taskmanagement` |
| ポート解放 | `pwsh -File scripts/free-port.ps1 3000 8080` |

`psql` / `pg_dump` は**コンテナ経由で使う**。ホストに入れる必要はなく、サーバーと版が必ず一致する。バックアップ手順は [運用手順](docs/operations.md)。

---

## ドキュメント

| 文書 | 役割 |
| --- | --- |
| [要件定義書](docs/requirements.md) | **何を作るか、なぜその範囲か。** 目的・スコープ・非機能要件・技術スタック |
| [機能仕様書](docs/functional-spec.md) | 各機能（F-xx）の詳細と受け入れ条件 |
| [画面設計](docs/design/ui.md) | ワイヤーフレーム |
| [データベース設計](docs/design/database.md) | ER図、テーブル定義、`position` の採番方式 |
| [API設計](docs/design/api.md) | エンドポイントと入出力仕様 |
| [開発計画](docs/development-plan.md) | Step 0〜11。GitHub のマイルストーンと対応 |
| [運用手順](docs/operations.md) | 初回セットアップ、起動、バックアップ |

**初めて読む場合は上から順に読むと前提が積み上がる。** 各文書は独立した改訂履歴を持ち、版の刻み方は各文書の冒頭に書いてある。索引と読む順の詳細は [ドキュメント一覧](docs/README.md)。

> **呼び方の使い分け。** 利用者に見えるものと文書の本文では「タスク」と呼ぶが、**DB のテーブル名と API のパスは `cards`** のままにしている。意図的な使い分け。

---

## 開発の進め方

1 人開発だが、変更は必ず **Issue → ブランチ → PR → マージ** の順で進める。理由はレビューを受けるためではなく、**あとから自分が判断の理由を追えるようにするため**。

- `main` への直接 push と force push は GitHub の ruleset で拒否される
- ブランチ名は `<type>/<Issue番号>-<短い説明>`（例: `feat/12-columns-from-db`）
- PR 本文には `Closes #<Issue番号>` を書く
- Issue と PR には**種類ラベル1つ**（`feat` `fix` `docs` `chore` `refactor`）と**領域ラベル1つ以上**（`backend` `frontend` `db` `infra`）を付ける

手順の正本は **[作業ルール](CLAUDE.md)**。ルールのうち機械的に守れるものは `.claude/hooks/` のフックが実行時にブロックする。
