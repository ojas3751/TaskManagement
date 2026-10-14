# =============================================================================
# EC2 に持たせる権限（IAM ロール）
# =============================================================================
#
# サーバー自身が AWS の機能を使うための権限。Session Manager と、DB のパスワードを読むこと。
# Session Manager を使うと、SSH の入口を開けずに、ブラウザやコマンドからサーバーに入れる。
#
# 仕組みは3段:
#   ロール                     … 「誰がこの権限を使ってよいか」と「何をしてよいか」
#   ポリシーの紐付け           … ロールに、AWS が用意した Session Manager 用の権限を付ける
#   インスタンスプロファイル   … ロールを EC2 に渡すための入れ物（EC2 にはこれを指定する）
#
# 名前は必ず taskmgmt- で始める。作業者ユーザーが作ってよいロールを、
# この名前に限っているため（docs/security.md の 2.3）。

resource "aws_iam_role" "ec2" {
  name        = "taskmgmt-ec2"
  description = "EC2 role for Session Manager"

  # 信頼ポリシー：このロールを使ってよいのは、EC2 のサービスだけ。
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "ec2.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })
}

# AWS が用意している、Session Manager に必要な最小限の権限。
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# DB のパスワードを、パラメータストアから読む権限（rds.tf）。
# 読めるのは、このプロジェクトのパスワードの1つだけ。
# 復号に使う鍵（aws/ssm）は AWS が用意したもので、同じアカウントの中から
# パラメータストア経由で使う分には、ここで別に許可しなくてよい。
resource "aws_iam_role_policy" "read_db_password" {
  name = "read-db-password"
  role = aws_iam_role.ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "ssm:GetParameter"
        Resource = aws_ssm_parameter.db_password.arn
      }
    ]
  })
}

resource "aws_iam_instance_profile" "ec2" {
  name = "taskmgmt-ec2"
  role = aws_iam_role.ec2.name
}
