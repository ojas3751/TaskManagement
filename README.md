# TaskManagement

Trello 風の単一ボード型タスク管理アプリ。**個人用・ローカル専用**（外部公開しない）。

Web 開発の学習を副次目的としており、要件定義から順に文書を積み上げてから実装している。詳細は **[ドキュメント一覧](docs/README.md)** を参照。

## 技術スタック

| 層 | 技術 |
| --- | --- |
| バックエンド | Java 25 (LTS) ／ Spring Boot 4.1 ／ Gradle (Kotlin DSL) |
| DB アクセス | Spring Data JPA / Hibernate ／ マイグレーションは Flyway |
| フロントエンド | React ／ TypeScript ／ Vite（**Next.js は使わない**） |
| データベース | PostgreSQL 17（**Docker コンテナ**。構成は `compose.yaml`） |

選定理由は [要件定義書](docs/requirements.md) の「技術スタック」に記載。

## 構成

```
ブラウザ  ──http://localhost:3000──▶  Vite 開発サーバー (React SPA)
                                        │  /api/* を転送
                                        ▼
                                     Spring Boot (localhost:8080)
                                        │
                                        ▼
                                     PostgreSQL (localhost:5432)
                                       ※ Docker コンテナ
```

利用者が開くのは `localhost:3000` だけでよい。

```
backend/       Spring Boot（Gradle プロジェクト）
frontend/      React + Vite
compose.yaml   PostgreSQL のコンテナ構成
docs/          設計ドキュメント
mock/          画面モック（素の HTML/CSS/JS。バックエンド不要）
```

## 起動

```powershell
docker compose up -d              # DB
cd backend;  .\gradlew bootRun    # ターミナル1
cd frontend; npm run dev          # ターミナル2
```

停止は `Ctrl + C` と `docker compose down`（**`-v` を付けるとデータが消える**）。

初回セットアップ（JDK・Node.js・PostgreSQL の導入、DB とロールの作成、接続情報の設定）は **[運用手順](docs/operations.md)** を参照。
