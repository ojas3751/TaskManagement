# AWS と Terraform について、AI に実行させない操作をブロックする。
# - Terraform で実物を変えるコマンド（apply / destroy など）
# - AWS の削除系コマンド
# - 読み取り専用以外のプロファイルの使用、認証情報の直接指定
# - 認証情報ファイル（~/.aws/credentials）を読むこと、キーを表示するコマンド
#
# settings.json の deny は「コマンドの先頭一致」なので、`terraform -chdir=infra apply`
# のように途中にオプションが挟まるとすり抜ける。こちらはコマンド全体を調べる本命の歯止め。
#
# Claude Code の PreToolUse フックとして呼ばれる。
#   exit 0 -> そのまま実行を許可
#   exit 2 -> 実行をブロックし、stderr の内容を Claude に返す

$ErrorActionPreference = 'Stop'

# 入出力を UTF-8 に固定する（理由は guard-git.ps1 と同じ）
$utf8 = New-Object Text.UTF8Encoding $false
try { [Console]::OutputEncoding = $utf8 } catch { }

function Deny([string]$reason) {
    $err = [Console]::OpenStandardError()
    $bytes = $utf8.GetBytes($reason + "`n")
    $err.Write($bytes, 0, $bytes.Length)
    $err.Flush()
    exit 2
}

# --- 入力（フックのペイロード）を読む -------------------------------------
# 解析に失敗しても素通りさせない（理由は guard-git.ps1 と同じ）
$reader = New-Object IO.StreamReader([Console]::OpenStandardInput(), $utf8)
$raw = $reader.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($raw)) { exit 0 }

$raw = $raw.Trim().TrimStart([char]0xFEFF).Trim()

$command = $null
try {
    $command = ($raw | ConvertFrom-Json).tool_input.command
} catch {
    $command = $raw
}
if ([string]::IsNullOrWhiteSpace($command)) { $command = $raw }

$readonlyProfile = 'taskmgmt-readonly'

# --- 判定 -----------------------------------------------------------------
# terraform のサブコマンドは「terraform <グローバルオプション>* <サブコマンド>」の形を取る。
# `terraform -chdir=infra apply` のような形も拾えるように、間のオプションを読み飛ばす。
$tfSub = '(?<![\w-])terraform(?:\.exe)?\s+(?:-[^\s]+\s+)*'

if ($command -match ($tfSub + '(apply|destroy|import|taint|untaint|force-unlock)(\s|$)') -or
    $command -match ($tfSub + 'state\s+(rm|mv|push|replace-provider)(\s|$)')) {
    Deny @'
[ブロック] Terraform で AWS の実物を変えるコマンドは、AI には実行させません。

apply / destroy などは、課金が始まる・データが消えるといった取り返しのつかない
結果を伴うため、ユーザーが自分で打つ分担にしています。

AI の担当は .tf を書くこと、terraform fmt / validate / plan を実行して結果を読むことです。
実行が必要な場合は、打つべきコマンドをユーザーに伝えて、そこで止まってください。
'@
}

$awsCmd = '(?<![\w-])aws(?:\.exe)?\s'

if ($command -match ($awsCmd + '.*?(?<![\w-])(delete-|terminate-)[\w-]+') -or
    $command -match ($awsCmd + '\s*s3\s+(rm|rb|mv)(\s|$)')) {
    Deny @'
[ブロック] AWS の削除系コマンドは、AI には実行させません。

削除は取り消せないため、必要な場合はユーザーが実行します。
何を消す必要があるのかをユーザーに伝えて、そこで止まってください。
'@
}

# 読み取り専用以外のプロファイル（--profile / AWS_PROFILE）
$profileFlag = '--profile(?:\s+|=)[''"]?(?!' + [regex]::Escape($readonlyProfile) + '(?![\w-]))[\w.-]+'
$profileEnv  = 'AWS_PROFILE[''"]?\s*=\s*[''"]?(?!' + [regex]::Escape($readonlyProfile) + '(?![\w-]))[\w.-]+'

if ($command -match $profileFlag -or $command -match $profileEnv) {
    Deny @"
[ブロック] AI が使ってよい AWS のプロファイルは $readonlyProfile だけです。

書き込みのできるプロファイルを AI が使うと、AWS 側の読み取り専用ロールという
最後の歯止めが効かなくなります。

--profile $readonlyProfile（または AWS_PROFILE=$readonlyProfile）で実行し直してください。
書き込みが必要な作業なら、打つべきコマンドをユーザーに伝えて、そこで止まってください。
"@
}

# 認証情報を環境変数で直接渡すこと
if ($command -match '(?<![\w])AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN)(?![\w])') {
    Deny @'
[ブロック] AWS の認証情報を環境変数で扱う操作は、AI には実行させません。

キーの値を AI が扱うと、会話のログに残るおそれがあります。
AWS へのアクセスは --profile taskmgmt-readonly だけで行ってください。
'@
}

# 認証情報ファイルを読むこと、キーを表示するコマンド
if ($command -match '\.aws[\\/]+credentials' -or
    $command -match ($awsCmd + '\s*configure\s+(get|export-credentials)(\s|$)')) {
    Deny @'
[ブロック] AWS の認証情報ファイルを読む操作、キーを表示する操作は、AI には実行させません。

~/.aws/credentials にはシークレットアクセスキーが平文で入っています。
AI はコマンド経由でプロファイルを使うだけで、キーの中身を知る必要はありません。
'@
}

exit 0
