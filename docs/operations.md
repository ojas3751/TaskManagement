# 運用手順 v1.3

**関連文書**: [要件定義書](requirements.md) ／ [データベース設計](design/database.md) ／ [開発計画](development-plan.md) ／ [文書一覧](README.md)

---

## 改訂履歴

| 版 | 日付 | 変更内容 |
| --- | --- | --- |
| 0.1 | 2026-08-13 | 要件定義書 v0.7 から分割して初版作成。システム構成とバックアップ手順のみ記載。**起動手順は未記載** |
| **1.0** | **2026-08-16** | 要件定義書 v1.0（技術スタック確定）を反映し、**保留していた起動手順を記載して本書を完成させた。** **Docker を使わない方針に変更**したため、システム構成図・バックアップの注意事項を全面的に書き換え。「初回セットアップ」の章を新設 |
| **1.1** | **2026-08-17** | 要件定義書 v1.1 を反映し、**DB を Docker で動かす手順に全面的に書き換えた。** 2章の初回セットアップから PostgreSQL の直接インストール・ロール作成の手作業を削除し、`compose.yaml` と `.env` の説明に置き換え。3章の起動手順に `docker compose up -d` を追加。4章のバックアップを `docker compose exec` 経由に変更し、**ボリューム削除の警告を復活**。**本書の手順は実際に実行して確認済み** |
| **1.2** | **2026-08-20** | **「3.5 開発用テストデータの投入」を新設。** `scripts/dev-seed.sql` の使い方と、これを Flyway の管理外に置いている理由を記載した。既存の章に変更なし |
| **1.3** | **2026-09-02** | **「3.2 品質チェック」を新設**（#103）。`npm run lint` / `npm run test` / `npm run build` / `.\gradlew check` の叩き方と、PR で GitHub Actions が同じことを走らせることを記載。**`npm run dev` が型を見ないこと**を注意点として明記した。既存の章に変更なし |

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
│   ┌─ Docker Desktop ─────────────────────────┐   │
│   │                                           │   │
│   │   PostgreSQL 17（コンテナ）                 │   │
│   │     │                                     │   │
│   │     ▼                                     │   │
│   │   ボリューム pgdata（データの保存先）         │   │
│   │                                           │   │
│   └───────────────────────────────────────────┘   │
│                                                   │
└───────────────────────────────────────────────────┘
              ※ 外部からのアクセスは受け付けない（P-2）
```

**ブラウザから PostgreSQL へ直接接続することはできない。** ブラウザは生の TCP 接続を張れず、また DB の接続情報をブラウザ側のコードに置くことになるため。DB を採用したことで、両者の間にバックエンドサーバーが必須となった。

**利用者が開くのは `localhost:3000` だけでよい。** Vite 開発サーバーが `/api` へのリクエストだけを 8080 番へ転送するため、ブラウザから見た通信先は1つに見える。この構成により CORS の設定も不要になる。

利用のたびに**起動が必要なものは3つ**（PostgreSQL のコンテナ、Spring Boot、Vite）。前提条件 P-4 にあたる。

**PostgreSQL はコンテナの中だけに存在し、ホストの Windows にはインストールしない。** ホストから見えるのは `localhost:5432` というポートだけで、`psql` などのコマンドもコンテナの中のものを使う。

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

### 2.3 Docker Desktop のインストール

[Docker Desktop](https://www.docker.com/products/docker-desktop/) の Windows 版を入れる。**PostgreSQL 自体はインストールしない** — コンテナとして動かす（[要件定義書](requirements.md) の「PostgreSQL を Docker で動かす判断」）。

インストール後、Docker Desktop を起動してエンジンが動いていることを確認する。

```powershell
docker version           # Client と Server の両方が表示されれば成功
docker compose version
```

> `docker` が「認識されません」と出る場合、インストール直後で PATH が反映されていないことが多い。**PowerShell を開き直す**（それでも駄目なら PC を再起動する）。

### 2.4 DB のパスワードを決める

リポジトリのルートで、`.env.example` をコピーして `.env` を作り、パスワードを書く。

```powershell
Copy-Item .env.example .env
```

```
DB_PASSWORD=<任意のパスワード>
```

**`.env` はコミットされない**（`.gitignore` で除外済み。[要件定義書](requirements.md) の「機密情報の管理」）。`docker compose` は同じディレクトリの `.env` を自動で読む。

> **ロールとデータベースの作成は不要。** `compose.yaml` の `environment` に書いてあるため、コンテナの初回起動時に自動で作られる。

### 2.5 バックエンドへ接続情報を渡す

**Spring Boot は `.env` を読まない。** 同じ値を Windows のユーザー環境変数として設定する。一度設定すれば以降どのターミナルでも有効になる。

```powershell
[Environment]::SetEnvironmentVariable("DB_URL","jdbc:postgresql://localhost:5432/taskmanagement","User")
[Environment]::SetEnvironmentVariable("DB_USERNAME","taskmanagement","User")
[Environment]::SetEnvironmentVariable("DB_PASSWORD","<2.4 と同じパスワード>","User")
```

設定後、**PowerShell を開き直す**（既に開いているターミナルには反映されない）。

> **パスワードを2箇所に書くことになる**（`.env` と環境変数）。**片方だけ変えると接続できなくなる**ため、変更するときは必ず両方を直すこと。よくある詰まりどころで、症状は「DB は起動しているのにバックエンドが認証エラーで落ちる」。
>
> なお `.env` 側を変えても、**既に作られたボリュームのパスワードは変わらない**。作り直す場合は 4.3 を参照。

### 2.6 依存パッケージの取得

```powershell
cd backend
.\gradlew build -x test   # 依存の取得とビルド（Gradle 本体のインストールは不要）

