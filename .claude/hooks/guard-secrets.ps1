# git commit の直前に、変更の中に AWS のキーや秘密鍵らしき文字列が無いかを調べ、
# 見つかったらコミットをブロックする。
#
# このリポジトリは PUBLIC なので、push した時点で公開される。CI や PR のチェックでは手遅れ。
# コミットより手前で止めるのが目的。人が手で打つコミットは gitleaks（pre-commit）が守る。
#
# フックはコマンドの実行「前」に動くため、`git add X && git commit` の形だと、判定の時点では
# まだ何も追加されていない。そのため、追加済みの変更に限らず、追跡中のファイルの未追加の変更と、
# 追跡していない新しいファイルも含めて調べる（広めに調べて取りこぼしを無くす）。
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

# git commit 以外は対象外（git のグローバルオプションの読み飛ばしは guard-git.ps1 と同じ）
$gitSub = '(?<![\w-])git\s+(?:-[^\s]+\s+|--[^\s]+(?:=[^\s]+)?\s+|-C\s+\S+\s+)*'
if ($command -notmatch ($gitSub + 'commit(\s|$)')) { exit 0 }

# --- 調べる対象を集める ---------------------------------------------------
try {
    $null = git rev-parse --is-inside-work-tree 2>$null
} catch {
    exit 0
}

# 追跡中のファイルの変更（追加済み・未追加の両方）の「追加された行」だけを見る
$added = @()
$diff = git diff HEAD --no-color --unified=0 2>$null
if ($LASTEXITCODE -ne 0) {
    # 最初のコミットなど HEAD が無いとき
    $diff = git diff --cached --no-color --unified=0 2>$null
}
$file = $null
foreach ($line in $diff) {
    if ($line -match '^\+\+\+ b/(.+)$') { $file = $Matches[1]; continue }
    if ($line -match '^\+(?!\+\+)') { $added += [pscustomobject]@{ File = $file; Text = $line.Substring(1) } }
}

# 追跡していない新しいファイル（.gitignore で除外されたものは対象外）
$untracked = git ls-files --others --exclude-standard 2>$null
foreach ($f in $untracked) {
    if (-not (Test-Path -LiteralPath $f -PathType Leaf)) { continue }
    if ((Get-Item -LiteralPath $f).Length -gt 1MB) { continue }
    try {
        foreach ($line in [IO.File]::ReadAllLines((Resolve-Path -LiteralPath $f), $utf8)) {
            $added += [pscustomobject]@{ File = $f; Text = $line }
        }
    } catch { }
}

# --- 判定 -----------------------------------------------------------------
# AWS 公式ドキュメントの例示用の値は、説明のために書いてよい
$allow = @('AKIAIOSFODNN7EXAMPLE', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')

$patterns = [ordered]@{
    'AWS のアクセスキー ID'       = '(?<![A-Z0-9])(AKIA|ASIA)[A-Z0-9]{16}(?![A-Z0-9])'
    'AWS のシークレットアクセスキー' = '(?i)aws_secret_access_key\s*[=:]\s*[''"]?[A-Za-z0-9/+=]{40}'
    'AWS のセッショントークン'     = '(?i)aws_session_token\s*[=:]\s*[''"]?[A-Za-z0-9/+=]{100,}'
    '秘密鍵'                    = '-----BEGIN ([A-Z]+ )?PRIVATE KEY-----'
}

$hits = @()
foreach ($a in $added) {
    $text = $a.Text
    foreach ($v in $allow) { $text = $text.Replace($v, '') }
    foreach ($name in $patterns.Keys) {
        if ($text -match $patterns[$name]) {
            $hits += "  - $($a.File)：$name"
        }
    }
}

if ($hits.Count -eq 0) { exit 0 }

$list = ($hits | Select-Object -Unique) -join "`n"
Deny @"
[ブロック] 変更の中に、秘密情報らしき文字列が見つかりました。コミットを止めます。

$list

このリポジトリは PUBLIC なので、push した時点で公開されます。
該当の行を取り除いてから、コミットし直してください。
本物のキーだった場合は、コミットしていなくても漏えいの可能性を考え、
ユーザーに伝えてキーの無効化と作り直しを相談してください。

（例示には AWS 公式のダミー値 AKIAIOSFODNN7EXAMPLE を使ってください）
"@
