# 運用手順 v1.6

**関連文書**: [要件定義書](requirements.md) ／ [データベース設計](design/database.md) ／ [インフラ構成書](infrastructure.md) ／ [セキュリティ設計](security.md) ／ [開発計画](development-plan.md) ／ [文書一覧](README.md)

---

## 改訂履歴

| 版 | 日付 | 変更内容 |
| --- | --- | --- |
| 0.1 | 2026-08-13 | 要件定義書 v0.7 から分割して初版作成。システム構成とバックアップ手順のみ記載。**起動手順は未記載** |
| **1.0** | **2026-08-16** | 要件定義書 v1.0（技術スタック確定）を反映し、**保留していた起動手順を記載して本書を完成させた。** **Docker を使わない方針に変更**したため、システム構成図・バックアップの注意事項を全面的に書き換え。「初回セットアップ」の章を新設 |
| **1.1** | **2026-08-17** | 要件定義書 v1.1 を反映し、**DB を Docker で動かす手順に全面的に書き換えた。** 2章の初回セットアップから PostgreSQL の直接インストール・ロール作成の手作業を削除し、`compose.yaml` と `.env` の説明に置き換え。3章の起動手順に `docker compose up -d` を追加。4章のバックアップを `docker compose exec` 経由に変更し、**ボリューム削除の警告を復活**。**本書の手順は実際に実行して確認済み** |
| **1.2** | **2026-08-20** | **「3.5 開発用テストデータの投入」を新設。** `scripts/dev-seed.sql` の使い方と、これを Flyway の管理外に置いている理由を記載した。既存の章に変更なし |
| **1.4** | **2026-09-04** | **「3.2 品質チェック」に「依存の脆弱性通知（Dependabot）」を足した**（#110）。**Dependabot alerts と security updates を有効にした** — 使っている版に脆弱性が公表されたことは、自分では気づけないため。**バージョン更新（`.github/dependabot.yml`）は見送った**ことと、その理由も書いた。**見送る一番の理由は PR の本数ではなく、中身を見ずに緑だからマージするようになること。** 設定は GitHub の画面上にしか残らないので、記録が無いと後から理由を追えない。既存の章に変更なし |
| **1.3** | **2026-09-02** | **「3.2 品質チェック」を新設**（#103）。`npm run lint` / `npm run test` / `npm run build` / `.\gradlew check` の叩き方と、PR で GitHub Actions が同じことを走らせることを記載。**`npm run dev` が型を見ないこと**を注意点として明記した。既存の章に変更なし |
| **1.6** | **2026-10-14** | **「2.8 AWS を扱うための道具」と「5. AWS での作業」を新設**（#137）。Git 管理対象外だったデプロイガイド（`docs/deployment/`）から、PC 側の準備と日々の作業の流れを移した。**1章のシステム構成に、AWS 上の構成への入口を足した。** 構成の設計と権限の設計は、本書ではなく [インフラ構成書](infrastructure.md) と [セキュリティ設計](security.md) に置いた — 本書の役割は「どう操作するか」であり、「なぜその構成か」とは読む場面が違うため |
| **1.5** | **2026-10-06** | **「2.7 コミット前の秘密情報の検査を有効にする」を新設**（#122）。gitleaks の導入と `git config core.hooksPath .githooks` の2行。**フックを `.git/hooks` ではなくリポジトリ内の `.githooks/` に置いた**のは、`.git/hooks` は GitHub に上がらず、別の PC で何を入れたか分からなくなるため。AWS へのデプロイに入る前に、キーが PUBLIC リポジトリに載る経路を塞ぐ目的。既存の章に変更なし |

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

> **AWS 上にも、同じアプリを動かせる構成がある。** 画面と API を EC2 1台に載せ、DB は RDS に置く形で、**作業の始めに作り、終わりに消す**運用をしている。構成図と設計の理由は [インフラ構成書](infrastructure.md)、操作の手順は本書の「5. AWS での作業」。
>
> **ふだんの開発と動作確認は、上のローカル構成で行う。** AWS は料金と待ち時間がかかるため。

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

### 2.7 コミット前の秘密情報の検査を有効にする

