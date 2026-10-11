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
