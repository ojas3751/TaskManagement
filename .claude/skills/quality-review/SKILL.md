---
name: quality-review
description: このリポジトリの品質チェック。フロントエンド（React 19 + TypeScript + Vite）とバックエンド（Spring Boot + JPA）を実務水準・各フレームワークの定石に照らしてレビューし、実装とドキュメント（要件定義書・機能仕様書・画面設計書・API設計書・DB設計書）の食い違いを洗い出す手順。「品質チェックをして」「レビューして」「実装を見てほしい」「おかしいところはないか」「lint を回して」「ドキュメントと実装が合っているか確認して」「デファクトスタンダードから外れていないか」と言われたとき、および PR を出す前の最終確認では必ずこれを参照すること。**推測で件数や問題点を語る前に、ここに書いてあるコマンドを実際に走らせること。** 見積もりと実測は外れる。
---

# 品質レビュー

## 最初に必ずやること — 実際に走らせる

**推測で「〜箇所くらい問題がある」と言わない。** #103 で「30箇所ほど」と見積もって報告したが、実測は違った（lint 83件、型エラー6件、strict 追加による増分 0件）。数字を出すなら、必ず下のコマンドの出力から取る。

```powershell
cd frontend
npm run lint     # oxlint。警告は出るが終了コードは 0
npm run build    # tsc -b + vite build。型エラーはここでしか出ない
npm run test     # vitest

cd ..\backend
.\gradlew check  # Spotless の整形検査 + Checkstyle + テスト
```

**`npm run dev` が通ることは、型が通ることの証明にならない。** Vite は型チェックを省く。#103 では、未定義の識別子を参照したまま `npm run build` が失敗する状態が main に入っていた。手元では動いてしまい、誰も気づかなかった。**「動きました」で済ませず、`npm run build` を通すこと。**

`gradlew check` は `test` を UP-TO-DATE で飛ばすことがある。実際に走らせたいときは `.\gradlew test --rerun`。件数は `backend/build/test-results/test/*.xml` から数える。

出力を読むときの注意:

- **oxlint の出力が空になることがある。** PowerShell のリダイレクトで消える。`-f json` でファイルへ書き出して数えるのが確実
- **`gradlew --rules` などは出力を取れない**ことがある。ルール名を調べるなら `frontend/node_modules/oxlint/configuration_schema.json` を grep する

### 既知の誤検出

| 事象 | 扱い |
| --- | --- |
| `react/react-in-jsx-scope` が 159 件 | **全部誤検出。** React 19 の JSX 変換では `import React` が不要。設定で `off` にしてある |
| `react/exhaustive-deps` が 0 件 | ルールが効いていないのではない。**依存の「過剰」は検出しない**（`useCallback` の依存に `state` 全体が入っている問題はここでは捕まらない）。lint に頼らず自分で読むこと |
| Checkstyle がテスト名を弾く | テストのメソッド名は日本語。意図した書き方なので規約側を合わせてある |
| `palantirJavaFormat` / `googleJavaFormat` が `NoSuchMethodError` | JDK 25 で javac の内部 API の署名が変わったため。Eclipse の整形器を使っている。**戻そうとしないこと** |

---

## フロントエンドのレビュー観点

lint は書き方の誤りしか見ない。**設計の問題は自分で読む必要がある。** 以下は #103 で実際に見つかった順。

### 落ちると画面が消えるもの

- **`ErrorBoundary` があるか**（`src/main.tsx`）。React 19 はレンダリング中の例外でツリーごと外すので、無いと白画面になる
- **API レスポンスを検証しているか**（`src/api/board.ts`）。`as Board` の型アサーションは実行時に何も確かめない。想定外の形が来ると描画中に TypeError になり、上と重なって白画面になる

### 状態管理

- **`useCallback` / `useMemo` が実際に効いているか。** 依存配列に `state` 全体のような「毎回変わるもの」が入っていると、参照は安定せず**コストだけ払って効果ゼロ**になる。`React.memo` の有無も併せて見る
- **競合状態。** `fetch` にキャンセルの口（`AbortSignal`）があるか。無いと、再読み込みの連打で遅い応答が後着し、古い状態で上書きされる
- **排他的な状態を別々の `useState` で持っていないか。** 同時に2つ真になってはいけない関係は、判別共用体（`{ kind: 'none' } | { kind: 'cardDetail'; cardId: string }`）で表すと、手動の排他が要らなくなる
- **React 19 の標準機能を使えないか。** 楽観的更新の手書きロールバックは `useOptimistic`、送信中フラグは `useTransition` / `useActionState` で置き換えられることが多い

### アクセシビリティ

- **モーダルにフォーカストラップがあるか。** `aria-modal="true"` は支援技術へのヒントに過ぎず、**Tab で背後に抜ける。** `<dialog>` + `showModal()` にすると、トラップ・背景の不活性化・`Esc` が標準で付き、各モーダルに重複した `window` の keydown リスナも消える
- **フォーカスリングを消していないか。** `focus:outline-none` で border の色だけに頼ると、Windows のハイコントラストモードで**完全に見えなくなる**
- **エラー文言が入力欄と紐付いているか。** `role="alert"` だけでは、フォーカスを入力欄へ戻したときに読み上げられない。`aria-invalid` と `aria-describedby` が要る

