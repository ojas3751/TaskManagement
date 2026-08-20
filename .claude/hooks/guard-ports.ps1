# 開発サーバーを規定のポート以外で起動すること、および
# ポートが占有されたまま起動することをブロックする。
# ルールの本体は CLAUDE.md「起動ポート」を参照。
#
# Claude Code の PreToolUse フックとして呼ばれる。
#   exit 0 -> そのまま実行を許可
#   exit 2 -> 実行をブロックし、stderr の内容を Claude に返す

$ErrorActionPreference = 'Stop'

# 日本語の拒否理由が文字化けせずに Claude へ届くよう UTF-8 に固定する
# （guard-git.ps1 と同じ理由）。
$utf8 = New-Object Text.UTF8Encoding $false
try { [Console]::OutputEncoding = $utf8 } catch { }

function Deny([string]$reason) {
    $err = [Console]::OpenStandardError()
    $bytes = $utf8.GetBytes($reason + "`n")
    $err.Write($bytes, 0, $bytes.Length)
    $err.Flush()
    exit 2
}

# --- 入力を読む -----------------------------------------------------------
# 解析に失敗しても素通りさせない（guard-git.ps1 と同じ方針）。
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

# --- 判定に掛けるのは「実行される部分」だけ -------------------------------
# コミットメッセージや PR 本文は here-string（@'...'@ / @"..."@）でコマンドに
# 渡される。その中身はデータであって実行されないため、判定から外す。
#
# 外さないと、手順やエラーを記録した文章——たとえばこのフックの検証結果に
# 出てくる `--server.port=8081` ——に反応して、gh pr create や git commit が
# 止まる。実際にそれで PR の作成がブロックされた。
#
# 逆に、here-string の中に本物の起動コマンドを隠して迂回する余地は無い。
# here-string は文字列であって、そのままでは実行されないため。
$scanned = [regex]::Replace($command, "@'.*?'@", ' ', 'Singleline')
$scanned = [regex]::Replace($scanned, '@".*?"@', ' ', 'Singleline')

# --- どのサーバーを起動しようとしているか ---------------------------------
# バックエンド: gradlew bootRun
# フロントエンド: npm run dev / npx vite など（build・preview は対象外）
#
# 判定は -cmatch（大文字小文字を区別）で行う。コマンドは小文字で書かれる一方、
# 説明文には「Vite」「BootRun」のような表記が混ざるため、区別しないと
# ポートと無関係なコマンドまで巻き込む。
#
# `vite` は単語として出てくるだけでは拾わない。実際に起動される位置
# ——コマンドの先頭、`;`/`&&`/`|` の直後、npx などの直後——に限る。
$isBackend = $scanned -cmatch '(?<![\w-])bootRun(\s|$)'

$viteInvoked = ($scanned -cmatch '(^|[;&|]\s*)vite(\s|$)') -or
               ($scanned -cmatch '(?<![\w-])(npx|pnpm|yarn|bunx)\s+(--\S+\s+)*vite(\s|$)')
# vite build / vite preview はサーバーを立てないので対象外
$viteNotServer = $scanned -cmatch '(?<![\w-])vite\s+(build|preview|optimize)(\s|$)'

$isFrontend = ($scanned -cmatch '(?<![\w-])npm\s+run\s+dev(\s|$)') -or
              ($viteInvoked -and -not $viteNotServer)

if (-not ($isBackend -or $isFrontend)) { exit 0 }

$port = if ($isBackend) { 8080 } else { 3000 }
$name = if ($isBackend) { 'バックエンド (Spring Boot)' } else { 'フロントエンド (Vite)' }

# --- 別ポートでの起動を拒否 -----------------------------------------------
# 一時的に別のポートへ逃がすと、Vite の proxy 先（:8080）や
# ブラウザの入り口（:3000）と食い違って動かない。
$overrides = @(
    '--port(\s|=)',            # vite --port 5173
    '-Dserver\.port=',         # gradlew bootRun -Dserver.port=8081
    'server\.port=',           # --args='--server.port=8081'
    '\$env:PORT\s*=',          # PORT を環境変数で差し替える
    '--server\.port'
)
foreach ($pattern in $overrides) {
    if ($scanned -match $pattern) {
        Deny @"
[ブロック] $name を規定以外のポートで起動しようとしています。

このプロジェクトのポートは固定です（CLAUDE.md「起動ポート」）。

  フロントエンド (Vite)        : 3000
  バックエンド (Spring Boot)   : 8080
  データベース (PostgreSQL)    : 5432

別のポートに逃がすと、Vite の proxy 先とブラウザの入り口が食い違い、
起動はしても画面が動きません。ポートの指定を外して実行してください。

ポートが埋まっている場合は、逃がすのではなく占有側を止めます。

  pwsh -File scripts/free-port.ps1 $port
"@
    }
}

# --- ポートが埋まっていないか --------------------------------------------
$busy = @(
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
)

if ($busy.Count -eq 0) { exit 0 }

$detail = ($busy | ForEach-Object {
    $proc = Get-Process -Id $_ -ErrorAction SilentlyContinue
    $procName = if ($proc) { $proc.ProcessName } else { '(不明)' }
    "  PID $_ ($procName)"
}) -join "`n"

Deny @"
[ブロック] ポート $port が既に使われています（$name）。

占有しているプロセス:
$detail

このまま起動すると失敗するか、別のポートに逃げて画面が動かなくなります。
別ポートで起動するのではなく、先に占有側を止めてください
（CLAUDE.md「起動ポート」）。

  pwsh -File scripts/free-port.ps1 $port

止めてよいのが自分で起動した開発サーバーか、上の一覧で確認してから
実行してください。心当たりのないプロセスなら、ユーザーに確認すること。
"@
