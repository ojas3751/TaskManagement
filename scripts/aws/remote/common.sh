# shellcheck shell=bash
# =============================================================================
# backup.sh と restore.sh で共通に使う準備と関数
# =============================================================================
#
# このファイルは単独では実行しない。PC のスクリプト（scripts/aws/lib.ps1）が、
# backup.sh / restore.sh の前にくっつけて EC2 に送る。
#
# PC 側から、次の環境変数が渡される:
#   REGION          AWS のリージョン
#   BUCKET          バックアップを置く S3 バケット
#   DB_HOST         RDS の住所
#   DB_NAME         データベースの名前
#   DB_USER         データベースのユーザー名
#   PASSWORD_PARAM  DB のパスワードを置いているパラメータストアの名前

set -euo pipefail

# バックアップを置く場所（バケットの中）。いつも同じ名前で上書きし、古い版は S3 が管理する。
DUMP_KEY="backups/latest.dump"
MANIFEST_KEY="backups/latest.json"

# 作業用のフォルダ。終わったら（失敗しても）消す。
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# psql / pg_dump / pg_restore が使う接続先。パスワードは画面に出さない。
export PGHOST="$DB_HOST" PGDATABASE="$DB_NAME" PGUSER="$DB_USER" PGSSLMODE=require
PGPASSWORD="$(aws ssm get-parameter --name "$PASSWORD_PARAM" --with-decryption \
  --query Parameter.Value --output text --region "$REGION")"
export PGPASSWORD

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# public スキーマにある表の数
count_tables() {
  psql -XAtq -v ON_ERROR_STOP=1 -c \
    "SELECT count(*) FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
}

# public スキーマの、表ごとの行数を JSON で返す。例: {"boards": 1, "cards": 52, "lists": 4}
# 表の名前を決め打ちにしない。試験用の表でも、アプリの表でも同じように数える。
count_rows_json() {
  psql -XAtq -v ON_ERROR_STOP=1 -c \
    "SELECT coalesce(json_object_agg(t.table_name, (xpath('/row/c/text()',
       query_to_xml(format('SELECT count(*) AS c FROM public.%I', t.table_name),
                    false, true, '')))[1]::text::bigint ORDER BY t.table_name), '{}')
     FROM information_schema.tables t
     WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'"
}

# ファイルの SHA-256 を base64 で返す（S3 のチェックサムと同じ形）。
sha256_b64() {
  openssl dgst -sha256 -binary "$1" | base64
}

# S3 に manifest（前回のバックアップの記録）があるか。あれば 0、無ければ 1。
manifest_exists() {
  local found
  found="$(aws s3api list-objects-v2 --bucket "$BUCKET" --prefix "$MANIFEST_KEY" \
    --query "length(Contents[?Key=='$MANIFEST_KEY'] || \`[]\`)" --output text --region "$REGION")"
  [ "$found" = "1" ]
}
