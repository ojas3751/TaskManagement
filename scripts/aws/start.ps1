<#
.SYNOPSIS
作業の始め：AWS にサーバーと DB を作り（apply）、S3 のバックアップから DB を復元して、アプリを起動する。

.DESCRIPTION
リポジトリのいちばん上のフォルダで、次のように実行する:
    pwsh scripts/aws/start.ps1

流れ:
  1. terraform apply（作る予定の一覧を見て yes と入力する）
  2. サーバーが命令を受け付けるようになるまで待つ
  3. DB が空なら、S3 の最新のバックアップから復元し、件数を照らし合わせる
     ・DB に表が既にあれば、復元しない（既にあるデータを壊さないため）
     ・バックアップがまだ無ければ、空の DB のまま始める
  4. アプリ（画面と API）を S3 から取り出して起動する。必ず 3 の後に行う
     （先に API を起動すると、Flyway が空の DB に初期データを入れ、3 の「DB が空」の確認で復元できなくなる）
     ・S3 にアプリがまだ無ければ、PC でビルドして置いてから起動する

ここから従量課金が始まる。作業の終わりには、必ず stop.ps1 を実行する。
#>

. (Join-Path $PSScriptRoot 'lib.ps1')

Write-Step '1/4 AWS にサーバーと DB を作ります（terraform apply）'
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

Write-Step '2/4 サーバーの準備を待ちます'
Wait-ServerReady $out

Write-Step '3/4 DB を復元します'
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
    Write-Bad 'アプリは起動していません。上の表示を確認してください。このまま stop.ps1 で退避すると、'
    Write-Bad '空の DB を退避しようとして、件数の確認で止まります（良いバックアップは守られます）。'
    exit 1
}

Write-Step '4/4 アプリ（画面と API）を起動します'
if (-not (Test-AppArtifact (Get-BucketName) $out.region)) {
    Write-Warn 'S3 にアプリがまだ無いので、PC でビルドして置きます。'
    Publish-AppBuild $out.region
}
if (-not (Install-AppOnServer $out)) {
    Write-Bad 'アプリの起動に失敗しました。上の表示（API のログ）を確認してください。'
    Write-Bad 'サーバーと DB は動いています（料金がかかっています）。直したら deploy.ps1、やめるなら stop.ps1 を実行してください。'
    exit 1
}

Write-Host ''
Write-Ok "準備ができました。ブラウザで開いてください: $($out.web_url)"
Write-Ok '作業の終わりには、必ず次を実行してください: pwsh scripts/aws/stop.ps1'
