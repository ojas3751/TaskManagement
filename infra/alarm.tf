# =============================================================================
# 1時間ほぼ何もしていなければ、EC2 を終了するアラーム
# =============================================================================
#
# destroy を忘れて寝てしまったときなどの備え。CPU の使用率が低い状態が1時間続いたら、
#   ・EC2 を「終了（terminate）」する … EC2 とディスクが消え、料金が止まる
#   ・安全装置の通知先（guard-alerts）にメールを送る
#
# 知っておくこと:
#   ・終了は取り消せない。使うときは apply で作り直す
#   ・CPU で判定するので、画面を見ているだけの時間も「何もしていない」と判定されうる
#   ・終了するのは EC2 だけ。ネットワークなどの無料の部品は残るので、後で destroy する
#   ・アラームは 10 個まで無料（期限なし）
#
# アラームが EC2 を操作するには、AWS 側に AWSServiceRoleForCloudWatchEvents という
# 専用のロールが要る。このアカウントにはまだ無い。公式ドキュメントでは、アラームを作る人に
# 「そのロールを作る権限」が要るとされており、アラームを作るときに自動で作られる見込み
# （作業者ユーザーは作れることを確認済み）。最初の apply の後に、作られたかを確かめる。

# 通知先の SNS トピックを、名前で探す。
# ARN（AWS の住所）にはアカウント ID が入るので、コードに直接書かずに調べて使う。
data "aws_sns_topic" "alerts" {
  name = var.alert_topic_name
}

resource "aws_cloudwatch_metric_alarm" "idle_terminate" {
  alarm_name        = "taskmgmt-idle-terminate"
  alarm_description = "Terminate the EC2 instance when CPU stays low for 1 hour"

  # 見るもの：この EC2 の CPU 使用率
  namespace   = "AWS/EC2"
  metric_name = "CPUUtilization"
  dimensions = {
    InstanceId = aws_instance.web.id
  }

  # 判定：5分ごとの平均が 2% 未満、が 12 回続いたら（= 1時間）
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 12
  comparison_operator = "LessThanThreshold"
  threshold           = 2

  # データが届かない時間は「判定しない」。
  # EC2 を操作するアラームでは、AWS の公式ドキュメントがこの設定を勧めている。
  treat_missing_data = "missing"

  alarm_actions = [
    "arn:aws:automate:${var.region}:ec2:terminate",
    data.aws_sns_topic.alerts.arn,
  ]
}
