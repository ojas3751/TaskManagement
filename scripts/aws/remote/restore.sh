# shellcheck shell=bash
# =============================================================================
# 復元：S3 のバックアップを RDS に書き戻す（EC2 の中で実行される）
# =============================================================================
#
# common.sh の後ろにつなげて送られる。
#
# 最後に出る文字で、PC 側が結果を判断する:
#   RESTORE_OK                 書き戻して、件数も一致した
#   RESTORE_NO_BACKUP          バックアップがまだ無い（初めて）。空の DB のまま始める
#   RESTORE_SKIPPED_NOT_EMPTY  DB に表が既にある。重ねて書き戻さない
#   （それ以外で終わったら失敗）
#
# 守っていること:
#   ・DB に表が1つでもあれば、何もしない（既にあるデータを壊さない）
#   ・書き戻しは1つのトランザクションで行う（途中で失敗したら、何も書き戻さなかったことになる）
#   ・取り出したファイルを、退避したときのチェックサムと照らし合わせてから書き戻す
#   ・書き戻した後、表ごとの件数を、退避したときの件数と照らし合わせる
#
# アプリ（段階 3）は、必ずこの復元が終わってから起動する。先に起動すると、
# Flyway が空の DB に初期データを入れてしまい、上の「DB が空」の確認で復元できなくなる。

# 1. DB が空か確かめる --------------------------------------------------------
log "1/5 DB が空か確かめます"
tables="$(count_tables)"
if [ "$tables" != "0" ]; then
  echo "    DB に表が既に $tables 個あります: $(count_rows_json)"
  echo "    既にあるデータを壊さないよう、書き戻しません"
  echo "RESTORE_SKIPPED_NOT_EMPTY"
  exit 0
fi
echo "    空です"

# 2. バックアップがあるか確かめる ---------------------------------------------
log "2/5 バックアップがあるか確かめます"
if ! manifest_exists; then
  echo "    バックアップはまだありません。空の DB のまま始めます"
  echo "RESTORE_NO_BACKUP"
  exit 0
fi
aws s3 cp "s3://$BUCKET/$MANIFEST_KEY" "$WORK/manifest.json" --region "$REGION" --only-show-errors
read -r version_id expected_checksum created_at < <(python3 - "$WORK/manifest.json" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))
print(m["dump_version_id"], m["sha256_b64"], m["created_at"])
PY
)
echo "    退避した日時（世界標準時）: $created_at"

# 3. 取り出して、チェックサムを照らし合わせる ---------------------------------
log "3/5 バックアップを取り出し、中身が退避したときと同じか確かめます"
aws s3api get-object --bucket "$BUCKET" --key "$DUMP_KEY" --version-id "$version_id" \
  --checksum-mode ENABLED "$WORK/backup.dump" --region "$REGION" > /dev/null
actual_checksum="$(sha256_b64 "$WORK/backup.dump")"
if [ "$actual_checksum" != "$expected_checksum" ]; then
  echo "    チェックサムが一致しません。書き戻しません"
  exit 1
fi
pg_restore --list "$WORK/backup.dump" > /dev/null
echo "    一致しました"

# 4. 書き戻す -----------------------------------------------------------------
# --single-transaction：全部成功するか、何もしないかのどちらか
# --exit-on-error：1つでも失敗したら、そこで止める
log "4/5 DB に書き戻します（pg_restore）"
pg_restore --single-transaction --exit-on-error --no-owner --no-privileges \
  -d "$DB_NAME" "$WORK/backup.dump"

# 5. 件数を照らし合わせる -----------------------------------------------------
log "5/5 表ごとの件数を、退避したときと照らし合わせます"
restored_counts="$(count_rows_json)"
RESTORED="$restored_counts" python3 - "$WORK/manifest.json" <<'PY'
import json, os, sys
expected = json.load(open(sys.argv[1]))["counts"]
actual = json.loads(os.environ["RESTORED"])
print("    退避したとき: " + json.dumps(expected, ensure_ascii=False))
print("    書き戻した後: " + json.dumps(actual, ensure_ascii=False))
if expected != actual:
    print("    件数が一致しません")
    sys.exit(1)
PY

echo "RESTORE_OK"
