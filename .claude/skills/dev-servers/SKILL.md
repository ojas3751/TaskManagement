---
name: dev-servers
description: このリポジトリの開発サーバー（PostgreSQL 5432 / Spring Boot 8080 / Vite 3000）を規定のポートで起動・停止・再起動する手順。ポートは固定で、埋まっていたら別のポートへ逃がさず占有プロセスを止める。アプリを起動したい、動作確認したい、画面を見たい、サーバーを立て直したいとき、および「ポートが既に使われています」「EADDRINUSE」「Web server failed to start. Port 8080 was already in use」「strictPort」といったエラーに出くわしたときは、必ずこのスキルを参照すること。「とりあえず別のポートで立てる」は、このリポジトリでは動作確認にならないので、その判断をする前に必ずここを読む。
---

# 開発サーバーの起動

## ポートは固定である

| サーバー | ポート | 指定場所 |
| --- | --- | --- |
| フロントエンド（Vite） | **3000** | `frontend/vite.config.ts`（`strictPort: true`） |
| バックエンド（Spring Boot） | **8080** | `backend/src/main/resources/application.properties` |
| データベース（PostgreSQL） | **5432** | `compose.yaml` |

**別のポートで起動してはならない。** 理由は、この3つが互いを番号で直接指しているから。

```
ブラウザ ──:3000──▶ Vite ──/api/* を :8080 へ転送──▶ Spring Boot ──▶ PostgreSQL :5432
```

Vite の proxy 先は `http://localhost:8080` とハードコードされており、ブラウザの入り口は `:3000` の1つだけと決めている。片方をずらすと、プロセスは起動しても `/api/*` が繋がらず画面が動かない。

だから **「ポートが埋まっていたので 8081 で立てて確認しました」は確認になっていない。** それで動いたように見えても、実際に利用者が使う構成とは別物を見ている。

## 起動する

```powershell
docker compose up -d              # DB（既に起動していれば何もしない）
cd backend;  .\gradlew bootRun    # :8080
cd frontend; npm run dev          # :3000
```

backend と frontend はどちらも起動したまま動き続けるので、**別々のターミナル（バックグラウンド実行）で立てる。** 片方を待っていると、もう片方に進めない。

起動できたかは、プロセスが生きていることではなく**応答**で確かめる。

```powershell
curl.exe -s -o NUL -w "frontend :3000    -> HTTP %{http_code}`n" http://localhost:3000/
curl.exe -s -o NUL -w "board API (proxy) -> HTTP %{http_code}`n" http://localhost:3000/api/board
```

proxy 経由（`:3000/api/board`）が 200 なら、3層が繋がっている。ここを `:8080` で確かめるだけでは、Vite の proxy が生きているかが分からない。

## ポートが埋まっていたら

**逃がすのではなく、占有しているプロセスを止める。**

```powershell
pwsh -File scripts/free-port.ps1 3000        # フロントエンド
pwsh -File scripts/free-port.ps1 8080        # バックエンド
pwsh -File scripts/free-port.ps1 3000 8080   # まとめて
```

このスクリプトは、止めた PID とプロセス名を表示し、ポートが実際に空くまで待ってから終了する。空いていれば何もしないので、起動前に無条件に実行してもよい。

**止める前に、表示された PID とプロセス名を見ること。** 自分で起動した開発サーバー（`java` / `node`）だと確認できない場合は、**止めずにユーザーへ確認する。** 無関係な業務プロセスを巻き添えにすると、失われるものはこちらの都合では取り返せない。

**5432 は対象外。** DB は Docker が管理しているので、プロセスを直接止めるとコンテナの状態と食い違う。止めるなら `docker compose down`（`-v` を付けるとデータが消える）。

## 止める・立て直す

自分がバックグラウンドで起動したサーバーは、そのタスクを止めるのが一番きれいで、`free-port.ps1` は最後の手段。タスクの停止で消えなかった場合にポートを解放する。

ユーザーにエラー画面を見せるなど、**意図的に片方だけ落とす場面がある。** そのときは何を落としたかを伝え、**戻すのは自分の責任で行う。** 落としたまま次の話題に移らない。

## 強制されていること

`.claude/hooks/guard-ports.ps1` が PreToolUse フックとして、次の2つをツール実行の時点でブロックする。

1. `--port` / `-Dserver.port=` / `--server.port` などで**別ポートを指定した起動**
2. **ポートが埋まったままの起動**

ブロックされたら、抜け道（フックに引っかからない書き方）を探すのではなく、`free-port.ps1` でポートを空けてから素直に起動し直す。フックが止めているのは書き方ではなく、**壊れた構成で確認したつもりになること**なので、迂回しても確認の役には立たない。

なお、このフックが効くのは Claude のツール実行に対してだけで、ユーザーが自分のターミナルで直接叩く分には効かない。そちらは取り決めとして [CLAUDE.md](../../../CLAUDE.md) と [README](../../../README.md) に書いてある。

## 関連

- `scripts/free-port.ps1` — ポート解放
- `.claude/hooks/guard-ports.ps1` — 上記の強制
- `CLAUDE.md`「起動ポート」 — ルールの所在
- `README.md`「起動」 — 人間向けの起動手順
