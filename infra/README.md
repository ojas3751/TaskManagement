# infra（Terraform）

このアプリを AWS の上で動かすための、**サーバーやネットワークの設計図**。Terraform という道具が、この設計図のとおりに AWS の上へ作ったり、消したりする。

> **いまは段階 2a（EC2 と RDS を立て、EC2 から RDS につながることを確かめる）まで。** データの退避と復元（段階 2b）とアプリの配置（段階 3）は、後で足す。進め方と、構成を決めた理由・料金は、デプロイガイド（`docs/deployment/`）の 06・07 にある。

---

## 作るもの

| ファイル | 中身 | 料金 |
| --- | --- | --- |
| [versions.tf](versions.tf) | Terraform と AWS プロバイダ（AWS を操作する部品）の版、東京リージョン | — |
| [variables.tf](variables.tf) | 外から渡す値の一覧（自分の IP、サーバーの種類など） | — |
| [network.tf](network.tf) | VPC・パブリックサブネット・インターネットゲートウェイ・経路の表、RDS 用のプライベートサブネット 2つ | 無料 |
| [security.tf](security.tf) | セキュリティグループ（EC2 は自分の IP からの HTTP だけ、RDS は EC2 からの 5432 だけ） | 無料 |
| [iam.tf](iam.tf) | EC2 に持たせる権限（Session Manager で入る、DB のパスワードを読む） | 無料 |
| [ec2.tf](ec2.tf) | EC2 `t3.micro`・ディスク 8GB・動作確認用のページ・PostgreSQL のクライアント | **動かしている間だけかかる** |
| [rds.tf](rds.tf) | RDS `db.t3.micro`（PostgreSQL 17・gp3 20GB）、パスワードとその置き場（パラメータストア） | **動かしている間だけかかる** |
| [alarm.tf](alarm.tf) | 1時間ほぼ何もしていなければ EC2 を終了するアラーム | 無料枠の範囲 |
| [outputs.tf](outputs.tf) | 作った後に表示する値（URL、サーバーに入るコマンド、RDS につなぐコマンド） | — |

動かしている間の料金は、**約 $0.052/時**（EC2 側 約 $0.020 ＋ RDS 側 約 $0.032）。

読む順番のおすすめ：`network.tf` → `security.tf` → `iam.tf` → `ec2.tf` → `rds.tf` → `alarm.tf`。外側（ネットワーク）から内側（サーバーとデータベース）へ向かう順になっている。

---

## 最初に1回だけやること

### 1. 自分の IP を書いたファイルを作る

自分の IP を調べる:

```powershell
(Invoke-WebRequest -Uri https://checkip.amazonaws.com -UseBasicParsing).Content.Trim()
```

見本をコピーして、`my_ip_cidr` を「調べた IP/32」に書き換える:

```powershell
Copy-Item infra/terraform.tfvars.example infra/terraform.tfvars
```

`terraform.tfvars` は `.gitignore` に入っているので、コミットされない。**家の IP は変わることがある。** ページが開けなくなったら、調べ直して書き換え、apply し直す。

### 2. 準備（init）

```powershell
terraform -chdir=infra init
```

AWS プロバイダをダウンロードする。AWS には何も作らない。

---

## 使い方

コマンドは、リポジトリのいちばん上のフォルダで打つ。`-chdir=infra` は「infra フォルダで実行する」という意味。

| やりたいこと | コマンド | 誰が打つか | AWS を変えるか |
| --- | --- | --- | --- |
| 書き方を整える | `terraform -chdir=infra fmt` | AI | 変えない |
| 誤りを調べる | `terraform -chdir=infra validate` | AI | 変えない |
| 作る予定の一覧を見る | `terraform -chdir=infra plan` | AI（読み取り専用の鍵で） | 変えない |
| **作る** | `terraform -chdir=infra apply` | **人**（作業者の鍵で） | **変える。料金が始まる** |
| **消す** | `terraform -chdir=infra destroy` | **人**（作業者の鍵で） | **変える** |

どの鍵（プロファイル）を使うかは、コマンドの前に環境変数で指定する:

```powershell
# 人が apply / destroy するとき
$env:AWS_PROFILE = "taskmgmt"
terraform -chdir=infra apply
```

`apply` と `destroy` は、実行する内容の一覧を表示してから「本当に実行するか」を聞いてくる。一覧を読んでから `yes` と入力する。**一覧に「destroy」や「replace（作り直し）」が出ていたら、いったん止めて中身を確かめる。**

---

## 動作確認（段階 1）

apply が終わると、URL とコマンドが表示される（後からは `terraform -chdir=infra output` で見られる）。

1. **ページが開けるか**：表示された `web_url` をブラウザで開く。「taskmgmt: EC2 is running」と出れば成功。作った直後はソフトの準備中で、開けるまで数分かかることがある
2. **自分の IP 以外からは開けないか**：スマートフォンの Wi-Fi を切り、モバイル回線で同じ URL を開く。開けなければ成功
3. **サーバーに入れるか**：表示された `session_manager_command` を実行する。入れたら `df -h` でディスクの使用量を見る。`exit` で出る
4. **終わったら destroy する**

### 段階 2a：EC2 から RDS につながるか

RDS は、作るのに 10 分前後かかることがある。apply の途中で止まって見えても、待っていてよい。

1. Session Manager でサーバーに入る（上の 3）
2. 表示された `db_connect_command` を、そのまま貼り付けて実行する。`taskmanagement=>` と出れば、RDS につながっている
3. 試しの表を作り、1行入れて読む:
   ```sql
   CREATE TABLE ping (id serial PRIMARY KEY, note text);
   INSERT INTO ping (note) VALUES ('hello from EC2');
   SELECT * FROM ping;
   ```
4. `\q` で psql を抜け、`exit` でサーバーから出る
5. **EC2 以外からつながらないか**：PC の PowerShell で、RDS の住所（`db_endpoint`）のポート 5432 につながるか試す。`TcpTestSucceeded : False` と出れば正しい（RDS の住所は VPC の中の番号に変わるので、PC からは届かない）
   ```powershell
   Test-NetConnection (terraform -chdir=infra output -raw db_endpoint) -Port 5432
   ```

試しの表は、destroy で RDS ごと消える。

---

## 知っておくこと

- **state ファイル**（`terraform.tfstate`）は、Terraform が「何を作ったか」を覚えておくファイル。このフォルダにでき、`.gitignore` 済み。**消すと destroy できなくなる**ので、手で消さない
- **1時間ほぼ何もしないと、EC2 は自動で終了する**（`alarm.tf`）。そのときはメールが届く。**RDS は終了されずに動き続ける**（アラームが操作できるのは EC2 だけ）。RDS は毎晩の安全装置が止めるが、止めても料金の一部（ディスク）はかかるので、気づいたら destroy する
- **DB のパスワードは state ファイルに書かれる**（`rds.tf`）。state を人に渡したり、貼り付けたりしない
- **SSH の入口は開けていない。** サーバーに入るのは Session Manager だけ
