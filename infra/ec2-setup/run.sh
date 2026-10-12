#!/bin/bash
# =============================================================================
# API の起動（EC2 の /opt/taskmgmt/run.sh になる。taskmgmt-api.service が呼ぶ）
# =============================================================================
#
# DB のパスワードを、起動するたびにパラメータストアから読む。
# ファイルには書かないので、ディスクにもログにも残らない。
# 環境変数（REGION・PASSWORD_PARAM・DB_URL・DB_USERNAME・JAVA_OPTS）は /etc/taskmgmt/app.env から来る。
set -euo pipefail

DB_PASSWORD="$(aws ssm get-parameter --name "$PASSWORD_PARAM" --with-decryption \
  --query Parameter.Value --output text --region "$REGION")"
export DB_PASSWORD

# exec で Java に入れ替わる（systemd が Java を直接見張れるように）
# shellcheck disable=SC2086 # JAVA_OPTS は空白で区切った複数のオプションなので、あえて分ける
exec java $JAVA_OPTS -jar /opt/taskmgmt/app.jar
