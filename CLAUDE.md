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

## 禁止事項

- **main への直接コミット・直接 push。** GitHub 側の ruleset でも拒否される。
- **force push**（`git push --force` / `-f` / `--force-with-lease`）。ブランチを問わず禁止。
- **Claude が PR をマージすること**（`gh pr merge`）。
- **Issue を作らずに作業を始めること。**

これらは `.claude/hooks/guard-git.ps1` によってツール実行の時点でブロックされる。ブロックされたら、抜け道を探すのではなく手順に戻ること。

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
