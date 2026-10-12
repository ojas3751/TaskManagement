# infra（作業のたびに作って消す側）は、このファイルの値を、この state から読む。
# バケットの名前をコードに書かずに済む。

output "backup_bucket_name" {
  description = "バックアップを置く S3 バケットの名前"
  value       = aws_s3_bucket.backup.bucket
}

output "backup_bucket_arn" {
  description = "バックアップを置く S3 バケットの ARN（AWS の中での住所）"
  value       = aws_s3_bucket.backup.arn
}
