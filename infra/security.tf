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

# （出ていく通信のルールは、この下）

# -----------------------------------------------------------------------------
# RDS の門番
# -----------------------------------------------------------------------------
#
# 「EC2 の門番（上の taskmgmt-web）を通ってきた通信」だけを、PostgreSQL のポート 5432 で通す。
# IP アドレスではなく「どの門番から来たか」で指定するので、EC2 を作り直して IP が変わっても困らない。
# 自分の PC からも、インターネットからも、RDS に直接はつながらない。

resource "aws_security_group" "db" {
  name        = "taskmgmt-db"
  description = "Allow PostgreSQL only from the web server"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "taskmgmt-db"
  }
}

resource "aws_vpc_security_group_ingress_rule" "postgres_from_web" {
  security_group_id            = aws_security_group.db.id
  description                  = "PostgreSQL from the web server"
  referenced_security_group_id = aws_security_group.web.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

# RDS の門番には、出ていく通信のルールを書かない（RDS から外へ通信する必要が無いため）。
# Terraform は、AWS が自動で付ける「全部許可」のルールを消してくれる。

# -----------------------------------------------------------------------------
# EC2 の門番の、出ていく通信
# -----------------------------------------------------------------------------

# 出ていく通信：すべて許可する。
# サーバーがソフトをダウンロードしたり、Session Manager のために AWS とやり取りしたりするのに必要。
resource "aws_vpc_security_group_egress_rule" "all_out" {
  security_group_id = aws_security_group.web.id
  description       = "All outbound"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1" # -1 は「すべての種類の通信」
}
