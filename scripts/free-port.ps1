# 指定したポートを占有しているプロセスを止めて、ポートを解放する。
# ルールの本体は CLAUDE.md「起動ポート」を参照。
#
#   pwsh -File scripts/free-port.ps1 8080
#   pwsh -File scripts/free-port.ps1 3000 8080
#
# ポートが空いていれば何もしない（何度実行しても同じ結果になる）。

param(
    [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)]
    [int[]]$Port
)

$ErrorActionPreference = 'Stop'

# このアプリが使うポート以外は誤って止めないようにする。
# 5432 を含めないのは、DB が Docker 管理であり、止めるなら
# `docker compose down` を使うべきだから（プロセスを直接 kill すると
# コンテナの状態と食い違う）。
$Allowed = @(3000, 8080)

# 失敗は必ず 0 以外で終わらせる。Write-Error だけだと終了コードが
# 呼び出し側から見て曖昧になり、失敗を成功と取り違える。
function Fail([string]$message) {
    [Console]::Error.WriteLine($message)
    exit 1
}

foreach ($p in $Port) {
    if ($Allowed -notcontains $p) {
        Fail "ポート $p はこのスクリプトの対象外です。対象は $($Allowed -join ', ') のみ。
DB (5432) を止める場合は docker compose down を使ってください。"
    }
}

foreach ($p in $Port) {
    # Listen 状態の所有プロセスだけを見る。TIME_WAIT などの残骸は
    # 掴んでいる相手がいないので、止める対象にならない。
    $owners = @(
        Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
    )

    if ($owners.Count -eq 0) {
        Write-Host "ポート $p : 空いています。"
        continue
    }

    foreach ($processId in $owners) {
        $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
        $name = if ($proc) { $proc.ProcessName } else { '(不明)' }

        Write-Host "ポート $p : PID $processId ($name) が占有しています。停止します。"
        try {
            Stop-Process -Id $processId -Force -ErrorAction Stop
        } catch {
            Fail "PID $processId ($name) を停止できませんでした: $($_.Exception.Message)"
        }
    }

    # 停止は非同期なので、実際に空くまで待つ。待たずに起動すると
    # 起動側が「使用中」と判断して落ちる。
    $freed = $false
    foreach ($i in 1..30) {
        Start-Sleep -Milliseconds 200
        $still = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
        if (-not $still) { $freed = $true; break }
    }

    if (-not $freed) {
        Fail "ポート $p を解放できませんでした。占有しているプロセスを手動で確認してください。"
    }
    Write-Host "ポート $p : 解放しました。"
}
