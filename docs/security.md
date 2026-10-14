# セキュリティ設計（AWS の権限と秘密情報）

**版 1.0**（2026-10-14）

AWS を扱ううえでの、**権限の設計**と**秘密情報を漏らさないための対策**をまとめる。構成そのものは [インフラ構成書](infrastructure.md)。

> **このリポジトリは公開（PUBLIC）されている。** この文書には、実際のアカウント ID・IAM ユーザー名・通知先メールアドレス・自宅の IP・安全装置の金額としきい値を書かない。例には AWS 公式のダミー値（アカウント ID は `111122223333`、アクセスキー ID は `AKIAIOSFODNN7EXAMPLE`）を使う。

---

## 改訂履歴

| 版 | 日付 | 内容 |
| --- | --- | --- |
| 1.0 | 2026-10-14 | 初版。Git 管理外だったデプロイガイド（`docs/deployment/`）のうち、権限と秘密情報に関する内容を移した |

---

## 1. 誰が何をするか

| 作業 | 誰が | 理由 |
| --- | --- | --- |
| `.tf` を書く、`fmt` / `validate` / `plan` | **AI** | AWS を変えない |
| エラーの調査と直し方の検討 | **AI** | — |
| **`terraform apply` / `destroy`** | **人** | 料金が発生し、取り返しがつかない |
| **AWS の削除系コマンド** | **人** | 同上 |
| **IAM の権限を与える操作**（ポリシーの貼り付け、ユーザー・ロール・グループの作成） | **人がコンソールで** | 権限の付与は人が目で見て行う |
| 貼り付ける JSON の作成と検査 | **AI** | 下の 1.2 |
| 作った後に意図どおりか確認 | **AI** | AWS から読み戻して手元の JSON と比較 |
| IAM 以外の作成（通知・予算・Lambda など） | **AI がコマンドで** | 権限の付与ではない |
| **アクセスキーの発行** | **人がコンソールで** | CLI で作ると鍵の値が AI との会話ログに残る。Terraform で作ると state に平文で入る |

**人が打つものの理由は、料金と、取り返しがつかないこと。** 判断を誤ったときの損害が大きいので、請求を受け取る本人が実行する。この分担は、Claude Code のフックと AWS の読み取り専用ロールで**仕組みとしても守られている**（4章）。

### 1.1 AWS CLI と Terraform の使い分け

| 作るもの | 道具 | 理由 |
| --- | --- | --- |
| **一度作ったら消さないもの**（IAM、安全装置、予算、通知） | **AWS CLI とコンソール** | Terraform の管理下に置くと、`destroy` で安全装置まで消えてしまう。作り直す機会も無い |
| **作業のたびに作って消すもの**（VPC、EC2、RDS など） | **Terraform**（[infra/](../infra/)） | 毎回同じものを確実に作れる |
| **消さないが Terraform で作るもの**（S3 バケット） | **Terraform の別構成**（[infra/persistent/](../infra/persistent/)） | state を分けてあるので `infra` の destroy では消えない |

> **アクセスキーだけは、どちらでも作らない。** CLI で作ると鍵の値が会話ログに残り、Terraform で作ると state に平文で入る。**人がコンソールで発行する。**

### 1.2 IAM ポリシーを人に渡す前の検査

AI が必ず次を行ってから渡す。

1. **アクション名を AWS 公式の Service Reference と照合する。** 推測で書くと、存在しない名前を書いたり、必要なものを書き漏らしたりする
2. `aws accessanalyzer validate-policy` にかけ、指摘が 0 件であることを確かめる（無料）
3. 人がコンソールで貼り付けた後、AWS から読み戻して手元の JSON と比べる。**項目の並び順は AWS が入れ替えることがある**ので、順序を無視して比べる

> **なぜこの手順があるか。** 一度、推測でアクション名を書いてポリシーエディタに「`billing:Modify*` は存在しない」と警告された。公式の一覧で照合し直したところ、**書き漏らしも見つかった。**

### 1.3 アカウントを一から作り直すときの順序

**この順でしか作れない**（後のものが前のものに依存している）。詳細は 2 章と 3 章。

