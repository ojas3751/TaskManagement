# =============================================================================
# アプリ（画面と API）を EC2 に運ぶための権限
# =============================================================================
#
# PC でビルドしたアプリ（API の jar と、画面のファイル）は、バックアップと同じ S3 バケットの
# artifacts/ に置く（置くのは PC の作業者ユーザー。scripts/aws/deploy.ps1）。
# EC2 は、そこから取ってくるだけ。置く・消す権限は持たせない。

resource "aws_iam_role_policy" "app_artifacts" {
  name = "app-artifacts"
  role = aws_iam_role.ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # アプリのファイルを取り出す（版を指定して取り出すことも含む）
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion",
        ]
        Resource = "${local.backup_bucket_arn}/artifacts/*"
      },
      {
        # artifacts/ の中にファイルがあるかを調べる
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = local.backup_bucket_arn
        Condition = {
          StringLike = { "s3:prefix" = ["artifacts/*"] }
        }
      },
    ]
  })
}
