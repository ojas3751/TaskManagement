# =============================================================================
# セキュリティグループ（サーバーの入口の門番）
# =============================================================================
#
# サーバーに入ってくる通信（インバウンド）と、出ていく通信（アウトバウンド）のうち、
# どれを通すかを決める。書いていない通信は、すべて止められる。
#
# このアプリにはログイン機能が無いので、「自分の IP から来た通信だけ通す」ことで守る。
# SSH（サーバーに遠隔でログインする仕組み）の入口は開けない。
# サーバーに入るときは Session Manager を使う（iam.tf）。

resource "aws_security_group" "web" {
  name        = "taskmgmt-web"
  description = "Allow HTTP only from my IP" # 説明欄は英語しか使えない
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "taskmgmt-web"
  }
}

# 入ってくる通信：自分の IP からの HTTP（ポート 80。ブラウザでページを見るときの番号）だけ。
resource "aws_vpc_security_group_ingress_rule" "http_from_me" {
  security_group_id = aws_security_group.web.id
  description       = "HTTP from my IP"
  cidr_ipv4         = var.my_ip_cidr
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

# 出ていく通信：すべて許可する。
# サーバーがソフトをダウンロードしたり、Session Manager のために AWS とやり取りしたりするのに必要。
resource "aws_vpc_security_group_egress_rule" "all_out" {
  security_group_id = aws_security_group.web.id
  description       = "All outbound"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1" # -1 は「すべての種類の通信」
}