| # | やること | 誰が |
| --- | --- | --- |
| 1 | ルートユーザーに MFA を付ける | 人 |
| 2 | 管理者ユーザーを作り、MFA を付ける | 人 |
| 3 | 「IAM ユーザーおよびロールによる請求情報へのアクセス」を有効にする | **人（ルートユーザーで）** |
| 4 | 管理者を**構築用**グループに入れる（2.5） | 人 |
| 5 | 管理者のアクセスキーを登録する。**構築の間だけ使い、16 で消す** | 人 |
| 6 | SNS トピック `guard-alerts` を作る。**届く確認メールのリンクを押して購読を有効にする** | AI |
| 7 | Lambda `guard-killswitch` と、呼び出し口の SNS トピックを作る（先に実行ロールを作る） | AI |
| 8 | EventBridge Scheduler `guard-nightly-stop` を作る | **人**（AI は自動判定に止められる） |
| 9 | 予算 `guard-monthly-cost` を作る | AI |
| 10 | Cost Anomaly Detection の既定の設定を調整する（新規に作らない） | AI |
| 11 | 作業者ユーザー `taskmgmt-worker` を作る。**コンソールのパスワードは作らない** | 人（AI が JSON を用意） |
| 12 | AI 用ロール `ai-readonly` を作る | 人（AI が JSON を用意） |
| 13 | 作業者ユーザーのアクセスキーを発行する。**説明タグは付けない**（7 章） | 人 |
| 14 | `aws configure --profile taskmgmt` で登録し、`~/.aws/config` に `taskmgmt-readonly` を書き足す | 人（鍵）／ AI（設定） |
| 15 | 6 章の確認を通す | AI |
| 16 | 管理者を**運用用**グループへ移し、**管理者のアクセスキーを削除する** | 人 |

> ⚠️ **16 は「先に運用用へ追加 → 動作を確認 → 構築用から外す」の順で行う。** 逆にすると、権限が無くなって自分では戻せなくなる。
>
> 運用用の管理者は**自分の鍵を消せない**（鍵を操作できる相手を作業者ユーザーに限っているため）。**ルートユーザーで消す。**

> **8 を人が打つ理由。** 「毎晩自動で動く」スケジュールの作成は、Claude Code の自動判定に「無断で常駐する仕組み」として止められる（4.3）。**失敗時の再試行は「最大 2 回・1 時間以内」に絞ること** — 既定のままだと最大 24 時間・185 回まで再試行され、**日中の作業中に停止が走るおそれがある。**

PC 側の道具の導入は [運用手順](operations.md) の 2.8。

---

## 2. IAM の構成

### 2.1 誰が何を持つか

| 誰 | 種類 | 権限 | アクセスキー | 使う場面 |
| --- | --- | --- | --- | --- |
| ルートユーザー | — | すべて | 持たない | 2.2 の操作のときだけ |
| 管理者 | IAM ユーザー | 構築用または運用用のグループのポリシー ＋ `IAMUserChangePassword` | **持たない** | ユーザーと安全装置の管理、コストの確認 |
| 作業者 `taskmgmt-worker` | IAM ユーザー | `PowerUserAccess` ＋ 下の 2.4 のポリシー | **持つ（1本だけ）** | `terraform apply` / `destroy` |
| AI 用 `ai-readonly` | IAM ロール | `ReadOnlyAccess` | 不要（作業者の鍵から一時的な認証を受け取る） | `terraform plan`、状態の確認 |
| 自動停止の Lambda 用 `guard-killswitch-lambda` | IAM ロール | EC2 の一覧と停止、ログの書き込み、通知 | 不要 | Lambda が EC2 を止める |
| 夜間停止用 `guard-nightly-scheduler` | IAM ロール | Lambda を呼ぶことだけ | 不要 | 毎晩 Lambda を呼ぶ |

**常に存在するアクセスキーは、作業者ユーザーの 1 本だけ。** 管理者の鍵は構築の間だけ使い、終わった時点で削除した。

> `ReadOnlyAccess` は S3 のバックアップも読める。個人のタスクデータだけなので、読めてよいと判断した。
>
> サービス用ロールの信頼ポリシー（誰がこのロールになれるか）は、Lambda・スケジューラーという**サービスだけ**に限っている。

### 2.2 ルートユーザーでしかできないこと