cd ..\frontend
npm ci                    # package-lock.json どおりに取得する
```

**マイグレーション（Flyway）は Spring Boot の起動時に自動で適用される**ため、個別の実行は不要（[データベース設計](design/database.md) の「スキーマの管理」）。

---

## 3. 起動手順

**利用のたびに毎回行う**（前提条件 P-4）。ターミナルを2つ開く。

| # | 操作 | コマンド |
| --- | --- | --- |
| 1 | Docker Desktop を起動する | （タスクトレイに常駐していれば不要） |
| 2 | DB のコンテナを起動 | `docker compose up -d` |
| 3 | バックエンドを起動 | `cd backend; .\gradlew bootRun` |
| 4 | フロントエンドを起動（別ターミナル） | `cd frontend; npm run dev` |
| 5 | ブラウザで開く | `localhost:3000` |

DB が受付可能になったかは次で確認できる。

```powershell
docker compose ps         # STATUS が Up ... (healthy) になっていること
```

### 停止

| 対象 | 操作 |
| --- | --- |
| バックエンド／フロントエンド | それぞれのターミナルで `Ctrl + C` |
| DB のコンテナ | `docker compose down` |

> **`docker compose down` に `-v` を付けないこと。** データが消える。詳細は 4.3。

---

## 3.2 品質チェック

**PR を出す前に手元で通しておく。** PR を作れば GitHub Actions が同じことを走らせる（`.github/workflows/ci.yml`）ので、赤くなってから直すこともできるが、手元のほうが速い。

```powershell
cd frontend
npm run lint     # oxlint。警告は出るが、終了コードは 0
npm run test     # vitest
npm run build    # tsc -b + vite build。型エラーはここで落ちる

