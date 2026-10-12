# =============================================================================
# バックアップの置き場（S3 バケット）
# =============================================================================
#
# DB の中身を書き出したファイル（backups/）と、PC でビルドしたアプリ（artifacts/）を置く場所。
# 作業のたびに消さない。
#
# 料金は置いた量だけ（$0.025 / GB・月）。バックアップは数 MB なので、月 $0.001 未満。
#
# 2世代だけ残す仕組み:
#   ・いつも同じ名前（backups/latest.dump など）で上書きする
#   ・バージョニングを有効にして、上書きされた「1つ前の版」を S3 に残させる
#   ・ライフサイクルルールで、それより古い版を S3 に自動で消させる
#   → 「最新」と「1つ前」の2世代が残る。人も AI も、削除の操作をしなくて済む

# バケットの名前は、世界中の S3 で重ならないものにする必要がある。
# アカウント ID を名前に入れると公開のリポジトリから分かってしまうので、ランダムな文字を付ける。
resource "random_id" "bucket_suffix" {
  byte_length = 4 # 16進数で 8 文字
}

resource "aws_s3_bucket" "backup" {
  bucket = "taskmgmt-backup-${random_id.bucket_suffix.hex}"

  # 中にファイルが残っていたら、バケットを消せないようにする（既定どおり）。
  force_destroy = false

  lifecycle {
    # このフォルダで terraform destroy を打っても、バケットを消さずにエラーで止める。
    # 本当に消したいときは、この行を消してから destroy する（データを PC に落としてから）。
    prevent_destroy = true
  }
}

# インターネットに公開しない（すべての「公開」の設定を禁止する）。
resource "aws_s3_bucket_public_access_block" "backup" {
  bucket = aws_s3_bucket.backup.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# 置いたファイルを暗号化する。S3 が管理する鍵（SSE-S3）を使い、追加料金はかからない。
resource "aws_s3_bucket_server_side_encryption_configuration" "backup" {
  bucket = aws_s3_bucket.backup.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# バージョニング：同じ名前で上書きしても、前の版を消さずに残す。
resource "aws_s3_bucket_versioning" "backup" {
  bucket = aws_s3_bucket.backup.id

  versioning_configuration {
    status = "Enabled"
  }
}

# ライフサイクルルール：古い版を自動で消す。
resource "aws_s3_bucket_lifecycle_configuration" "backup" {
  bucket = aws_s3_bucket.backup.id

  # バージョニングを有効にしてから設定する。
  depends_on = [aws_s3_bucket_versioning.backup]

  rule {
    id     = "keep-two-generations"
    status = "Enabled"

    filter {
      prefix = "backups/"
    }

    # 「1つ前の版」より古い版を消す。
    # S3 の決まりで、版が古くなってから1日以上たったものだけが消える対象になる。
    # そのため、1日に何回も退避した日は、一時的に3世代以上残ることがある（料金はわずか）。
    noncurrent_version_expiration {
      noncurrent_days           = 1
      newer_noncurrent_versions = 1
    }

    # アップロードが途中で失敗して残った断片を、1日で片付ける。
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  # PC でビルドしたアプリ（scripts/aws/deploy.ps1 が置く）も、同じく「最新＋1つ前」だけ残す。
  # API の jar が約 51MB なので、2世代で約 100MB、月 $0.003 程度。
  rule {
    id     = "keep-two-app-builds"
    status = "Enabled"

    filter {
      prefix = "artifacts/"
    }

    noncurrent_version_expiration {
      noncurrent_days           = 1
      newer_noncurrent_versions = 1
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}
