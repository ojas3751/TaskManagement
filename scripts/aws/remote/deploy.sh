# shellcheck shell=bash
# =============================================================================
# アプリの入れ替え：S3 のアプリ（API の jar と画面のファイル）を取り出して、起動する
# （EC2 の中で実行される）
# =============================================================================
#
# common.sh の後ろにつなげて送られる。
# アプリは、PC の deploy.ps1 が S3 の artifacts/ に置いたもの。記録（latest.json）に書かれた版を使う。
#
# 最後に「DEPLOY_OK」と出たときだけ、成功。
#   DEPLOY_NO_ARTIFACT  S3 にアプリがまだ無い（PC で deploy.ps1 を一度実行する）
#   （それ以外で終わったら失敗。ログを表示する）

APP_MANIFEST_KEY="artifacts/latest.json"
JAR_KEY="artifacts/app.jar"
WEB_KEY="artifacts/web.tar.gz"
WEB_DIR="/usr/share/nginx/taskmgmt"
# API が使ってよいメモリの上限。PC で EC2 と同じ条件にして測り、約 270MB で動いた（段階 3）
JAVA_OPTS="-Xmx256m"
# API が応答するまで待つ時間（秒）。CPU が遅い作った直後は、起動に 1 分少しかかる
START_TIMEOUT=420

# 1. アプリの記録を読む ---------------------------------------------------------
log "1/6 S3 にあるアプリの記録を読みます"
found="$(aws s3api list-objects-v2 --bucket "$BUCKET" --prefix "$APP_MANIFEST_KEY" \
  --query "length(Contents[?Key=='$APP_MANIFEST_KEY'] || \`[]\`)" --output text --region "$REGION")"
if [ "$found" != "1" ]; then
  echo "    S3 にアプリがまだありません。PC で deploy.ps1 を実行してください"
  echo "DEPLOY_NO_ARTIFACT"
  exit 1
fi
aws s3 cp "s3://$BUCKET/$APP_MANIFEST_KEY" "$WORK/app.json" --region "$REGION" --only-show-errors
read -r jar_ver jar_sha web_ver web_sha commit built_at < <(python3 - "$WORK/app.json" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))
print(m["jar"]["version_id"], m["jar"]["sha256_b64"], m["web"]["version_id"],
      m["web"]["sha256_b64"], m["commit"], m["built_at"])
PY
)
echo "    ビルドしたコミット: $commit（$built_at）"

# 2. 取り出して、チェックサムを照らし合わせる -----------------------------------
log "2/6 アプリを取り出し、PC でビルドしたものと同じか確かめます"
aws s3api get-object --bucket "$BUCKET" --key "$JAR_KEY" --version-id "$jar_ver" \
  "$WORK/app.jar" --region "$REGION" > /dev/null
aws s3api get-object --bucket "$BUCKET" --key "$WEB_KEY" --version-id "$web_ver" \
  "$WORK/web.tar.gz" --region "$REGION" > /dev/null
if [ "$(sha256_b64 "$WORK/app.jar")" != "$jar_sha" ] || [ "$(sha256_b64 "$WORK/web.tar.gz")" != "$web_sha" ]; then
  echo "    チェックサムが一致しません。入れ替えません"
  exit 1
fi
mkdir "$WORK/web"
tar -xzf "$WORK/web.tar.gz" -C "$WORK/web"
if [ ! -f "$WORK/web/index.html" ]; then
  echo "    画面のファイルに index.html がありません。入れ替えません"
  exit 1
fi
echo "    一致しました（API $(stat -c %s "$WORK/app.jar") バイト、画面 $(tar -tzf "$WORK/web.tar.gz" | grep -vc '/$') ファイル）"

# 3. 入れ替える -----------------------------------------------------------------
log "3/6 API を止めて、アプリを入れ替えます"
systemctl stop taskmgmt-api || true
install -m 644 -o root -g root "$WORK/app.jar" /opt/taskmgmt/app.jar
# 画面は、別の場所に置いてから名前を付け替える（入れ替えの途中の、半端な状態を見せない）
chmod -R a+rX "$WORK/web"
rm -rf "$WEB_DIR.new" "$WEB_DIR.old"
cp -r "$WORK/web" "$WEB_DIR.new"
mv "$WEB_DIR" "$WEB_DIR.old"
mv "$WEB_DIR.new" "$WEB_DIR"
rm -rf "$WEB_DIR.old"

# 4. 接続先を書く ---------------------------------------------------------------
# パスワードは書かない（API の起動の直前に run.sh がパラメータストアから読む）。
# RDS は暗号化した接続を求めるので、sslmode=require を付ける。
log "4/6 API の接続先を書きます（パスワードは書きません）"
cat > /etc/taskmgmt/app.env <<EOF
REGION=$REGION
PASSWORD_PARAM=$PASSWORD_PARAM
DB_URL=jdbc:postgresql://$DB_HOST:5432/$DB_NAME?sslmode=require
DB_USERNAME=$DB_USER
JAVA_OPTS=$JAVA_OPTS
EOF
chown root:taskmgmt /etc/taskmgmt/app.env
chmod 640 /etc/taskmgmt/app.env

# 5. API を起動し、応答するまで待つ ----------------------------------------------
log "5/6 API を起動し、応答するまで待ちます（作った直後は 1 分少しかかります）"
systemctl start taskmgmt-api
started=$(date +%s)
until [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/api/board || true)" = "200" ]; do
  if [ $(( $(date +%s) - started )) -ge $START_TIMEOUT ]; then
    echo "    $START_TIMEOUT 秒たっても API が応答しません。API のログの最後:"
    journalctl -u taskmgmt-api -n 40 --no-pager
    exit 1
  fi
  sleep 5
done
echo "    応答しました（$(( $(date +%s) - started )) 秒）"

# 6. nginx を通して確かめる -----------------------------------------------------
log "6/6 nginx を通して、画面と API が返るか確かめます"
systemctl reload nginx
page="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/)"
api="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/api/board)"
echo "    画面: HTTP $page、API: HTTP $api"
if [ "$page" != "200" ] || [ "$api" != "200" ]; then
  echo "    nginx を通すと応答しません"
  exit 1
fi
echo "    メモリ: $(free -m | awk '/^Mem:/ {print "使用 " $3 "MB / 全体 " $2 "MB"}')"

echo "DEPLOY_OK"
