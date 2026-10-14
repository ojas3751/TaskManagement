# infra（Terraform）

このアプリを AWS の上で動かすための、**サーバーやネットワークの設計図**。Terraform という道具が、この設計図のとおりに AWS の上へ作ったり、消したりする。

> **いまは段階 3（EC2 と RDS を立て、画面と API を動かし、DB を S3 に退避・復元できる）まで。**構成を決めた理由と料金は [インフラ構成書](../docs/infrastructure.md)、権限の設計は [セキュリティ設計](../docs/security.md)、日々の操作は [運用手順](../docs/operations.md) の「5. AWS での作業」にある。

> **作業の始めと終わりは、`scripts/aws/start.ps1` と `stop.ps1` を使う**（[scripts/aws/README.md](../scripts/aws/README.md)）。`terraform destroy` を直接打つと、DB が退避されずに消える。

このフォルダには、Terraform が2つある。

| フォルダ | 作るもの | いつ消すか |
| --- | --- | --- |
| `infra/`（ここ） | ネットワーク・EC2・RDS など | **作業のたびに作って消す** |
| [infra/persistent/](persistent/) | バックアップの置き場（S3 バケット） | **消さない**（記録＝state も別なので、`infra` の destroy では消えない） |

`infra` は `infra/persistent` の記録からバケットの名前を読むので、**先に `infra/persistent` を apply しておく**必要がある。

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
| [backup.tf](backup.tf) | S3 への近道（ゲートウェイエンドポイント）、EC2 にバックアップの置き場を読み書きする権限 | 無料 |
| [app.tf](app.tf) | EC2 に、PC でビルドしたアプリ（S3 の `artifacts/`）を取り出す権限 | 無料 |
| [ec2-setup/](ec2-setup/) | EC2 を作った直後の手順（ユーザーデータ）：Java 25・nginx などを入れる、スワップ 1GB、nginx の設定（画面と `/api` の中継）、API を動かす systemd の設定 | — |
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

## 動作確認

`start.ps1` が終わると、画面の住所（`web_url`）が表示される（後からは `terraform -chdir=infra output` で見られる）。

1. **アプリが開けるか**：`web_url` をブラウザで開く。タスク管理のボードが表示されれば成功
2. **自分の IP 以外からは開けないか**：スマートフォンの Wi-Fi を切り、モバイル回線で同じ住所を開く。開けなければ成功
3. **サーバーに入れるか**：表示された `session_manager_command` を実行する。`free -h` でメモリ、`df -h` でディスク、`journalctl -u taskmgmt-api` で API のログを見られる。`exit` で出る
4. **終わったら `stop.ps1`**（`terraform destroy` を直接打たない）

### 段階 2a：EC2 から RDS につながるか

RDS は、作るのに数分かかる（実測で 5分28秒）。apply の途中で止まって見えても、待っていてよい。

| コマンド | 打つ場所 |
| --- | --- |
| `terraform ...`、`aws ssm start-session ...`、`Test-NetConnection ...` | **PC**（PowerShell。`PS C:\...>` の画面） |
| `PGPASSWORD=... psql ...`、SQL、`\q`、`exit` | **サーバーの中**（`sh-5.2$` の画面） |

1. Session Manager でサーバーに入る（上の 3）
2. RDS につなぐコマンドを表示する。**`terraform` は PC にしか無いので、PC の別のターミナル**（VS Code / Cursor のターミナルの「＋」）で実行する:
   ```powershell
   terraform -chdir=infra output -raw db_connect_command
   ```
   表示された1行をコピーし、**サーバーの中**（`sh-5.2$` の画面）に貼り付けて実行する。`taskmanagement=>` と出れば、RDS につながっている
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