cd ..\backend
.\gradlew check  # Spotless の整形検査 + Checkstyle + テスト
```

| 押さえておくこと | 内容 |
| --- | --- |
| **`npm run dev` は型を見ない** | Vite は型チェックを省く。型の誤りは `npm run build` でしか出ない。実際、この検査を入れるまでビルドが失敗する状態に気づけていなかった（#103） |
| **lint の警告は残してある** | 導入時点で 83 件。実装の修正は別 Issue に回した。設定の意図は `frontend/.oxlintrc.json` のコメント。**新しく書くコードで増やさないこと** |
| **整形は自動で当てられる** | `.\gradlew check` が整形の違反で落ちたら `.\gradlew spotlessApply` |
| **バックエンドのテストには Docker が要る** | Testcontainers が使い捨ての PostgreSQL を立てる。`docker compose` で使っている開発用 DB とは別のコンテナで、そちらのデータには触らない |

レビューの観点は `.claude/skills/quality-review/SKILL.md` にまとめてある。

**起動を忘れた場合の画面**は [機能仕様書](functional-spec.md) の「通信エラー」を参照。エラーメッセージが、起動していないのがバックエンドなのか DB なのかを示す。

| 症状 | 原因 |
| --- | --- |
| 全面に「サーバーが起動していません」 | 手順3（バックエンド）を実行していない |
| 「データベースに接続できません」 | 手順1〜2（Docker Desktop とコンテナ）を実行していない |
| ブラウザが `localhost:3000` に接続できない | 手順4（フロントエンド）を実行していない |
| バックエンドが起動途中で認証エラーになる | `.env` と環境変数のパスワードが食い違っている（2.5 の注意） |

---

## 3.5 開発用テストデータの投入

**空のボードでは API や画面の確認ができない**ため、動作確認用のタスクを投入するスクリプトを用意している。

```powershell
Get-Content scripts/dev-seed.sql | docker compose exec -T db psql -U taskmanagement -d taskmanagement
```

> **PowerShell には `<` によるリダイレクトが無い。** `psql < file.sql` と書くとエラーになるため、`Get-Content` の出力をパイプで渡す。

| 項目 | 内容 |
| --- | --- |
| 投入されるもの | タスク6件（TODO 3件・進行中 1件・完了 2件）。ボードとリストは Flyway の seed のものをそのまま使う |
| 何度でも実行できる | 先頭で既存のタスクを全件削除してから入れ直すため、実行するたびに同じ状態になる |
| 実データは消える | **自分のタスクを入れ始めたあとに実行すると消える。** バックアップは 4章 |

**このスクリプトは Flyway の管理外に置いている**（`backend/src/main/resources/db/migration/` ではなく `scripts/` に置いている）。マイグレーションに含めると一度適用したあと編集できず、今後空の DB を作るたびにテストデータが混ざるため。マイグレーションに含める seed は「仕様上必ず存在する前提のもの」だけとする（[データベース設計](design/database.md) の「スキーマの管理」）。

投入内容は表示ルールを一通り踏むように選んである（期限なし／日付のみ／日時指定、説明文の改行、タスクが0件でない完了列）。

---

## 4. データのバックアップ

**自動バックアップ機能は実装しない**（F-20）。データが失われて困る場合は、以下の手順で手動退避する。

**`pg_dump` などのコマンドはホストに入っていない。** コンテナの中のものを `docker compose exec` で呼び出す。

### 4.1 退避

```powershell
docker compose exec -T db pg_dump -U taskmanagement -d taskmanagement -F c > backup_20260817.dump
```

`-T` は擬似 TTY を無効にする指定。**付けないとダンプファイルが壊れる**（改行コードが変換されるため）。

### 4.2 復元

```powershell
Get-Content backup_20260817.dump -AsByteStream -Raw | docker compose exec -T db pg_restore -U taskmanagement -d taskmanagement --clean
```

### 4.3 注意

> **`docker compose down -v` を実行するとボリューム `pgdata` が削除され、DB のデータは完全に失われる。** コンテナだけを止めたい場合は `-v` を付けずに `docker compose down` を実行すること。
>
> 同様に `docker volume prune` も未使用ボリュームを削除するため、実行前に対象を確認すること。
>
> `DROP DATABASE taskmanagement` を実行した場合も復旧できない。

### 4.4 コンテナを作り直す

DB のパスワードを変えたい場合など、**初回起動時にしか実行されない設定をやり直したいとき**は、ボリュームごと作り直す必要がある。

```powershell
# 必要なら 4.1 で退避してから
docker compose down -v      # ボリュームごと削除（データが消える）
docker compose up -d        # .env の値で作り直される
```

### 4.5 想定されるデータ消失

| 原因 | 対策 |
| --- | --- |
| PC の故障 | 上記の手動退避のみ |
| DB の誤操作 | 同上。Undo 機能はない |
| **`docker compose down -v` / `docker volume prune`** | 4.3 の注意を守る |
