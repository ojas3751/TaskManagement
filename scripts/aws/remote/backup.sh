# shellcheck shell=bash
# =============================================================================
# 退避：RDS の中身を S3 に書き出す（EC2 の中で実行される）
# =============================================================================
#
# common.sh の後ろにつなげて送られる。PC 側から、common.sh の環境変数に加えて次が渡される:
#   FORCE   1 なら、件数の確認（下の 2）で止まらずに続ける。ふだんは 0
#
# 最後に「BACKUP_OK」と出たときだけ、PC 側は destroy に進む。
# それ以外で終わったら（途中で失敗・確認で止まった）、destroy しない。
#
# 終了コード:
#   0  成功（BACKUP_OK）
#   3  件数の確認で止まった（BACKUP_BLOCKED）。PC 側で人に確認を求める
#   その他  失敗

# 1. 今の件数を数える ---------------------------------------------------------
log "1/6 今の DB の、表ごとの件数を数えます"
current_counts="$(count_rows_json)"
echo "    今の件数: $current_counts"

# 2. 前回のバックアップと件数を比べる -----------------------------------------
# 前回1件以上あった表が、0 件になっている（または表ごと無くなっている）なら止める。
# 復元に失敗した空の DB を退避して、良いバックアップを押し出してしまうのを防ぐため。
log "2/6 前回のバックアップと件数を比べます"
if manifest_exists; then
  aws s3 cp "s3://$BUCKET/$MANIFEST_KEY" "$WORK/prev.json" --region "$REGION" --only-show-errors
  set +e
  CURRENT="$current_counts" python3 - "$WORK/prev.json" <<'PY'
import json, os, sys
prev = json.load(open(sys.argv[1]))["counts"]
cur = json.loads(os.environ["CURRENT"])
lost = [f"{t}: {n} 件 → {cur.get(t, '表が無い')}" for t, n in sorted(prev.items())
        if n > 0 and cur.get(t, 0) == 0]
print("    前回の件数: " + json.dumps(prev, ensure_ascii=False))
if lost:
    print("    前回はデータがあったのに、今は 0 件（または表が無い）の表があります:")
    for line in lost:
        print("      " + line)
    sys.exit(3)
PY
  check=$?
  set -e
  if [ "$check" -eq 3 ]; then
    if [ "${FORCE:-0}" = "1" ]; then
      log "    確認のうえで続けます（FORCE=1）"
    else
      echo "BACKUP_BLOCKED"
      exit 3
    fi
  elif [ "$check" -ne 0 ]; then
    echo "前回の記録を読めませんでした"
    exit 1
  fi
else
  echo "    前回のバックアップはありません（初めての退避）"
fi

# 3. 書き出す -----------------------------------------------------------------
# -Fc は PostgreSQL 独自の圧縮形式。pg_restore で戻せる。
log "3/6 DB の中身をファイルに書き出します（pg_dump）"
pg_dump -Fc --no-owner --no-privileges -f "$WORK/backup.dump"
size="$(stat -c %s "$WORK/backup.dump")"
echo "    大きさ: $size バイト"

# 4. 書き出したファイルが読めるか検査する -------------------------------------
# pg_restore --list は、ファイルの中の目次を読むだけで、DB には何もしない。
# 壊れていれば、ここで失敗する。
log "4/6 書き出したファイルが読めるか検査します（pg_restore --list）"
pg_restore --list "$WORK/backup.dump" > "$WORK/toc.txt"
# 件数が1件以上ある表は、目次に「TABLE DATA」の行があるはず
CURRENT="$current_counts" python3 - "$WORK/toc.txt" <<'PY'
import json, os, re, sys
toc = open(sys.argv[1]).read()
cur = json.loads(os.environ["CURRENT"])
missing = [t for t, n in cur.items() if n > 0
           and not re.search(r"TABLE DATA public \"?%s\"? " % re.escape(t), toc)]
if missing:
    print("    目次にデータが見つからない表: " + ", ".join(missing))
    sys.exit(1)
print("    目次の検査 OK（%d 行）" % len(toc.splitlines()))
PY

# 5. S3 に置く ----------------------------------------------------------------
# --checksum-sha256 を付けると、S3 が受け取った中身と照らし合わせ、
# 途中で壊れていたら受け取りを拒否する。
log "5/6 S3 に置きます"
checksum="$(sha256_b64 "$WORK/backup.dump")"
version_id="$(aws s3api put-object --bucket "$BUCKET" --key "$DUMP_KEY" \
  --body "$WORK/backup.dump" --checksum-algorithm SHA256 --checksum-sha256 "$checksum" \
  --query VersionId --output text --region "$REGION")"
echo "    版: $version_id"

# 置いたファイルの記録（manifest）。復元のときに、この版を取り出し、件数を照らし合わせる。
CURRENT="$current_counts" python3 - "$WORK/manifest.json" "$version_id" "$checksum" "$size" <<'PY'
import json, os, subprocess, sys
from datetime import datetime, timezone
path, version_id, checksum, size = sys.argv[1:5]
server = subprocess.run(["psql", "-XAtq", "-c", "SHOW server_version"],
                        capture_output=True, text=True, check=True).stdout.strip()
json.dump({
    "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "dump_key": "backups/latest.dump",
    "dump_version_id": version_id,
    "sha256_b64": checksum,
    "size": int(size),
    "server_version": server,
    "counts": json.loads(os.environ["CURRENT"]),
}, open(path, "w"), ensure_ascii=False, indent=2)
PY
aws s3api put-object --bucket "$BUCKET" --key "$MANIFEST_KEY" --body "$WORK/manifest.json" \
  --content-type application/json --checksum-algorithm SHA256 \
  --query VersionId --output text --region "$REGION" > /dev/null

# 6. 置けたか確かめる ---------------------------------------------------------
# S3 に「さっき置いた版」の大きさとチェックサムを聞き、手元の値と比べる。
log "6/6 S3 に正しく置けたか確かめます"
read -r s3_size s3_checksum < <(aws s3api head-object --bucket "$BUCKET" --key "$DUMP_KEY" \
  --version-id "$version_id" --checksum-mode ENABLED \
  --query "[ContentLength, ChecksumSHA256]" --output text --region "$REGION")
if [ "$s3_size" != "$size" ] || [ "$s3_checksum" != "$checksum" ]; then
  echo "    S3 の版が手元と一致しません（大きさ $s3_size / $size）"
  exit 1
fi
echo "    一致しました"

echo "BACKUP_OK"
