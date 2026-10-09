# infra（Terraform）

このアプリを AWS の上で動かすための、**サーバーやネットワークの設計図**。Terraform という道具が、この設計図のとおりに AWS の上へ作ったり、消したりする。

> **いまは段階 1（EC2 を1台立てて動作確認する）まで。** RDS（データベース）とアプリの配置は、後の段階で足す。進め方と、構成を決めた理由・料金は、デプロイガイド（`docs/deployment/`）の 06・07 にある。

---

## 作るもの

| ファイル | 中身 | 料金 |
| --- | --- | --- |
| [versions.tf](versions.tf) | Terraform と AWS プロバイダ（AWS を操作する部品）の版、東京リージョン | — |
| [variables.tf](variables.tf) | 外から渡す値の一覧（自分の IP、サーバーの種類など） | — |
| [network.tf](network.tf) | VPC・サブネット・インターネットゲートウェイ・経路の表 | 無料 |
| [security.tf](security.tf) | セキュリティグループ（自分の IP からの HTTP だけ通す） | 無料 |
| [iam.tf](iam.tf) | EC2 に持たせる権限（Session Manager で入るため） | 無料 |
| [ec2.tf](ec2.tf) | EC2 `t3.micro`・ディスク 8GB・動作確認用のページ | **動かしている間だけかかる** |
| [alarm.tf](alarm.tf) | 1時間ほぼ何もしていなければ EC2 を終了するアラーム | 無料枠の範囲 |
| [outputs.tf](outputs.tf) | 作った後に表示する値（URL、サーバーに入るコマンド） | — |

動かしている間の料金は、**約 $0.02/時**（EC2・ディスク・パブリック IPv4）。

読む順番のおすすめ：`network.tf` → `security.tf` → `iam.tf` → `ec2.tf` → `alarm.tf`。外側（ネットワーク）から内側（サーバー）へ向かう順になっている。

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

---

## 知っておくこと

- **state ファイル**（`terraform.tfstate`）は、Terraform が「何を作ったか」を覚えておくファイル。このフォルダにでき、`.gitignore` 済み。**消すと destroy できなくなる**ので、手で消さない
- **1時間ほぼ何もしないと、EC2 は自動で終了する**（`alarm.tf`）。そのときはメールが届く。ネットワークなどの無料の部品は残るので、後で destroy する
- **SSH の入口は開けていない。** サーバーに入るのは Session Manager だけ
