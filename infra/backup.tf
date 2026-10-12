# =============================================================================
# バックアップ（S3 への退避と復元）のための設定
# =============================================================================
#
# バックアップの置き場（S3 バケット）そのものは infra/persistent で作る。
# ここでは、それを使うための「通り道」と「権限」だけを作る。どれも無料。
#
# 先に infra/persistent で apply しておく必要がある（README）。

# infra/persistent の記録（state）から、バケットの名前を読む。
# 名前をコードに書かずに済み、persistent 側で名前が変わっても追いかけられる。
data "terraform_remote_state" "persistent" {
  backend = "local"

  config = {
    path = "${path.module}/persistent/terraform.tfstate"
  }
}

locals {
  backup_bucket_name = data.terraform_remote_state.persistent.outputs.backup_bucket_name
  backup_bucket_arn  = data.terraform_remote_state.persistent.outputs.backup_bucket_arn
}

# S3 への近道（ゲートウェイエンドポイント）。
# EC2 から S3 への通信が、インターネットの出入口を通らず、VPC の中から直接届くようになる。
# 公式ドキュメントで「追加料金なし」と明記されている。
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"

  # EC2 が置かれているサブネットの経路の表に、「S3 行きはここへ」という経路が自動で足される。
  route_table_ids = [aws_route_table.public.id]

  tags = {
    Name = "taskmgmt-s3"
  }
}

# EC2 に、バックアップの置き場の backups/ の中だけを読み書きする権限を持たせる。
# 消す権限は持たせない（古い版は S3 のライフサイクルルールが消す）。
resource "aws_iam_role_policy" "backup_bucket" {
  name = "backup-bucket"
  role = aws_iam_role.ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # ファイルを置く・取り出す（版を指定して取り出すことも含む）
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:GetObjectVersion",
        ]
        Resource = "${local.backup_bucket_arn}/backups/*"
      },
      {
        # backups/ の中にファイルがあるかを調べる
        # （これが無いと、ファイルが無いときに「無い」ではなく「権限が無い」と返ってくる）
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = local.backup_bucket_arn
        Condition = {
          StringLike = { "s3:prefix" = ["backups/*"] }
        }
      },
    ]
  })
}
