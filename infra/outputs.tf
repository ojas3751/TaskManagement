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
