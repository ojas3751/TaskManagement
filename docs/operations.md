# 運用手順 v1.0

**関連文書**: [要件定義書](requirements.md) ／ [データベース設計](design/database.md) ／ [開発計画](development-plan.md) ／ [文書一覧](README.md)

---

## 改訂履歴

| 版 | 日付 | 変更内容 |
| --- | --- | --- |
| 0.1 | 2026-08-13 | 要件定義書 v0.7 から分割して初版作成。システム構成とバックアップ手順のみ記載。**起動手順は未記載** |
| **1.0** | **2026-08-16** | 要件定義書 v1.0（技術スタック確定）を反映し、**保留していた起動手順を記載して本書を完成させた。** **Docker を使わない方針に変更**したため、システム構成図・バックアップの注意事項を全面的に書き換え。「初回セットアップ」の章を新設 |

---

## 1. システム構成

```
┌─ 利用者のPC ─────────────────────────────────────┐
│                                                   │
│   ブラウザ (Chrome / Edge / Firefox)               │
│     │                                             │
│     │  HTTP  localhost:3000                       │
│     ▼                                             │
│   Vite 開発サーバー（React SPA を配信）              │
│     │                                             │
│     │  /api/* だけを転送（プロキシ）                 │
│     │  HTTP  localhost:8080                       │
│     ▼                                             │
│   Spring Boot                                     │
│     ・API の提供                                   │
│     ・入力値の検証                                  │
│     ・業務ロジック（position の再採番など）           │
│     │                                             │
│     │  TCP  localhost:5432                        │
│     ▼                                             │
│   PostgreSQL（Windows サービスとして常駐）           │
│     │                                             │
│     ▼                                             │
│   データディレクトリ（PostgreSQL の data フォルダ）    │
│                                                   │
└───────────────────────────────────────────────────┘
              ※ 外部からのアクセスは受け付けない（P-2）
```

**ブラウザから PostgreSQL へ直接接続することはできない。** ブラウザは生の TCP 接続を張れず、また DB の接続情報をブラウザ側のコードに置くことになるため。DB を採用したことで、両者の間にバックエンドサーバーが必須となった。

**利用者が開くのは `localhost:3000` だけでよい。** Vite 開発サーバーが `/api` へのリクエストだけを 8080 番へ転送するため、ブラウザから見た通信先は1つに見える。この構成により CORS の設定も不要になる。

利用のたびに**起動が必要なサーバーは2つ**（Spring Boot と Vite）。**PostgreSQL は Windows サービスとして自動起動する**ため、起動操作は不要（前提条件 P-4）。

---

## 2. 初回セットアップ

**PC を新しくした場合や、リポジトリを clone した直後に一度だけ行う。** 日常の起動手順は3章。

### 2.1 JDK 25 のインストール