### 型

- `tsconfig.app.json` の `strict` が有効か
- 非 null アサーション（`!`）と型アサーション（`as`）が増えていないか。`isXxx(v): boolean` は `v is Xxx` の型ガードにすると、呼び出し側のアサーションが消える

---

## バックエンドのレビュー観点

JPA は「動いてしまうが間違っている」が起きやすい。**発行 SQL のログを見ないと気づけない**類が多い。

- **N+1。** 親から子を辿ると、件数ぶん SELECT が飛ぶ。データは正しく取れるので画面上は正常に見える。`JOIN FETCH` で1クエリにする
- **`MultipleBagFetchException`。** `List` のコレクションを2段ぶん同時に `JOIN FETCH` すると起きる。`@OrderBy` を付けた `Set` にすると、`LinkedHashSet` が使われて SQL の順序が保たれる
- **`cascade = ALL` と削除の打ち消し。** 親のコレクションに残ったまま `delete(child)` を呼んでも、flush のときに PERSIST がカスケードして**削除の予約が取り消される。** 親から外して `orphanRemoval` に消させるのが正しい経路
- **一括 UPDATE と永続化コンテキスト。** JPQL の `@Modifying` は DB を直接書き換えて永続化コンテキストを迂回する。`flushAutomatically` と `clearAutomatically` が無いと、同じトランザクション内で古い値を読む
- **`@Transactional` の範囲。** 「消す」と「詰め直す」のように、途中で失敗すると壊れた状態が残る操作は同じトランザクションに入っているか。読み取りには `readOnly = true`
- **エンティティをそのまま返していないか。** レスポンスは record の DTO に分ける。返さないと決めた列（`created_at` など）の露出と、DB の構造変更が API に波及することを防ぐ
- **例外処理が `@RestControllerAdvice` に集約されているか。** コントローラごとに組み立てると、エンドポイントが増えるにつれて形が揺れる
- **スキーマは Flyway が持ち、`ddl-auto=validate` か。** Hibernate に作らせない
- **相関チェック（2項目にまたがる検証）の置き場所。** Bean Validation では表せないので、サービスが専用の例外を投げる形に揃っているか

---

## ドキュメント整合のレビュー

**実装を正とする。** 文書が実装より新しい（＝これから作る）場合を除き、食い違いは文書側を直す。

突き合わせる対象:

| 文書 | 見るところ |
| --- | --- |
| `docs/design/api.md` | エンドポイントのパス・HTTPメソッド・**成功時のステータス**（201 と 200 の区別）、リクエスト/レスポンスのフィールド名と型、**エラーコードと HTTP ステータスの一覧** |
| `docs/design/database.md` | テーブル定義、CHECK 制約、インデックス、id の採番方法、`updated_at` の扱い |
| `docs/requirements.md` | 上限値（件数・文字数）、ユースケースの操作手順に出てくるボタンが**実在するか** |
| `docs/functional-spec.md` | 色コード、文言、機能ID（F-xx）ごとの実装状況 |
| `docs/design/ui.md` | ラベルの文言、モーダルの閉じ方（`Esc` の有無）、初期フォーカス、ワイヤーフレームと実際のレイアウト |

見つかりやすい型:

- **エラーコード表の漏れ。** `GlobalExceptionHandler` が返すのに表に無いもの（`INTERNAL_ERROR` などの汎用系が落ちやすい）。画面側は `code` で分岐するので、表が正本でないと危ない
- **上限値の変更が波及していない。** 1箇所直して他の文書に反映されていない
- **同じ文書の中での自己矛盾。** 仕様を変えたとき、表は直したが下の注記が残っている
- **文書にしか無い挙動 / 文書に無い挙動。** 実装した後で文書に書き足していないもの（待機中の表示、タイムアウト値など）

**Bean Validation の制約が、期待どおりのエラーコードになるとは限らない。** ハンドラの対応表に載っていないリクエストは汎用のコードに落ちる。表に書く前に、実際にどのコードが返るかをコードで追うこと。

---

## 報告のしかた

- **重要度で並べる。** 「白画面になる」と「コメントの数値が古い」を同列に並べない
- **file:line を付ける。** 「App.tsx の状態管理」ではなく `App.tsx:317`
- **なぜ問題かを書く。** 「標準から外れている」だけでは直す判断ができない。何が起きるかを書く
- **良い点も書く。** 落とし穴を踏んだうえで対処し、理由をコメントに残してある箇所は、それ自体が資産。消される方向の変更を防ぐ意味がある
- **直さないと決めたものは記録に残す。** `docs/backlog.md` に後続 Issue の候補として書く。調査しただけで消えると、次に同じ調査をやり直すことになる

---

## 関連

- `frontend/.oxlintrc.json` — 各ルールを入れた理由と、既存の違反を今すぐ直さない理由
- `backend/build.gradle.kts` — Spotless と Checkstyle の設定と、整形器を選んだ経緯
- `backend/config/checkstyle/checkstyle.xml` — 規約を実態に合わせた3点の調整
- `.github/workflows/ci.yml` — PR で自動実行される内容
- `README.md`「品質チェック」／`docs/operations.md` 3.2 — 人間向けの手順
- `docs/backlog.md` — レビューで見つかった未対応のもの
