# =============================================================================
# RDS（データベース）
# =============================================================================
#
# AWS がデータベース専用のサーバーを用意し、管理してくれるサービス。
# PC では Docker で PostgreSQL を動かしているが、AWS ではこれを使う。
#
# 料金がかかるのはここ（動かしている間だけ。単価はデプロイガイド 07）:
#   RDS 本体（db.t3.micro）、RDS のディスク（gp3 20GB）
#
# destroy すると、RDS もその中のデータも消える。そのため、作業の終わりは scripts/aws/stop.ps1 で
# S3 に退避してから destroy する（terraform destroy を直接打たない）。

# -----------------------------------------------------------------------------
# パスワード
# -----------------------------------------------------------------------------
#
# Terraform が乱数でパスワードを作り、RDS に設定する。
# 人が考えたパスワードをファイルに書かずに済む。
#
# 注意：このパスワードは Terraform の記録（terraform.tfstate）に、そのままの形で書かれる。
# state は PC の中にあり、.gitignore で Git から外してある。state を人に渡したり、
# どこかに貼り付けたりしないこと。

resource "random_password" "db" {
  length = 32
  # 記号を使わない。RDS が使えない記号（/ " @ と空白）を避けるのと、
  # 接続の文字列に入れたときに、記号の意味で誤解されないようにするため。
  special = false
}

# EC2 がパスワードを読めるように、AWS のパラメータストア（設定値の置き場）に暗号化して置く。
# 「標準」の種類は無料。暗号化には AWS が用意した鍵（aws/ssm）を使い、これも無料。
resource "aws_ssm_parameter" "db_password" {
  name        = "/taskmgmt/db/password"
  description = "Master password for the taskmgmt RDS instance"
  type        = "SecureString" # 暗号化して保存する種類
  value       = random_password.db.result
}

# -----------------------------------------------------------------------------
# DB サブネットグループ
# -----------------------------------------------------------------------------
#
# 「RDS を、この2つのプライベートサブネットのどちらかに置く」という指定（network.tf）。

resource "aws_db_subnet_group" "main" {
  name        = "taskmgmt-db"
  description = "Private subnets for the taskmgmt RDS instance"
  subnet_ids  = [aws_subnet.private_a.id, aws_subnet.private_c.id]
}

# -----------------------------------------------------------------------------
# RDS 本体
# -----------------------------------------------------------------------------

resource "aws_db_instance" "main" {
  identifier = "taskmgmt-db"

  engine         = "postgres"
  engine_version = var.db_engine_version # "17" と書くと、17 系の最新版になる
  instance_class = var.db_instance_class

  # データベースの名前とユーザー名は、PC の compose.yaml と同じにする。
  db_name  = "taskmanagement"
  username = "taskmanagement"
  password = random_password.db.result

  # ディスク：gp3 の最小（PostgreSQL では 20GiB）。保存するデータは暗号化する（追加料金なし）。
  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true

  # 置き場所：プライベートサブネット、RDS の門番、EC2 と同じアベイラビリティゾーン。
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  availability_zone      = "${var.region}a"
  publicly_accessible    = false # インターネットから直接つながる住所を持たせない

  # 1か所だけに置く。2か所（Multi-AZ）にすると、料金が2倍になる。
  multi_az = false

  # 自動バックアップを使わない。データは自分で S3 に退避する（段階 2b）。
  # 使わないほうが、作るのも早くなる。
  backup_retention_period  = 0
  delete_automated_backups = true

  # destroy のときに、消す前の写し（スナップショット）を取らない。データは S3 に退避している。
  # 予備として写しも残すかは、本物のデータを入れ始める前に決める（デプロイガイド 06 の「未確定」）。
  skip_final_snapshot = true

  # 作業のたびに消す運用なので、削除の保護はかけない。
  deletion_protection = false

  # 設定を変えたら、次の保守の時間を待たずにすぐ反映する。
  apply_immediately = true

  # 料金がかかる追加の監視機能は使わない。
  performance_insights_enabled = false
  monitoring_interval          = 0

  tags = {
    Name = "taskmgmt-db"
  }
}
