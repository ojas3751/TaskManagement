# =============================================================================
# ネットワーク
# =============================================================================
#
# サーバーを置くための「自分専用のネットワーク」を作る。部品は5つ:
#
#   VPC                       … 自分専用のネットワーク全体
#   └─ サブネット             … VPC をさらに区切った場所。サーバーはここに置く
#   インターネットゲートウェイ … VPC とインターネットをつなぐ出入口
#   経路の表（ルートテーブル） … 「どこ行きの通信を、どこへ流すか」の案内表
#   経路の表とサブネットの紐付け … サブネットが、どの案内表を使うかの指定
#
# どれも無料。料金がかかるのは、この中に置くサーバー（ec2.tf）のほう。
#
# 費用の落とし穴：NAT ゲートウェイという部品は、置くだけで料金がかかる。
# このネットワークでは使わない（サーバーはパブリックサブネットに置き、
# インターネットゲートウェイから直接出入りする）。

resource "aws_vpc" "main" {
  # このネットワークで使う IP アドレスの範囲。10.0.0.0 〜 10.0.255.255。
  # 10.x.x.x はインターネット上には存在しない、内部用の番号。
  cidr_block = "10.0.0.0/16"

  # VPC の中で名前（DNS）を使えるようにする。
  # 段階 2 で、サーバーから RDS に名前で接続するときに必要になる。
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "taskmgmt-vpc"
  }
}

resource "aws_subnet" "public" {
  vpc_id = aws_vpc.main.id

  # VPC の範囲のうち、10.0.1.0 〜 10.0.1.255 をこのサブネットに使う。
  cidr_block = "10.0.1.0/24"

  # 東京の中の、どのデータセンター群（アベイラビリティゾーン）に置くか。
  availability_zone = "${var.region}a"

  # ここに置いたサーバーに、パブリック IP を自動で付ける。
  # 自動で付いた IP は、サーバーを止めたり消したりすると外れ、料金も止まる。
  # （固定の IP（Elastic IP）は、持っているだけで料金がかかるので使わない）
  map_public_ip_on_launch = true

  tags = {
    Name = "taskmgmt-public-a"
  }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "taskmgmt-igw"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  # 「VPC の外（0.0.0.0/0 = すべての宛先）への通信は、インターネットゲートウェイへ」。
  # VPC の中どうしの通信の経路は、AWS が自動で入れてくれる。
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "taskmgmt-public-rt"
  }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}