- 支払い方法など、アカウントの設定の変更
- アカウントの解約
- IAM ユーザーに請求情報を見せる設定の有効化
- 管理者が権限を失ったときの復旧

正確な一覧は AWS の「ルートユーザーの認証情報が必要なタスク」にある。

> **判断の基準：この一覧に無い作業のためにルートユーザーでログインしようとしているなら、やり方が間違っている。** IAM ユーザーで済む方法を探す。

### 2.3 名前の付け方

| 先頭 | 意味 | 誰が変更できるか |
| --- | --- | --- |
| `taskmgmt-` | Terraform が作って消すもの | 作業者ユーザー |
| `guard-` | **安全装置** | 管理者だけ。作業者ユーザーには `Deny` |
| `ai-readonly` | AI 用のロール | 管理者だけ。`taskmgmt-` で始めないことで、作業者ユーザーが書き換えられないようにしている |

**名前の先頭を揃えておくと、ポリシーの `Resource` に `role/taskmgmt-*` のように書いてまとめて許可・拒否できる。**

### 2.4 作業者ユーザーのポリシー

`PowerUserAccess` は「IAM・組織・アカウントの操作以外は全部許可」なので、サーバーやネットワークは自由に作れる。そのうえでカスタマー管理ポリシー `taskmgmt-worker-policy` を足している。

| 文（Sid） | 種類 | 中身 | 理由 |
| --- | --- | --- | --- |
| `ManageProjectRoles` | 許可 | `taskmgmt-` で始まるロールとインスタンスプロファイルの作成・削除・ポリシーの付け外し | EC2 に付けるロールを Terraform で作るため。`PowerUserAccess` は IAM を触れないので、ここだけ足す |
| `PassProjectRoles` | 許可 | `taskmgmt-` のロールを、**EC2 に渡すときだけ** | 渡す先を限ることで、他のサービスに強いロールを渡されないようにする |
| `DenyAttachingAdministratorAccess` | 拒否 | `AdministratorAccess` をアタッチすること | **ロールを作って何でもできるポリシーを付け、それを使う**という抜け道を塞ぐ |
| `DenyBudgetChanges` | 拒否 | 予算の変更（閲覧は許可） | **予算は使いすぎを止める側の仕組み**なので、使う側から外せないようにする |
| `DenyPaymentsAndBillingChanges` | 拒否 | 支払い・請求設定の変更 | 同上 |
| `DenyGuardChanges` | 拒否 | `guard-` の安全装置と `ai-readonly` について、**閲覧と呼び出し以外すべて** | 安全装置を使う側から外せないようにする。`NotAction` で書いたので、**AWS が新しい操作を増やしても自動的に拒否側に入る** |

**作業者ユーザーは IAM の操作権限をほとんど持たないので、これらの `Deny` を自分で外すことはできない。**

