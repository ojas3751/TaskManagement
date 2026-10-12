<#
.SYNOPSIS
アプリ（画面と API）を PC でビルドし、S3 に置いて、EC2 で入れ替える。

.DESCRIPTION
リポジトリのいちばん上のフォルダで、次のように実行する:
    pwsh scripts/aws/deploy.ps1

使う場面:
  ・作業の途中で、直したアプリを AWS で確かめたいとき（サーバーは作り直さない。DB のデータもそのまま）
  ・初めてアプリを S3 に置くとき（AWS に何も作っていなくてもよい。次の start.ps1 で入る）

流れ:
  1. PC でビルド（API：gradlew bootJar、画面：npm ci → npm run build）
  2. S3 の artifacts/ に、チェックサム付きで置く
  3. EC2 が動いていれば、EC2 で取り出して入れ替え、API が応答するまで待つ

apply / destroy はしない。料金がかかり始めることも止まることもない。
#>

. (Join-Path $PSScriptRoot 'lib.ps1')

Write-Step '1/2 PC でビルドして、S3 に置きます'
Publish-AppBuild

$out = Get-InfraOutputs
if (-not $out.instance_id) {
    Write-Host ''
    Write-Ok 'AWS にサーバーがまだ無いので、ここまでにします。次の start.ps1 で、このアプリが入ります。'
    exit 0
}

Write-Step '2/2 EC2 でアプリを入れ替えます'
Wait-ServerReady $out
if (-not (Install-AppOnServer $out)) {
    Write-Bad 'アプリの入れ替えに失敗しました。上の表示（API のログ）を確認してください。'
    exit 1
}
Write-Host ''
Write-Ok "入れ替えました。ブラウザで開いてください: $($out.web_url)"
