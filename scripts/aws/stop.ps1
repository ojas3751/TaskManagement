<#
.SYNOPSIS
作業の終わり：DB を S3 に退避し、すべて成功したときだけ、AWS のサーバーと DB を消す（destroy）。

.DESCRIPTION
リポジトリのいちばん上のフォルダで、次のように実行する:
    pwsh scripts/aws/stop.ps1

流れ:
  1. サーバーと DB が動いているか確かめる（安全装置で止まっていたら起動し直す）
  2. API を止めてから、退避（EC2 の中で pg_dump → 読めるか検査 → S3 に置く → 置けたか確認）
     ・前回1件以上あった表が 0 件になっていたら止めて、確認を求める
  3. 2 がすべて成功したときだけ、terraform destroy（消す一覧を見て yes と入力する）

terraform destroy を直接打たないこと（退避されず、データが消える）。
#>

. (Join-Path $PSScriptRoot 'lib.ps1')

$out = Get-InfraOutputs
if (-not $out.instance_id) {
    Write-Ok 'AWS には何も作られていません。退避も destroy も要りません。'
    exit 0
}

# -----------------------------------------------------------------------------
Write-Step '1/3 サーバーと DB の状態を確かめます'

$ec2State = & aws ec2 describe-instances --region $out.region --instance-ids $out.instance_id `
    --query 'Reservations[0].Instances[0].State.Name' --output text 2>$null
if ($LASTEXITCODE -ne 0 -or $ec2State -in @('terminated', 'shutting-down', 'None')) {
    Write-Bad 'サーバー（EC2）がありません。1時間何もしなかったため、アラームで終了した可能性があります。'
    Write-Bad 'DB（RDS）とその中のデータは残っています。退避するには、先にサーバーを作り直してください:'
    Write-Bad '    pwsh scripts/aws/start.ps1   （DB にデータがあるので、復元はせずにそのまま使います）'
    Write-Bad 'その後、もう一度 stop.ps1 を実行してください。destroy はしていません。'
    exit 1
}
if ($ec2State -eq 'stopped') {
    Write-Warn 'サーバーが止まっていたので、起動します（夜間の安全装置で止まった可能性があります）'
    Invoke-Aws ec2 start-instances --region $out.region --instance-ids $out.instance_id | Out-Null
    Invoke-Aws ec2 wait instance-running --region $out.region --instance-ids $out.instance_id
}

$dbState = Invoke-Aws rds describe-db-instances --region $out.region `
    --db-instance-identifier $out.db_identifier --query 'DBInstances[0].DBInstanceStatus' --output text
if ($dbState -eq 'stopped') {
    Write-Warn 'DB が止まっていたので、起動します（数分かかります）'
    Invoke-Aws rds start-db-instance --region $out.region --db-instance-identifier $out.db_identifier | Out-Null
}
if ($dbState -ne 'available') {
    Write-Host "DB が使える状態になるまで待ちます（今: $dbState）"
    Invoke-Aws rds wait db-instance-available --region $out.region --db-instance-identifier $out.db_identifier
}
Wait-ServerReady $out

# -----------------------------------------------------------------------------
Write-Step '2/3 DB を S3 に退避します'

# 退避の前に API を止める。止めずに退避すると、退避した後にブラウザから書き込んだ分が、
# destroy で消えてしまうため。退避に失敗して destroy しなかったときは、deploy.ps1 で起動し直せる。
$stopApi = Invoke-OnServer -Out $out -Body 'systemctl stop taskmgmt-api 2>/dev/null || true' -Bare
if ($stopApi.Status -ne 'Success') {
    Write-Bad 'API を止められませんでした。退避も destroy もしていません。'
    exit 1
}
Write-Host 'API を止めました（これ以降、ブラウザからの書き込みはできません）'

$r = Invoke-OnServer -Out $out -ScriptName 'backup.sh' -Env @{ FORCE = '0' }
$last = $r.Last

if ($last -eq 'BACKUP_BLOCKED') {
    Write-Host ''
    Write-Warn '前回のバックアップにはデータがあったのに、今の DB では 0 件になっている表があります（上の表示）。'
    Write-Warn '復元に失敗した空の DB を退避すると、良いバックアップが押し出されて消えてしまいます。'
    Write-Warn '自分でデータを全部消したなど、この内容で正しい場合だけ、YES と入力してください。'
    $answer = Read-Host '続けますか？（YES で続ける。それ以外は中止）'
    if ($answer -cne 'YES') {
        Write-Bad '中止しました。destroy はしていません（サーバーと DB は残っていて、料金がかかり続けます）。'
        Write-Bad 'API は止まっています。続けて使うなら deploy.ps1 で起動し直してください。'
        exit 1
    }
    $r = Invoke-OnServer -Out $out -ScriptName 'backup.sh' -Env @{ FORCE = '1' }
    $last = $r.Last
}

if ($r.Status -ne 'Success' -or $last -ne 'BACKUP_OK') {
    Write-Bad "退避に失敗しました（状態: $($r.Status)、終了コード: $($r.Code)）。"
    Write-Bad 'destroy はしていません。データは DB に残っています（料金はかかり続けます）。上の表示を確認してください。'
    Write-Bad 'API は止まっています。続けて使うなら deploy.ps1 で起動し直してください。'
    exit 1
}
Write-Ok '退避しました。'

# -----------------------------------------------------------------------------
Write-Step '3/3 AWS のサーバーと DB を消します（terraform destroy）'
& terraform "-chdir=$InfraDir" destroy
if ($LASTEXITCODE -ne 0) {
    Write-Bad 'destroy が完了しませんでした。AWS に残っているものに料金がかかり続けます。'
    Write-Bad 'もう一度 stop.ps1 を実行するか、表示を確認してください。'
    exit 1
}
Write-Ok '消しました。時間で料金が積み上がるものは、もうありません。'