<details>
<summary>ポリシーの全文（JSON）</summary>

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ManageProjectRoles",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole", "iam:DeleteRole", "iam:UpdateRole", "iam:UpdateRoleDescription",
        "iam:UpdateAssumeRolePolicy", "iam:PutRolePolicy", "iam:DeleteRolePolicy",
        "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:TagRole", "iam:UntagRole",
        "iam:GetRole", "iam:GetRolePolicy", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies",
        "iam:ListInstanceProfilesForRole", "iam:CreateInstanceProfile", "iam:DeleteInstanceProfile",
        "iam:GetInstanceProfile", "iam:AddRoleToInstanceProfile", "iam:RemoveRoleFromInstanceProfile",
        "iam:TagInstanceProfile", "iam:UntagInstanceProfile"
      ],
      "Resource": [
        "arn:aws:iam::*:role/taskmgmt-*",
        "arn:aws:iam::*:instance-profile/taskmgmt-*"
      ]
    },
    {
      "Sid": "PassProjectRoles",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::*:role/taskmgmt-*",
      "Condition": { "StringEquals": { "iam:PassedToService": "ec2.amazonaws.com" } }
    },
    {
      "Sid": "DenyAttachingAdministratorAccess",
      "Effect": "Deny",
      "Action": ["iam:AttachUserPolicy", "iam:AttachGroupPolicy", "iam:AttachRolePolicy"],
      "Resource": "*",
      "Condition": { "ArnEquals": { "iam:PolicyARN": "arn:aws:iam::aws:policy/AdministratorAccess" } }
    },
    {
      "Sid": "DenyBudgetChanges",
      "Effect": "Deny",
      "Action": [
        "budgets:ModifyBudget", "budgets:CreateBudgetAction", "budgets:UpdateBudgetAction",
        "budgets:DeleteBudgetAction", "budgets:ExecuteBudgetAction",
        "budgets:TagResource", "budgets:UntagResource"
      ],
      "Resource": "*"
    },
    {
      "Sid": "DenyPaymentsAndBillingChanges",
      "Effect": "Deny",
      "Action": [
        "payments:*", "billing:Put*", "billing:Update*", "billing:Create*", "billing:Delete*",
        "billing:RedeemCredits", "cur:Put*", "cur:Delete*", "cur:Modify*",
        "aws-portal:Modify*", "aws-portal:Update*", "tax:Put*", "tax:Delete*", "tax:Update*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "DenyGuardChanges",
      "Effect": "Deny",
      "NotAction": [
        "lambda:Get*", "lambda:List*", "lambda:Invoke*",
        "scheduler:Get*", "scheduler:List*",
        "sns:Get*", "sns:List*",
        "logs:Get*", "logs:List*", "logs:Describe*", "logs:FilterLogEvents",
        "logs:StartQuery", "logs:StopQuery",
        "iam:Get*", "iam:List*",
        "sts:AssumeRole"
      ],
      "Resource": [
        "arn:aws:lambda:*:*:function:guard-*",
        "arn:aws:scheduler:*:*:schedule/*/guard-*",
        "arn:aws:sns:*:*:guard-*",
        "arn:aws:logs:*:*:log-group:/aws/lambda/guard-*",
        "arn:aws:iam::*:role/guard-*",
        "arn:aws:iam::*:role/ai-readonly"
      ]
    }
  ]
}
```

</details>

AI 用ロール `ai-readonly` の信頼ポリシー（アカウント ID はダミー）:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowWorkerUserToAssume",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:user/taskmgmt-worker" },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

> 信頼ポリシーの `Principal` には `*` が使えないので、実際のアカウント ID を書く必要がある。

> **予算の変更系アクションについて。** 公式の一覧で確かめると **`budgets:ModifyBudget` 1 つが作成・変更・削除を兼ねている**（`CreateBudget` や `DeleteBudget` というアクションは無い）。閲覧は `budgets:ViewBudget` で別なので、「変更だけ拒否、閲覧は許可」ができる。

### 2.5 管理者の「構築用」と「運用用」

管理者ユーザーのために、ポリシーの違う 2 つのグループを用意し、**所属するグループを切り替えて**使う。

| グループ | 持つ権限 | 使う時期 |
| --- | --- | --- |
| 構築用 | IAM の作成・変更、安全装置の作成など | 構築・改修のとき |
| 運用用 | 日常に要るものだけ（鍵の作り直しと無効化、コストと予算、安全装置の確認、ログの閲覧、自分のパスワードと MFA、IAM の閲覧）＋ AWS 管理ポリシー `AWSBillingReadOnlyAccess` | ふだん |

運用用には、ユーザー・ロール・ポリシーの作成、グループのポリシーの書き換え、**ユーザーをグループに入れる権限**を入れていない。そのため、**運用中の管理者は自分の権限を広げられない。** 構築用に戻すにはルートユーザーでグループに入れ直す。

> **なぜ 2 組用意するのか。** 権限を「取り上げる」方式にすると、改修のたびに何を持たせるか考え直すことになる。2 組あれば所属を変えるだけで済む。

どちらのグループも、支払い・請求設定の**変更**（閲覧は許可）と、`AdministratorAccess` を誰かにアタッチすることを `Deny` で塞いでいる。**ポリシーの中身はこの文書には載せない。**

---

## 3. 秘密情報を漏らさないための 5 層

このリポジトリは**公開**されている。アクセスキーが一度でも GitHub に上がると、

- 公開リポジトリから鍵を探して回るプログラムがあり、**数分で見つかる**と言われている
- 見つかると、勝手にサーバーを大量に立てられるなどして**高額の請求**が来る
- **push した時点で公開されている。** 後から消しても、その間に写し取られていれば手遅れ。**Git の履歴から消しても同じ**

だから、**GitHub に上がる前に止める**ことを中心に対策を組んでいる。外側（上）ほど強い。

| 層 | 対策 | 中身 |
| --- | --- | --- |
| 1 | **鍵を最小限にする** | 常に存在する鍵は作業者ユーザーの 1 本だけ。管理者の鍵は構築の間だけ使って削除。AI は鍵を持たず、読み取り専用ロールを使う |
| 2 | **鍵をリポジトリの外にしか置かない** | 鍵は `~/.aws/credentials` にだけ置く。CLAUDE.md・スキル・プロンプト・`.tf` には**プロファイル名だけ**を書く |
| 3 | **AI に見せない** | 鍵をチャットに貼らない。`aws configure` は人が打つ。AI が `~/.aws/credentials` を読むことを止める |
| 4 | **コミットの前に機械で止める** | AI のコミットは Claude Code のフックが、人のコミットも gitleaks が調べる。state などは `.gitignore` で対象外にする |
| 5 | **GitHub の Push Protection** | 鍵の形をした文字列を含む push を GitHub が拒否する。**有効になっている。** 手元をすり抜けたときの最後の砦 |

1・2 が効いていれば、そもそも鍵がリポジトリのフォルダの中に存在しない。3〜5 は、それでも何かの拍子に混ざったときのための網。

### 3.1 なぜコミット前が本命か

| 止める場所 | 間に合うか |
| --- | --- |
| コミットの前（フック・gitleaks） | **間に合う。** 鍵はまだ手元にしか無い |
| push のとき（Push Protection） | 間に合う。ただし GitHub が知っている形の鍵だけ |
| push の後（CI、レビュー） | **手遅れ。** 公開リポジトリなので push した時点で誰でも見られる |

### 3.2 公開してはいけない値

| 値 | 秘密か | 漏れると何が困るか |
| --- | --- | --- |
| **アクセスキー** | **秘密** | AWS を勝手に使われる |
| AWS のアカウント ID | 秘密ではない（AWS 公式も「秘密・機密の情報とはみなされない」としている） | それだけでは何もできない |
| 自宅の IP アドレス | 秘密ではない | **他人が知っても、他人の PC から接続すれば他人の IP になるので、サーバーの入口は通れない。** 困るのは、おおよその地域が分かるというプライバシーの面 |
| 通知先のメールアドレス | 秘密ではない | 迷惑メールが増えるかもしれない |

> **gitleaks に「この値を見つけたら止める」という独自ルールを足す案は見送った。** 守る対象が秘密ではない値であることと、**ルールに本物の値を書くと、そのルール自体が公開リポジトリで値を漏らしてしまう**ため。代わりに、Terraform の設定値は `*.tfvars`（`.gitignore` 済み）に書き、公開する文書は公開の前に検索して確かめる。

### 3.3 2 つの検査はどう補い合うか

| | AI 用フック（`.claude/hooks/guard-secrets.ps1`） | gitleaks（`.githooks/pre-commit`） |
| --- | --- | --- |
| 対象 | AI のコミットだけ | **人も AI も全部** |
| 見つけられる種類 | AWS の鍵と秘密鍵だけ（4種類） | **数百種類**（GitHub のトークンなど AWS 以外も） |
| 見分け方 | 形だけを見る | 形に加えて、**文字のでたらめさ**も見る |
| 調べる範囲 | 追加済み・未追加の変更と新しいファイル | 追加済みの変更 |

**AI のコミットは両方を通るので、片方の取りこぼしをもう片方が拾う。** 人のコミットは gitleaks だけなので、守りは 1 枚になる。

> **AI 用フックが「まだ追加していない変更」も調べる理由。** AI は `git add X && git commit` のように 1 行で打つことがある。フックはコマンドの実行**前**に動くので、その時点ではまだ何も追加されていない。追加済みの変更だけを見ると、何も見つけられない。

> **確かめ方。** 偽物の鍵（`AKIA` の後ろに `Z` を 16 個並べた ID と、でたらめな 40 文字のシークレット）で、AI のコミットも人のコミットも止まることを確認した。ID の方は gitleaks が見逃し（同じ文字の並びは本物らしくないと判断した）、AI 用フックが止めた。シークレットの方は gitleaks が止めた。導入時に**過去のコミット全部（88件）**も gitleaks で調べ、鍵が混ざっていないことを確認済み。

> AWS 公式ドキュメントの例示用の値（`AKIAIOSFODNN7EXAMPLE`）は、説明に使えるよう通すようにしてある。

### 3.4 CI と鍵の関係

今の CI（GitHub Actions）は **AWS に接続しない。** テストとビルドだけを行うので、鍵が `~/.aws` にしか無くても影響しない。DB の接続情報も、CI 用には `application-test.properties` に仮の値を置いている。

将来 CI から AWS を操作したくなった場合は、**OIDC** を使う。GitHub Actions が実行のたびに AWS から期限付きの認証を受け取る方式で、**鍵を GitHub に預けずに済む。**

---

## 4. Claude Code の歯止め

AI に AWS を触らせるうえで、**させないこと**を決めて仕組みで止めている。

| させないこと | 理由 |
| --- | --- |
| Terraform で実物を変える（`apply` / `destroy` など） | 料金が発生する、データが消えるなど、**取り返しがつかない** |
| AWS の削除系のコマンド | 同上 |
| 読み取り専用以外のプロファイルを使う | AWS 側の最後の歯止めを外してしまう |
| 鍵のファイル（`~/.aws/credentials`）を読む | 鍵が会話のログに残る |

### 4.1 なぜフックが本命か

`.claude/settings.json` の `deny` は「コマンドの**先頭**が一致したら止める」仕組みなので、

```
terraform -chdir=infra apply
```

のように途中にオプションが挟まると先頭が一致せず、**すり抜ける。**

そこで `.claude/hooks/guard-aws.ps1` を本命にしている。フックはコマンドを実行する**直前に**呼ばれ、**コマンドの中身全体**を調べる。

| 止めるもの | 例 |
| --- | --- |
| Terraform で実物を変えるコマンド（オプションがどこに挟まっても） | `apply`、`destroy`、`import`、`taint`、`state rm` |
| AWS の削除系のコマンド | `delete-…`、`terminate-…`、`s3 rm` |
| 読み取り専用以外のプロファイル | `--profile taskmgmt`、`AWS_PROFILE=taskmgmt` |
| 鍵を直接扱うこと | 鍵を環境変数に入れる、`~/.aws/credentials` を開く、鍵を表示するコマンド |

止めたときは、**理由と、代わりにどうすればよいか**を AI に返す。

> **確かめ方。** 23 通りのコマンド文字列をフックに渡し、止めるべき 14 通りを止め、通すべき 9 通りを通すことを確認した。

### 4.2 3 重になっている

| 層 | 止める仕組み |
| --- | --- |
| 1 | `settings.json` の `deny`（分かりやすい形のコマンドを止める） |
| 2 | **フック**（すり抜けた形も止める） |
| 3 | **AWS の読み取り専用ロール**（仮に両方をすり抜けても、AWS が書き込みを拒否する） |

> ⚠️ **Terraform を書くときの注意。** 3 層目は、AI が読み取り専用のプロファイルを使っていることが前提。`.tf` の `provider` の中に `profile = "taskmgmt"` と書いてしまうと、**AI の `terraform plan` が書き込みのできる鍵で動いてしまい、フックでも見抜けない。** プロファイルは `.tf` に書かず、実行するときに環境変数で指定する。

### 4.3 Claude Code 自身の自動判定

上の設定とは別に、Claude Code 自身が「危険そうな操作」を判断して止めることがある。実際に止められたもの:

| 止められた操作 | 理由（推測を含む） |
| --- | --- |
| AI が IAM のポリシーを付ける・ロールを作る | 権限を与える操作だから |
| AI が自分の許可設定（`settings.local.json`）を書き換える | 自分で自分の権限を広げる操作だから |
| AI が「毎晩自動で動く」スケジュールを作る | 無断で常駐する仕組みを仕込む操作に見えたから |
| `terraform apply` などの文字列が並んだテストのコマンド | 危険な操作に見えたから（実際は文字列を判定にかけるだけだった） |

**これは期待どおりの挙動として扱う。** 止められたら、回り道を探さずに、人がコンソールで操作するか、人がコマンドを打つ。

### 4.4 MCP server を入れなかった理由

AWS CLI 2.37 では `aws configure` の最後に「AWS skills と AWS MCP server を AI エージェント用に設定しますか」と聞かれる。**No と答えた。**

MCP server は、AI がコマンドを打つのとは**別の経路で** AWS を操作する仕組み。上の歯止めは「コマンド」に対してかけているので、**MCP server 経由の操作は止められない。** 入れるなら歯止めの設計から見直す必要がある。

---

## 5. 鍵の運用

### 5.1 2 つのプロファイル

| プロファイル | 中身 | 誰が使うか | できること |
| --- | --- | --- | --- |
| `taskmgmt` | 作業者ユーザーのアクセスキー | **人** | `terraform apply` / `destroy` |
| `taskmgmt-readonly` | 作業者ユーザーの鍵を使って**読み取り専用ロールに切り替える** | **AI** | 読むことだけ |

鍵は 2 か所のファイルに分かれて入る。

| ファイル | 中身 | 秘密か |
| --- | --- | --- |
| `~/.aws/credentials` | アクセスキーの ID とシークレット | **秘密**（平文） |
| `~/.aws/config` | リージョンや、ロールへの切り替えの設定 | 秘密ではない |

`~/.aws/config` の例（アカウント ID はダミー）:

```ini
[profile taskmgmt]
region = ap-northeast-1

