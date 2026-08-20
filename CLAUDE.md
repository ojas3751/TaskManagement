# このリポジトリでの作業ルール

Claude Code はこのファイルのルールに従うこと。**例外はない。**

このプロジェクトは 1 人で開発しているが、それでも Issue とブランチと PR を必ず経由する。理由は「あとから自分が理由を追えるようにするため」であり、他人のレビューを受けるためではない。

---

## 作業の進め方（必須の手順）

作業を始める前に、必ず次の順で進める。

**1. Issue を作る**

作業対象の Issue が既にあればそれを使う。無ければ先に作る。

```powershell
gh issue create --title "<何をするか>" --label <種類ラベル> --label <領域ラベル>
```

対応する開発ステップがあれば `--milestone "Step 8"` を付ける（ステップの一覧は [開発計画](docs/development-plan.md)）。

**2. main から作業ブランチを切る**

```powershell
git checkout main
git pull
git checkout -b <type>/<Issue番号>-<短い説明>
```

**main 上で作業を始めてはならない。**

**3. コミットする**

Conventional Commits の型 + 日本語の本文。既存の履歴に合わせる。

```
feat: Step 1 DB構築（Flyway でスキーマと seed）
docs: 技術スタックを確定し、要件定義書を1.0にする
```

**4. push して PR を作る**

```powershell
git push -u origin <ブランチ名>
gh pr create --fill
```

PR の本文には **必ず `Closes #<Issue番号>`** を書く。これでマージ時に Issue が自動で閉じる。

**5. マージはユーザーが行う**

Claude は PR を作るところまで。**マージボタンを押すのはユーザー。**

---

## ブランチ命名規則

```
<type>/<Issue番号>-<英小文字ケバブケースの短い説明>
```

`type` はコミットの型と同じ語彙を使う。

| type | 用途 |
| --- | --- |
| `feat` | 機能追加 |
| `fix` | 不具合修正 |
| `docs` | ドキュメント |
| `chore` | 設定・雑務 |
| `refactor` | 挙動を変えない内部改善 |
| `test` | テストの追加・修正 |

例:

```
feat/12-columns-from-db
fix/18-duedate-color-contrast
docs/15-update-operations
```

---

## 起動ポート

**ポートは固定。空いていなければ、逃げずに占有側を止める。**

| サーバー | ポート | 指定場所 |
| --- | --- | --- |
| フロントエンド（Vite） | **3000** | `frontend/vite.config.ts`（`strictPort: true`） |
| バックエンド（Spring Boot） | **8080** | `backend/src/main/resources/application.properties` |
| データベース（PostgreSQL） | **5432** | `compose.yaml` |

**別のポートで一時的に起動してはならない。** Vite の proxy 先は `localhost:8080` を直接指しており、ブラウザの入り口は `localhost:3000` の1つだけと決めている（[README](README.md) の「構成」）。片方をずらすと、起動しても画面が動かない。「とりあえず 8081 で立てて動作確認する」は**確認になっていない。**

ポートが埋まっていたら、次のスクリプトで占有プロセスを止めてから、規定のポートで起動する。

```powershell
pwsh -File scripts/free-port.ps1 8080      # バックエンド
pwsh -File scripts/free-port.ps1 3000      # フロントエンド
pwsh -File scripts/free-port.ps1 3000 8080 # まとめて
```

対象は 3000 と 8080 のみ。**5432 は対象外**で、DB を止めるときは `docker compose down` を使う（プロセスを直接止めるとコンテナの状態と食い違うため）。

止める前に、スクリプトが出す PID とプロセス名を見ること。**自分で起動した開発サーバーだと確認できない場合は、止めずにユーザーへ確認する。**

これらは `.claude/hooks/guard-ports.ps1` によってツール実行の時点で強制される。`--port` や `-Dserver.port=` を付けた起動、およびポートが埋まったままの起動はブロックされる。

---

## 禁止事項

- **main への直接コミット・直接 push。** GitHub 側の ruleset でも拒否される。
- **force push**（`git push --force` / `-f` / `--force-with-lease`）。ブランチを問わず禁止。
- **Claude が PR をマージすること**（`gh pr merge`）。
- **Issue を作らずに作業を始めること。**
- **開発サーバーを規定以外のポートで起動すること**（上の「起動ポート」）。

これらは `.claude/hooks/` 配下のフック（`guard-git.ps1` / `guard-ports.ps1`）によってツール実行の時点でブロックされる。ブロックされたら、抜け道を探すのではなく手順に戻ること。

---

## ラベル

Issue と PR には **種類を1つ**、**領域を1つ以上**付ける。

| 種類 | `feat` `fix` `docs` `chore` `refactor` |
| --- | --- |
| **領域** | `backend` `frontend` `db` `infra` |

---

## 参照

- [README](README.md) — プロジェクトの概要と起動方法
- [ドキュメント一覧](docs/README.md)
- [開発計画](docs/development-plan.md) — Step 0〜11。マイルストーンと対応している
