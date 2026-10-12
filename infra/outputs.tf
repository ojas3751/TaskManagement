# =============================================================================
# 出力（apply の後に表示する値）
# =============================================================================
#
# apply が終わると、ここに書いた値が画面に表示される。
# 後から見たいときは terraform output で表示できる。

output "instance_id" {
  description = "EC2 の ID。Session Manager で入るときに使う"
  value       = aws_instance.web.id
}

output "web_url" {
  description = "動作確認用のページの URL。自分の IP からだけ開ける"
  value       = "http://${aws_instance.web.public_ip}/"
}

output "session_manager_command" {
  description = "サーバーに入るコマンド（Session Manager プラグインが必要）"
  value       = "aws ssm start-session --target ${aws_instance.web.id} --region ${var.region}"
}

output "db_endpoint" {
  description = "RDS の住所（VPC の中からだけ使える）"
  value       = aws_db_instance.main.address
}

# 以下は、退避・復元のスクリプト（scripts/aws/）が読む値。
output "region" {
  description = "AWS のリージョン"
  value       = var.region
}

output "db_identifier" {
  description = "RDS の名前"
  value       = aws_db_instance.main.identifier
}

output "db_name" {
  description = "データベースの名前"
  value       = aws_db_instance.main.db_name
}

output "db_username" {
  description = "データベースのユーザー名"
  value       = aws_db_instance.main.username
}

output "db_password_parameter" {
  description = "DB のパスワードを置いているパラメータストアの名前（パスワードそのものではない）"
  value       = aws_ssm_parameter.db_password.name
}

output "backup_bucket_name" {
  description = "バックアップを置く S3 バケットの名前（infra/persistent で作ったもの）"
  value       = local.backup_bucket_name
}

# EC2 の中で RDS につなぐためのコマンド。パスワードはパラメータストアから読むので、画面に出ない。
# パスワードそのものは出力しない（出したい場合も、state に書かれているので、取り扱いに注意）。
output "db_connect_command" {
  description = "EC2 の中で実行すると RDS につながるコマンド"
  value = join(" ", [
    "PGPASSWORD=$(aws ssm get-parameter --name ${aws_ssm_parameter.db_password.name}",
    "--with-decryption --query Parameter.Value --output text --region ${var.region})",
    "psql \"host=${aws_db_instance.main.address} dbname=${aws_db_instance.main.db_name}",
    "user=${aws_db_instance.main.username} sslmode=require\"",
  ])
}