[profile taskmgmt-readonly]
role_arn = arn:aws:iam::111122223333:role/ai-readonly
source_profile = taskmgmt
region = ap-northeast-1
```

`taskmgmt-readonly` には鍵が書かれていない。`source_profile` で「`taskmgmt` の鍵を使って `role_arn` のロールに切り替える」と指定している。AWS CLI が**裏で自動的に**切り替え、1 時間だけ有効な認証を受け取る。**鍵の実物は 1 本だけで済む。**

鍵の登録は、**人が自分で**打つ（鍵を AI との会話に出さないため）:

```powershell
aws configure --profile taskmgmt
```

`taskmgmt-readonly` の部分は鍵を含まないので、AI が書き足してよい。

### 5.2 鍵の作り直し（ローテーション）

鍵は、漏れていなくても定期的に作り直すとよい。1 ユーザーに鍵は 2 本まで持てるので、次の順で行う。

1. 管理者がコンソールで、作業者ユーザーの**新しい鍵を発行**する（この時点で 2 本）
2. 人が `aws configure --profile taskmgmt` で**新しい鍵を登録**する
3. `aws sts get-caller-identity --profile taskmgmt` でつながることを確かめる
4. **古い鍵を無効化**する
5. しばらく様子を見て、何も困らなければ**古い鍵を削除**する

**無効化と削除を分ける**のは、古い鍵をどこかで使っていた場合に、無効化なら有効に戻せるため。

### 5.3 鍵が漏れたときの手順

1. **すぐに鍵を無効化する。** 管理者でコンソールにログインし、作業者ユーザーの鍵を無効化する
2. **請求と、知らないリソースを確かめる。** 請求画面と、全リージョンの EC2 などを見る。見覚えのないものがあれば止める
3. 必要なら AWS サポートに連絡する
4. 新しい鍵を発行する（5.2）

> ⚠️ **「Git の履歴から消す」は対策にならない。** 公開リポジトリでは、push した時点で写し取られている可能性がある。**鍵そのものを無効にするしかない。**

### 5.4 鍵の管理方法の比較

| 方法 | 中身 | 評価 |
| --- | --- | --- |
| **リポジトリの外のファイル**（`~/.aws/credentials`） | AWS CLI の標準の置き場 | **採用。** 最も一般的。ただしファイルの中は平文 |
| OS の金庫やパスワード管理ツール | aws-vault などで暗号化して保管し、使うときだけ取り出す | 平文のファイルを無くせる。慣れてからの発展として |
| 暗号化してリポジトリに入れる | 鍵を暗号化してコミットする | **公開リポジトリでは勧めない。** 暗号化した鍵が永久に公開され、force push が禁止なので消せず、復号用の鍵の置き場という問題が残る |
| `aws login` | ブラウザでログインして**期限付きの認証**を受け取る。AWS CLI 2.37 に入っている | 今回は不採用。作業者ユーザーにコンソールのパスワードを作らないと決めていた、AI 用ロールへの切り替えと組み合わせて動くか未確認、カリキュラムが「IAM ユーザー＋アクセスキー」で進む、の 3 点 |

AWS 自身も、期限なしの鍵を減らす方向を勧めている。

---

## 6. 構築時に確認したこと

| 確かめたこと | 結果 |
| --- | --- |
| 3 つのプロファイル（構築中の管理者・作業者・AI）で AWS につながる | つながった |
| AI のプロファイルで EC2 や S3 を作ろうとする | **拒否された** |
| 作業者ユーザーで、安全装置（Lambda・スケジュール・SNS・ログ）を消す・変える | **拒否された** |
| 作業者ユーザーで、予算を消す | **拒否された** |
| 作業者ユーザーで、`ai-readonly` に `AdministratorAccess` を付ける | **拒否された** |
| 作業者ユーザーで、予算を見る | 見られた |
| 運用用の管理者で、ユーザー・ロールの作成、自分を構築用グループに戻す、自分に `AdministratorAccess` を付ける | **拒否された** |
| 運用用の管理者で、予算・ログ・安全装置の状態・IAM を見る | 見られた |
| 管理者の鍵を消した後、そのプロファイルを使う | **使えなくなった** |
| 夜間のスケジュールが実際に動いているか | 動いていた |

---

## 7. つまずいたこと（再構築時の注意）

| 起きたこと | 原因 | 対処 |
| --- | --- | --- |
| インラインポリシーを貼ると「文字数が制限を超過」 | ユーザーのインラインポリシーは**合計 2,048 文字まで**。分割しても合計で数える | カスタマー管理ポリシー（6,144 文字まで）に切り替えた。効き目と料金は同じ |
| ポリシーやロールの説明欄に入力できない | ロールの説明欄は日本語が使えず、ポリシーの説明欄は `*` が使えない（ポリシーの説明は**作成後に変更もできない**） | 英語で、`*` を使わずに書いた |
| アクセスキーの作成画面で「許可が必要」と警告 | 説明タグを入れていた。アクセスキーのタグは `iam:TagUser` で扱われ（`TagAccessKey` というアクションは無い）、管理者に無かった | タグを空にして作成 |
| AI のプロファイルが「明示的な拒否」でつながらない | `ai-readonly` を `Deny` の対象にしたとき、`NotAction` に `sts:AssumeRole` を入れ忘れた。**書き換えだけでなく、使うことまで止めていた** | `NotAction` に `sts:AssumeRole` を足した |
| 管理者がログを読めず、安全装置が動いたか確かめられない | 必要な権限を並べて作ったときに `logs:FilterLogEvents` を入れ忘れた | 運用用のポリシーに足した。**必要なものだけを並べる作り方は入れ忘れが起きやすい** |
| 運用用の管理者が、無料利用枠と請求書の画面を見られない | 上と同じ作り方の抜け。しかも、ログの件を指摘されたときに**その 2 つだけを直し、ポリシー全体を見直さなかった** | AWS 管理ポリシー `AWSBillingReadOnlyAccess` をアタッチした。**並べる作り方そのものをやめれば、同じ抜けは起きない** |
| 管理者が自分の鍵を消せない | 運用用のポリシーで、鍵を操作できる相手を作業者ユーザーだけにしていた | ルートユーザーで消した |
| ポリシーエディタに「`billing:Modify*` は存在しない」と警告 | 推測でアクション名を書いた | 公式のアクション一覧で照合し直した（1.2） |
| 管理者の権限を切り替えるときに権限を失いかけた | 構築用から先に外そうとした | **先に運用用へ追加 → 動作を確認 → 構築用から外す**の順で行う |

---

## 関連

- [インフラ構成書](infrastructure.md) — 構成、費用、安全装置の設計
- [運用手順](operations.md) — 日々の操作の手順
- [CLAUDE.md](../CLAUDE.md) — このリポジトリでの作業ルール（禁止事項を含む）
- [infra/README.md](../infra/README.md) — Terraform のファイル構成