[Eclipse Temurin](https://adoptium.net/) から **JDK 25（LTS）** の Windows x64 インストーラを入手して実行する。インストーラのオプションで「Set JAVA_HOME variable」と「Add to PATH」を有効にする。

```powershell
java -version    # openjdk version "25..." と表示されれば成功
```

### 2.2 Node.js のインストール

[Node.js](https://nodejs.org/) の **22 以上（LTS）** を入れる。

```powershell
node -v
npm -v
```

### 2.3 PostgreSQL 17 のインストール

[PostgreSQL 公式](https://www.postgresql.org/download/windows/) の Windows インストーラを実行する。

| 設定項目 | 値 |
| --- | --- |
| インストールするコンポーネント | PostgreSQL Server、**Command Line Tools**（`psql` と `pg_dump` が入る）。pgAdmin と Stack Builder は任意 |
| ポート | `5432`（既定のまま） |
| ロケール | 既定のまま |
| `postgres` ユーザーのパスワード | 任意。**忘れないこと**（後で接続設定に使う） |

インストール後、Windows サービスとして自動起動する。

```powershell
Get-Service postgresql*    # Status が Running であること
```

> **Docker は使わない。** 理由は [要件定義書](requirements.md) の「Docker を使わない判断」を参照。

### 2.4 データベースとロールの作成

```powershell
# psql の場所は環境に合わせて読み替える
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres
```

```sql
CREATE ROLE taskmanagement WITH LOGIN PASSWORD '<任意のパスワード>';
CREATE DATABASE taskmanagement OWNER taskmanagement;
CREATE DATABASE taskmanagement_test OWNER taskmanagement;
\q
```

`taskmanagement_test` は自動テスト用。本番用のデータと混ざらないよう分けておく。

### 2.5 接続情報の設定

**接続情報はリポジトリにコミットしない**（[要件定義書](requirements.md) の「機密情報の管理」）。環境変数で渡す。

```powershell
# PowerShell のプロファイルなどに書いておく
$env:DB_URL      = "jdbc:postgresql://localhost:5432/taskmanagement"
$env:DB_USERNAME = "taskmanagement"
$env:DB_PASSWORD = "<2.4 で設定したパスワード>"
```

`backend/src/main/resources/application.properties` 側はこの環境変数を参照する形にする。

### 2.6 依存パッケージの取得とマイグレーション

```powershell
cd backend
.\gradlew build          # 依存の取得とビルド（Gradle 本体のインストールは不要）

cd ..\frontend
npm ci                   # package-lock.json どおりに取得する
```

**マイグレーション（Flyway）は Spring Boot の起動時に自動で適用される**ため、個別の実行は不要。空の DB に対して起動すれば、テーブルの作成とデフォルト3列の投入まで済む（[データベース設計](design/database.md) の「スキーマの管理」）。

---

## 3. 起動手順

**利用のたびに毎回行う**（前提条件 P-4）。ターミナルを2つ開く。

| # | 操作 | コマンド |
| --- | --- | --- |
| 1 | PostgreSQL の確認（通常は不要） | `Get-Service postgresql*` |
| 2 | バックエンドを起動 | `cd backend; .\gradlew bootRun` |
| 3 | フロントエンドを起動（別ターミナル） | `cd frontend; npm run dev` |
| 4 | ブラウザで開く | `localhost:3000` |

停止はそれぞれのターミナルで `Ctrl + C`。

**起動を忘れた場合の画面**は [機能仕様書](functional-spec.md) の「通信エラー」を参照。エラーメッセージが、起動していないのがバックエンドなのか DB なのかを示す。

| 症状 | 原因 |
| --- | --- |
| 全面に「サーバーが起動していません」 | 手順2（バックエンド）を実行していない |
| 「データベースに接続できません」 | PostgreSQL のサービスが停止している、または接続情報が誤っている |
| ブラウザが `localhost:3000` に接続できない | 手順3（フロントエンド）を実行していない |

---

## 4. データのバックアップ

**自動バックアップ機能は実装しない**（F-20）。データが失われて困る場合は、以下の手順で手動退避する。

### 4.1 退避

```powershell
pg_dump -h localhost -U taskmanagement -d taskmanagement -F c -f backup_YYYYMMDD.dump
```

### 4.2 復元

```powershell
pg_restore -h localhost -U taskmanagement -d taskmanagement --clean backup_YYYYMMDD.dump
```

### 4.3 注意

> **PostgreSQL をアンインストールすると、データディレクトリごと削除される場合がある。** 再インストールや版の入れ替えを行う前に、必ず 4.1 の手順で退避すること。
>
> 同様に、`DROP DATABASE taskmanagement` を実行すると復旧できない。**検証用の操作は `taskmanagement_test` に対して行う。**

### 4.4 想定されるデータ消失

| 原因 | 対策 |
| --- | --- |
| PC の故障 | 上記の手動退避のみ |
| DB の誤操作 | 同上。Undo 機能はない |
| **PostgreSQL のアンインストール／再インストール** | 4.3 の注意を守る |
