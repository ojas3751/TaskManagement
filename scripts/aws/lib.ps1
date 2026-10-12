# =============================================================================
# start.ps1 と stop.ps1 で共通に使う関数
# =============================================================================
#
# このファイルは単独では実行しない（start.ps1 / stop.ps1 が読み込む）。

$ErrorActionPreference = 'Stop'

# リポジトリのいちばん上のフォルダと、Terraform のフォルダ
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$InfraDir = Join-Path $RepoRoot 'infra'
$RemoteDir = Join-Path $PSScriptRoot 'remote'

# apply / destroy と、EC2 へのコマンドの送信には、作業者の鍵を使う。
$env:AWS_PROFILE = 'taskmgmt'

function Write-Step([string]$Message) {
    Write-Host ''
    Write-Host "=== $Message ===" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) { Write-Host $Message -ForegroundColor Green }
function Write-Warn([string]$Message) { Write-Host $Message -ForegroundColor Yellow }
function Write-Bad([string]$Message) { Write-Host $Message -ForegroundColor Red }

# AWS CLI を実行し、失敗したら止める。
function Invoke-Aws {
    $out = & aws @args
    if ($LASTEXITCODE -ne 0) { throw "aws $($args -join ' ') が失敗しました" }
    return $out
}

# infra の terraform output を、名前 → 値 の表にして返す。何も作っていなければ空の表。
function Get-InfraOutputs {
    $json = & terraform "-chdir=$InfraDir" output -json
    if ($LASTEXITCODE -ne 0) { throw 'terraform output が失敗しました' }
    $result = @{}
    $parsed = $json | ConvertFrom-Json
    foreach ($p in $parsed.PSObject.Properties) { $result[$p.Name] = $p.Value.value }
    return $result
}

# S3 バケット（バックアップとアプリの置き場）の名前。infra/persistent の記録から読む。
# infra をまだ apply していなくても読めるように、infra の output ではなくこちらを使う。
function Get-BucketName {
    $name = & terraform "-chdir=$(Join-Path $InfraDir 'persistent')" output -raw backup_bucket_name
    if ($LASTEXITCODE -ne 0 -or -not $name) { throw 'S3 バケットの名前を読めません（infra/persistent を apply しましたか？）' }
    return $name
}

# ファイルの SHA-256 を base64 で返す（S3 のチェックサムと、EC2 側の sha256_b64 と同じ形）。
function Get-Sha256Base64([string]$Path) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($Path)
    try { return [Convert]::ToBase64String($sha.ComputeHash($stream)) } finally { $stream.Dispose(); $sha.Dispose() }
}

# S3 にファイルを、チェックサム付きで置き、版の ID を返す。
# 途中で壊れていたら S3 が受け取りを拒否する。
function Send-S3Object([string]$Bucket, [string]$Region, [string]$Key, [string]$Path) {
    $sum = Get-Sha256Base64 $Path
    $ver = Invoke-Aws s3api put-object --region $Region --bucket $Bucket --key $Key --body $Path `
        --checksum-algorithm SHA256 --checksum-sha256 $sum --query VersionId --output text
    return @{ version_id = $ver; sha256_b64 = $sum; size = (Get-Item $Path).Length }
}

# S3 にアプリ（artifacts/latest.json）があるか
function Test-AppArtifact([string]$Bucket, [string]$Region) {
    $n = Invoke-Aws s3api list-objects-v2 --region $Region --bucket $Bucket --prefix 'artifacts/latest.json' `
        --query "length(Contents[?Key=='artifacts/latest.json'] || ``[]``)" --output text
    return ($n -eq '1')
}