このリポジトリは PUBLIC なので、**push した時点で中身が公開される。** AWS のキーなどが混ざったコミットを、コミットの手前で止めるために、[gitleaks](https://github.com/gitleaks/gitleaks) を Git の pre-commit フックとして使う。

```powershell
winget install --id Gitleaks.Gitleaks     # 入れたらターミナルを開き直す（PATH の反映）
git config core.hooksPath .githooks       # このリポジトリのフック置き場を Git に教える（PC ごとに1回）
```

- フックの中身は `.githooks/pre-commit`、検査ルールは `.gitleaks.toml`（gitleaks の標準ルール＋ AWS 公式の例示値の許可）
- **`core.hooksPath` は PC ごとの設定でリポジトリには入らない。** 別の PC で作業するときは、上の2行をもう一度打つ
- gitleaks が入っていない状態でフックが有効だと、**コミットは止まる**（検査をすり抜けさせないため）
- Claude Code のコミットは、これに加えて `.claude/hooks/guard-secrets.ps1` も検査する

### 2.8 AWS を扱うための道具

**AWS 上での作業（5章）をする場合のみ必要。** ローカルでの開発だけなら不要。

Windows の場合、いずれも `winget` で入れられる。

| 道具 | 何に使うか | 入れ方 | 確認した版 |
| --- | --- | --- | --- |
| **AWS CLI** | コマンドで AWS を操作する | `winget install --id Amazon.AWSCLI` | 2.37.4 |
| **Terraform** | 設定ファイルからサーバーを作る | `winget install --id Hashicorp.Terraform` | 1.16.2 |
| **Session Manager プラグイン** | サーバーの中に入る | `winget install --id Amazon.SessionManagerPlugin`（**管理者権限の PowerShell で**） | 1.2.835.0 |
| **VS Code の Terraform 拡張** | `.tf` の色分けと入力補完 | `code --install-extension hashicorp.terraform` | 2.40.0 |

Session Manager プラグインだけは、入れるときに Windows の管理者の許可（UAC）を求められる。PowerShell を「管理者として実行」で開いてから入れる。

**入れた後は、ターミナルを開き直してから**（PATH の反映）、次の3つが版を表示すれば成功。

```powershell
aws --version
terraform version
session-manager-plugin --version
```

次に、鍵を登録する。**この2行は人が自分で打つ**（鍵を AI との会話に出さないため）。

```powershell
aws configure --profile taskmgmt
terraform -chdir=infra init
terraform -chdir=infra/persistent init
```

読み取り専用プロファイル `taskmgmt-readonly` の設定、2つのプロファイルの使い分け、鍵の扱いは [セキュリティ設計](security.md) の「5. 鍵の運用」。

> **`aws configure` の最後に出る質問について。** AWS CLI 2.37 では「AWS skills と AWS MCP server を AI エージェント用に設定しますか」と聞かれる。**No と答えること。** 理由は [セキュリティ設計](security.md) の 4.4。

最後に、自分の IP を書いた設定ファイルを作る（詳細は [infra/README.md](../infra/README.md)）。

```powershell
Copy-Item infra/terraform.tfvars.example infra/terraform.tfvars
# 開いて my_ip_cidr を「自分の IP/32」に書き換える
```

> **つまずいた点。** `winget` で入れた道具の PATH は、**新しく開いたターミナルから**しか読み込まれない。VS Code / Cursor を開いたままだと反映されないので、**開き直すこと。**

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

### 依存の脆弱性通知（Dependabot）

**上の検査は、自分が書いたコードしか見ない。** 使っているライブラリに脆弱性が公表されたことは、**公表を追っていないと分からない。** そこだけを GitHub 側の設定で受け取るようにしてある（#110）。

**設定はリポジトリの画面上にしか残らない**ので、何を有効にしたかをここに書いておく。

| 設定 | 状態 | 何が起きるか |
| --- | --- | --- |
| **Dependabot alerts** | **有効** | いま使っている版に脆弱性が公表されたら通知が来る。**平時は何も来ない** |
| **Dependabot security updates** | **有効** | アラートが出たときだけ、**その脆弱性を塞ぐ最小の更新 PR** が自動で立つ |
| **Dependabot version updates**（`.github/dependabot.yml`） | **無効**（ファイルを置いていない） | 新しい版が出るたびに更新 PR が立つ。**下記の理由で見送っている** |

```powershell
gh api repos/:owner/:repo/vulnerability-alerts -i     # 204 なら有効（無効だと 404）
gh api repos/:owner/:repo/automated-security-fixes    # enabled: true
```

**バージョン更新を見送っている理由。** React 19.2 / Vite 8 / Spring Boot 4.1 / TypeScript 6 と、どれも動きの速い版を使っているため、有効にすると PR が定期的に立つ。1人開発で本番も締切も無い現状では、得られるものに対して煩わしさが勝つ。

**ただし、一番の理由は PR の本数ではない。** 更新 PR が毎週来る状態に慣れると、**中身を見ずに緑だからマージする**ようになる。それは [CLAUDE.md](../CLAUDE.md) が掲げる「あとから自分が理由を追えるようにする」と食い違う。

**必要になるのは、しばらく触らない期間ができて版が離れたとき。** そのとき `.github/dependabot.yml` を足せばよい（メジャーを除外し、月1でまとめる形が妥当）。

> **CI が入っている（#103）ことが前提。** CI が無い状態でセキュリティ更新を有効にしても、届いた PR が壊れていないかを毎回手で確かめることになり、ただの面倒事だった。いまは PR が立った瞬間に上の検査が全部走るので、**「緑なら安全に上げられる」が機械的に分かる。**

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

---

## 5. AWS での作業

AWS 上でアプリを動かすときの手順。**準備は 2.8**、構成と費用は [インフラ構成書](infrastructure.md)、権限の設計は [セキュリティ設計](security.md)。

> ⚠️ **AWS 上にサーバーがある間は、1時間あたり約 $0.05 の料金が積み上がる。** 作業の終わりには必ず `stop.ps1` まで実行すること。

### 5.1 ふだんの確認はローカルで

**アプリの修正や機能追加の確認は、これまでどおり `localhost:3000` で行う。** AWS の料金も、サーバーを作る待ち時間もかからない。

AWS で確かめるのは次のときだけ。

| どんなとき | 理由 |
| --- | --- |
| Terraform の設定を変えたとき | AWS の上でしか確かめられない |
| ローカルと AWS で動きが変わりうる変更（環境変数、ポート、HTTP か HTTPS かなど） | PC では問題が出ないことがある |
| まとまった修正の最終確認 | 実際の置き場所で動くか確かめる |

> **実例。** `crypto.randomUUID()` が安全な接続でしか使えないことに、PC の開発（`http://localhost`）では気づけなかった（[インフラ構成書](infrastructure.md) 8.1）。

### 5.2 インフラの変更とアプリの更新を分ける

| 変えたもの | やること | サーバーを作り直すか |
| --- | --- | --- |
| **インフラ**（`.tf`） | `terraform plan` で中身を確かめてから `terraform apply` | 変更によっては作り直す |
| **アプリ**（ソースコード） | `pwsh scripts/aws/deploy.ps1`（PC でビルド → S3 に置く → EC2 で入れ替え） | **作り直さない** |

アプリを直しただけなら、サーバーはそのままで中のアプリだけを入れ替える。**DB のデータもそのまま残る。**

### 5.3 1回の作業の流れ

```
【始め】pwsh scripts/aws/start.ps1
  ① terraform apply（サーバーと DB を作る）
  ② サーバーの準備を待つ
  ③ データを復元（S3 → DB。DB が空のときだけ）
  ④ アプリを起動（S3 にある最新のアプリ。無ければ PC でビルドして置く）

  ⑤ 修正と確認をくり返す（アプリを直したら pwsh scripts/aws/deploy.ps1）

【終わり】pwsh scripts/aws/stop.ps1
  ⑥ API を止めて、データを退避（DB → S3）
  ⑦ ⑥ がすべて成功したときだけ terraform destroy

  ⑧ 消え残りが無いか確かめる
```

**人が打つコマンドは `start.ps1` と `stop.ps1` の2回だけ。** 中で apply / destroy の一覧が出るので、**読んでから** `yes` と入力する。**一覧に意図しない「destroy」や「replace（作り直し）」が出ていたら、いったん止めて中身を確かめる。**

サーバーへの命令（`pg_dump` など）はスクリプトが PC から送るので、サーバーに入って打つ必要はない。

| 順番 | 守ること |
| --- | --- |
| ③→④ | **復元はアプリの起動より前に。** 先に起動すると Flyway が初期データを入れてしまい、DB が空でなくなるので復元できなくなる |
| ⑥ | **退避の前に API を止める。** 止めずに退避すると、退避した後にブラウザから書き込んだ分が destroy で消える |
| ⑥→⑦ | **退避が成功したときだけ destroy に進む。** `stop.ps1` がこの順番を守る |
| ⑧ | 全リージョンで、EC2 やディスクが残っていないかを確かめる |

> ⚠️ **`terraform destroy` を直接打たないこと。** 退避されずにデータが消える。

> **`start.ps1` だけでは、直したアプリは入らない。** `start.ps1` は S3 にアプリが無いときだけビルドする。**コードを直した後は、先に `deploy.ps1` を打つ**（サーバーが無ければ S3 に置くところで止まり、料金はかからない）。

所要時間の目安：RDS の作成に約 5 分半、削除に約 2 分。API の起動は約 12 秒。退避・復元はデータが少ないうちは数秒。

### 5.4 動作確認

`start.ps1` が終わると画面の住所（`web_url`）が表示される（後からは `terraform -chdir=infra output` で見られる）。

1. **アプリが開けるか**：`web_url` をブラウザで開く
2. **自分の IP 以外からは開けないか**：スマートフォンの Wi-Fi を切り、モバイル回線で同じ住所を開く。**開けなければ成功**
3. **サーバーに入るか**（必要なとき）：表示された `session_manager_command` を実行する。`free -h` でメモリ、`df -h` でディスク、`journalctl -u taskmgmt-api` で API のログ。`exit` で出る

### 5.5 destroy した後の作り直し

destroy するとサーバーもディスクも消える。次に使うときは、3つをそれぞれの「正本」から戻す。

| 何が | 正本 | 戻し方 |
| --- | --- | --- |
| インフラ | `infra/` の `.tf`（リポジトリ） | `terraform apply` で毎回まっさらに作る |
| アプリ | S3 の `artifacts/`（元のソースは GitHub） | `start.ps1` が取り出して起動する |
| **データ** | **S3 のバックアップ** | `start.ps1` が復元する |

**毎回作り直せるのは、消えて困るものが 1 つしか無いから。** インフラはコードが、アプリは GitHub のソースコードが正本なので、いつでも同じものを作れる。**データだけは正本が AWS の中にしか無いので、S3 に退避する。**

### 5.6 休憩・作業終了のとき

AWS にサーバーがある状態で、人が「休憩する」「今日は終わり」と言ったとき、作業がひと区切りついたとき、AI の返事が人の返事待ちで終わるときは、**AI が「destroy しますか」と確認する約束**にしている。

| 状態 | AI が伝えること |
| --- | --- |
| 料金が積み上がるもの（EC2・RDS など）がある | 何が残っていて 1 時間あたりいくらかかるかを添えて、destroy するかを確認する。**あとで自分で消す場合のコマンドも示す** |
| 何も作っていない | 「時間で料金が積み上がるものはありません」と伝える |

**作業終了の手順**

1. 作業中の変更をコミットして push する
2. **`pwsh scripts/aws/stop.ps1` を実行する**（人が打つ）
3. 消え残りが無いか確かめる
4. 請求画面で、その日の料金に変なところが無いか見る（任意。数字が出るのは翌日以降のことが多い）

言い忘れて PC を閉じた場合は、AWS の中の安全装置が受け止める（[インフラ構成書](infrastructure.md) 6.4）。ただし **EC2 が止まるだけで、消えるわけではない。** 気づいたら必ず destroy まで行う。

### 5.7 destroy し忘れたとき

1. 夜間の停止か、1時間何もしないときの停止で、**EC2 は止まる**
2. 止まった後も、**ディスク（EBS）の料金はかかり続ける**
3. 放っておくと料金が積み上がり、予算の通知メールが届く

気づいたら、サーバーを起動してバックアップを取り、`stop.ps1` で destroy する。
