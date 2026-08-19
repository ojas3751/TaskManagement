# main への直接コミット・push、force push、Claude によるマージをブロックする。
# ルールの本体は CLAUDE.md を参照。
#
# Claude Code の PreToolUse フックとして呼ばれる。
#   exit 0 -> そのまま実行を許可
#   exit 2 -> 実行をブロックし、stderr の内容を Claude に返す

$ErrorActionPreference = 'Stop'

# 入出力を UTF-8 に固定する。既定のコンソール encoding のままだと、日本語の
# 拒否理由が文字化けして Claude に届き、理由を伝えるという目的を果たせない。
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
# 解析に失敗しても素通りさせない。素通りさせると、入力がわずかに崩れる（BOM が
# 付くなど）だけで防御が丸ごと無効になる。解析できなければ生のテキストをそのまま
# 判定に掛け、禁止パターンに当たらなければ通す。
# 標準入力も UTF-8 として明示的に読む（コンソールの encoding に左右されないため）。
$reader = New-Object IO.StreamReader([Console]::OpenStandardInput(), $utf8)
$raw = $reader.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($raw)) { exit 0 }

# BOM と前後の空白を落としてから解析する
$raw = $raw.Trim().TrimStart([char]0xFEFF).Trim()

$command = $null
try {
    $command = ($raw | ConvertFrom-Json).tool_input.command
} catch {
    $command = $raw
}
if ([string]::IsNullOrWhiteSpace($command)) { $command = $raw }

# --- 判定 -----------------------------------------------------------------
# git のサブコマンドは「git <グローバルオプション>* <サブコマンド>」の形を取る。
# `git -C path push` のような形も拾えるように、間のオプションを読み飛ばす。
$gitSub = '(?<![\w-])git\s+(?:-[^\s]+\s+|--[^\s]+(?:=[^\s]+)?\s+|-C\s+\S+\s+)*'

$isCommit = $command -match "$gitSub" + 'commit(\s|$)'
$isPush   = $command -match "$gitSub" + 'push(\s|$)'
$isMerge  = $command -match '(?<![\w-])gh\s+pr\s+merge(\s|$)'

# force push はブランチを問わず禁止
if ($isPush -and $command -match '(\s)(-f|--force|--force-with-lease)(\s|=|$)') {
    Deny @'
[ブロック] force push は禁止されています。

履歴を上書きする操作は、既に push 済みのコミットを消してしまうため
このリポジトリでは全ブランチで禁止しています（CLAUDE.md「禁止事項」）。

やり直したい場合は、打ち消しコミットを普通に push してください。
'@
}

# マージはユーザーが行う
if ($isMerge) {
    Deny @'
[ブロック] PR のマージは Claude が行いません。

PR を作成するところまでが Claude の担当です。
マージはユーザーが GitHub 上のボタンで行います（CLAUDE.md「作業の進め方」手順 5）。
PR の URL をユーザーに伝えて、そこで止まってください。
'@
}

if (-not ($isCommit -or $isPush)) { exit 0 }

# --- 現在のブランチ -------------------------------------------------------
$branch = $null
try {
    $branch = (git rev-parse --abbrev-ref HEAD 2>$null)
} catch {
    exit 0   # git リポジトリの外なら何もしない
}
if ([string]::IsNullOrWhiteSpace($branch)) { exit 0 }
$branch = $branch.Trim()

if ($branch -ne 'main') { exit 0 }

# --- main 上での commit / push を拒否 -------------------------------------
if ($isCommit) {
    Deny @'
[ブロック] main ブランチに直接コミットすることはできません。

先に次の手順を踏んでください（CLAUDE.md「作業の進め方」）。

  1. gh issue create --title "<何をするか>" --label <種類> --label <領域>
  2. git checkout -b <type>/<Issue番号>-<短い説明>
  3. その上でコミットする

既に main 上で変更を編集済みの場合、その変更は作業ディレクトリに
残ったままなので、ブランチを切ってからコミットすれば失われません。
'@
}

Deny @'
[ブロック] main ブランチへ直接 push することはできません。

GitHub 側の ruleset でも拒否されるため、この push は成功しません。
作業ブランチへ push し、PR を作ってください（CLAUDE.md「作業の進め方」）。

  git checkout -b <type>/<Issue番号>-<短い説明>
  git push -u origin <ブランチ名>
  gh pr create --fill
'@