# PC でアプリをビルドし、S3 の artifacts/ に置く。
#   API：backend で gradlew bootJar → jar 1つ
#   画面：frontend で npm ci → npm run build → dist の中身を tar.gz に
#   記録（latest.json）：それぞれの版の ID とチェックサム、ビルドしたコミット
function Publish-AppBuild([string]$Region = 'ap-northeast-1') {
    $bucket = Get-BucketName

    $commit = (& git -C $RepoRoot rev-parse --short HEAD).Trim()
    $dirty = [bool](& git -C $RepoRoot status --porcelain)
    if ($dirty) {
        Write-Warn 'まだコミットしていない変更があります。その変更も含めてビルドします（記録には +dirty と残します）。'
        $commit = "$commit+dirty"
    }

    Write-Host 'API をビルドします（gradlew bootJar）'
    Push-Location (Join-Path $RepoRoot 'backend')
    try {
        & .\gradlew.bat bootJar -q
        if ($LASTEXITCODE -ne 0) { throw 'API のビルドに失敗しました' }
    } finally { Pop-Location }
    $jar = Get-ChildItem (Join-Path $RepoRoot 'backend\build\libs') -Filter '*.jar' |
        Where-Object { $_.Name -notlike '*-plain.jar' } | Sort-Object LastWriteTime | Select-Object -Last 1
    if (-not $jar) { throw 'API の jar が見つかりません' }

    Write-Host '画面をビルドします（npm ci → npm run build）'
    Push-Location (Join-Path $RepoRoot 'frontend')
    try {
        & npm ci --no-audit --no-fund --loglevel=error
        if ($LASTEXITCODE -ne 0) { throw 'npm ci に失敗しました' }
        & npm run build --silent
        if ($LASTEXITCODE -ne 0) { throw '画面のビルドに失敗しました' }
    } finally { Pop-Location }

    $work = Join-Path ([System.IO.Path]::GetTempPath()) "taskmgmt-build-$([guid]::NewGuid())"
    New-Item -ItemType Directory $work | Out-Null
    try {
        $web = Join-Path $work 'web.tar.gz'
        & tar -czf $web -C (Join-Path $RepoRoot 'frontend\dist') .
        if ($LASTEXITCODE -ne 0) { throw '画面のファイルをまとめられませんでした' }

        Write-Host 'S3 に置きます'
        $jarInfo = Send-S3Object $bucket $Region 'artifacts/app.jar' $jar.FullName
        $webInfo = Send-S3Object $bucket $Region 'artifacts/web.tar.gz' $web
        $manifest = Join-Path $work 'latest.json'
        @{
            built_at = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
            commit   = $commit
            jar      = $jarInfo
            web      = $webInfo
        } | ConvertTo-Json -Depth 3 | Set-Content -Encoding ascii $manifest
        Send-S3Object $bucket $Region 'artifacts/latest.json' $manifest | Out-Null
        Write-Ok ("S3 に置きました（コミット {0}、API {1:N1} MB）" -f $commit, ($jarInfo.size / 1MB))
    } finally {
        Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# EC2 で、S3 のアプリを取り出して入れ替え、起動を確かめる。成功したら $true。
function Install-AppOnServer([hashtable]$Out) {
    $r = Invoke-OnServer -Out $Out -ScriptName 'deploy.sh'
    return ($r.Status -eq 'Success' -and $r.Last -eq 'DEPLOY_OK')
}

# EC2 が Session Manager / Run Command を受け付けるようになり、
# 起動直後の手順（ユーザーデータ：psql のインストールなど）が終わるまで待つ。
function Wait-ServerReady([hashtable]$Out) {
    $id = $Out.instance_id
    Write-Host "サーバー（$id）が命令を受け付けるようになるまで待ちます（数分かかることがあります）"
    $deadline = (Get-Date).AddMinutes(15)
    while ($true) {
        $ping = & aws ssm describe-instance-information --region $Out.region `
            --filters "Key=InstanceIds,Values=$id" `
            --query 'InstanceInformationList[0].PingStatus' --output text 2>$null
        if ($ping -eq 'Online') { break }
        if ((Get-Date) -gt $deadline) { throw 'サーバーが 15 分たっても命令を受け付けませんでした' }
        Start-Sleep -Seconds 10
    }
    Write-Host '起動直後の手順（ユーザーデータ）が終わるのを待ちます'
    $r = Invoke-OnServer -Out $Out -Body 'cloud-init status --wait > /dev/null; command -v psql pg_dump pg_restore' -Bare
    if ($r.Status -ne 'Success') { throw 'サーバーの準備が終わりませんでした（psql が入っていない可能性）' }
    Write-Ok 'サーバーの準備ができました'
}

# EC2 の中で bash の手順を実行し、終わるまで待って、結果を返す。
#   -ScriptName  remote フォルダの .sh（common.sh の後ろにつなげて送る）
#   -Body        直接送る短い手順（-Bare と一緒に使う）
#   -Env         EC2 側に渡す環境変数
# 返り値: @{ Status = 'Success' など; Code = 終了コード; Output = 画面に出たもの }
function Invoke-OnServer {
    param(
        [hashtable]$Out,
        [string]$ScriptName,
        [string]$Body,
        [hashtable]$Env = @{},
        [switch]$Bare
    )

    $commands = New-ServerCommands -Out $Out -ScriptName $ScriptName -Body $Body -Env $Env -Bare:$Bare
    $paramFile = Join-Path ([System.IO.Path]::GetTempPath()) "taskmgmt-ssm-$([guid]::NewGuid()).json"
    # 日本語を \uXXXX の形に置き換え、英数字だけのファイルにする。
    # Windows の AWS CLI は file:// のファイルを Windows の文字コード（日本語なら Shift_JIS 系）で
    # 読むため、UTF-8 の日本語がそのまま入っていると読めずに止まる。JSON の決まった書き方なので、
    # AWS 側では元の日本語に戻る。
    ConvertTo-ServerParameters $commands | Set-Content -Encoding ascii $paramFile
    try {
        $cmdId = Invoke-Aws ssm send-command --region $Out.region `
            --instance-ids $Out.instance_id --document-name AWS-RunShellScript `
            --parameters "file://$paramFile" --query 'Command.CommandId' --output text
    } finally {
        Remove-Item -LiteralPath $paramFile -ErrorAction SilentlyContinue
    }

    # 終わるまで待つ
    while ($true) {
        Start-Sleep -Seconds 3
        $inv = & aws ssm get-command-invocation --region $Out.region `
            --command-id $cmdId --instance-id $Out.instance_id --output json 2>$null
        if ($LASTEXITCODE -ne 0) { continue } # 送った直後は、まだ見つからないことがある
        $inv = $inv | ConvertFrom-Json
        if ($inv.Status -notin @('Pending', 'InProgress', 'Delayed')) { break }
    }

    $result = ConvertFrom-Invocation $inv
    if (-not $Bare) {
        if ($result.Stdout) { Write-Host $result.Stdout }
        if ($result.Stderr) { Write-Host $result.Stderr -ForegroundColor DarkGray }
    }
    return $result
}

# get-command-invocation の結果を、スクリプトが使う形にする。AWS には触らない。
# 手順の表示（標準出力）と、AWS が付け足す表示（エラー出力）を分けて扱う。
# 手順が 0 以外で終わると、AWS がエラー出力に「failed to run commands: exit status N」を
# 付け足す。結果の判断（BACKUP_OK など）は、手順の表示の最後の行（Last）だけで行う。
function ConvertFrom-Invocation($Inv) {
    $stdout = ConvertFrom-ServerOutput ([string]$Inv.StandardOutputContent).Trim()
    $stderr = ConvertFrom-ServerOutput ([string]$Inv.StandardErrorContent).Trim()
    $last = (($stdout -split "`n") | Where-Object { $_.Trim() } | Select-Object -Last 1)
    return @{
        Status = $Inv.Status
        Code   = $Inv.ResponseCode
        Stdout = $stdout
        Stderr = $stderr
        Output = (@($stdout, $stderr) | Where-Object { $_ }) -join "`n"
        Last   = if ($last) { $last.Trim() } else { '' }
    }
}

# Run Command の --parameters に渡す JSON を作る（英数字だけ）。AWS には触らない。
function ConvertTo-ServerParameters($Commands) {
    return @{ commands = $Commands; executionTimeout = @('1800') } |
        ConvertTo-Json -Depth 5 -EscapeHandling EscapeNonAscii
}

# EC2 に送る命令（Run Command の commands）を組み立てる。AWS には触らない。
function New-ServerCommands {
    param(
        [hashtable]$Out,
        [string]$ScriptName,
        [string]$Body,
        [hashtable]$Env = @{},
        [switch]$Bare
    )

    $lines = [System.Collections.Generic.List[string]]::new()
    if (-not $Bare) {
        # common.sh が使う値。パスワードそのものは渡さない（EC2 がパラメータストアから読む）。
        $vars = [ordered]@{
            REGION         = $Out.region
            BUCKET         = $Out.backup_bucket_name
            DB_HOST        = $Out.db_endpoint
            DB_NAME        = $Out.db_name
            DB_USER        = $Out.db_username
            PASSWORD_PARAM = $Out.db_password_parameter
        }
        foreach ($k in $Env.Keys) { $vars[$k] = $Env[$k] }
        foreach ($k in $vars.Keys) { $lines.Add("export $k='$($vars[$k])'") }
        foreach ($f in @('common.sh', $ScriptName)) {
            $text = Get-Content -Raw -Encoding utf8 (Join-Path $RemoteDir $f)
            foreach ($l in ($text -split "`r?`n")) { $lines.Add($l) }
        }
    } else {
        $lines.Add($Body)
    }

    # Run Command は sh で実行することがあるので、いったんファイルに書き、bash で実行する。
    $commands = [System.Collections.Generic.List[string]]::new()
    $commands.Add("cat > /tmp/taskmgmt-job.sh <<'TASKMGMT_EOF'")
    $commands.AddRange($lines)
    $commands.Add('TASKMGMT_EOF')
    # 実行して、画面に出たものを英数字だけの形（日本語は \uXXXX）にしてから返す。
    # Windows の AWS CLI は、返ってきた日本語を Windows の文字コードで出力するため、
    # 一部の文字（「表」「ソ」など）が JSON の \ と見分けがつかなくなり、受け取れなくなる。
    # PC 側で ConvertFrom-ServerOutput を使って日本語に戻す。
    $commands.Add('rc=0; bash /tmp/taskmgmt-job.sh > /tmp/taskmgmt-out.txt 2>&1 || rc=$?')
    $commands.Add('python3 -c ''import sys; sys.stdout.write(open("/tmp/taskmgmt-out.txt", encoding="utf-8", errors="replace").read().encode("ascii", "backslashreplace").decode("ascii"))''')
    $commands.Add('rm -f /tmp/taskmgmt-job.sh /tmp/taskmgmt-out.txt; exit $rc')
    return , $commands
}

# EC2 から返ってきた英数字だけの表示（\uXXXX など）を、日本語に戻す。
function ConvertFrom-ServerOutput([string]$Text) {
    if (-not $Text) { return $Text }
    $Text = [regex]::Replace($Text, '\\U([0-9a-fA-F]{8})',
        { param($m) [char]::ConvertFromUtf32([Convert]::ToInt32($m.Groups[1].Value, 16)) })
    $Text = [regex]::Replace($Text, '\\u([0-9a-fA-F]{4})',
        { param($m) [string][char][Convert]::ToInt32($m.Groups[1].Value, 16) })
    $Text = [regex]::Replace($Text, '\\x([0-9a-fA-F]{2})',
        { param($m) [string][char][Convert]::ToInt32($m.Groups[1].Value, 16) })
    return $Text
}
