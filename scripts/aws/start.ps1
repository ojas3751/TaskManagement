<#
.SYNOPSIS
作業の始め：AWS にサーバーと DB を作り（apply）、S3 のバックアップから DB を復元する。

.DESCRIPTION
リポジトリのいちばん上のフォルダで、次のように実行する:
    pwsh scripts/aws/start.ps1

流れ:
  1. terraform apply（作る予定の一覧を見て yes と入力する）
  2. サーバーが命令を受け付けるようになるまで待つ
  3. DB が空なら、S3 の最新のバックアップから復元し、件数を照らし合わせる
     ・DB に表が既にあれば、復元しない（既にあるデータを壊さないため）
     ・バックアップがまだ無ければ、空の DB のまま始める

ここから従量課金が始まる。作業の終わりには、必ず stop.ps1 を実行する。
#>

. (Join-Path $PSScriptRoot 'lib.ps1')

Write-Step '1/3 AWS にサーバーと DB を作ります（terraform apply）'
Write-Warn 'ここから従量課金が始まります。作業の終わりには stop.ps1 を実行してください。'
& terraform "-chdir=$InfraDir" apply
if ($LASTEXITCODE -ne 0) {
    Write-Bad 'apply が完了しませんでした。復元には進みません。'
    exit 1
}
$out = Get-InfraOutputs
if (-not $out.instance_id) {
    Write-Bad 'サーバーが作られていません。復元には進みません。'
    exit 1
}

Write-Step '2/3 サーバーの準備を待ちます'
Wait-ServerReady $out

Write-Step '3/3 DB を復元します'
$r = Invoke-OnServer -Out $out -ScriptName 'restore.sh'
$last = $r.Last

if ($r.Status -eq 'Success' -and $last -eq 'RESTORE_OK') {
    Write-Ok '復元しました。件数も退避したときと一致しています。'
} elseif ($r.Status -eq 'Success' -and $last -eq 'RESTORE_NO_BACKUP') {
    Write-Warn 'バックアップがまだ無いので、空の DB のまま始めます。'
} elseif ($r.Status -eq 'Success' -and $last -eq 'RESTORE_SKIPPED_NOT_EMPTY') {
    Write-Warn 'DB に既にデータがあるので、復元しませんでした（前回の DB が残っていた可能性があります）。'
} else {
    Write-Bad "復元に失敗しました（状態: $($r.Status)、終了コード: $($r.Code)）。"
    Write-Bad 'アプリを使い始める前に、上の表示を確認してください。このまま stop.ps1 で退避すると、'
    Write-Bad '空の DB を退避しようとして、件数の確認で止まります（良いバックアップは守られます）。'
    exit 1
}

# 段階 3 で、ここに「アプリを起動する」を足す。必ず復元の後に行う。

Write-Host ''
Write-Ok "準備ができました。作業の終わりには、必ず次を実行してください: pwsh scripts/aws/stop.ps1"
