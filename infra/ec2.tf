# =============================================================================
# EC2（サーバー本体）
# =============================================================================
#
# 料金がかかるのはここから（動かしている間だけ。単価はデプロイガイド 07）:
#   EC2 本体、ディスク（EBS）、自動で付くパブリック IPv4

# サーバーの中身（OS）として、Amazon Linux 2023 の最新版を探す。
# data は「作る」のではなく「既にあるものを調べる」ためのブロック。
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"] # AWS 自身が公開しているものだけ

  filter {
    # 例: al2023-ami-2023.12.20260930.0-kernel-6.18-x86_64
    # 最小構成版（al2023-ami-minimal-...）は名前が違うので、ここには当たらない。
    name   = "name"
    values = ["al2023-ami-2023.*-kernel-*-x86_64"]
  }
}

resource "aws_instance" "web" {
  ami           = data.aws_ami.al2023.id
  instance_type = var.instance_type

  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.web.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name

  # CPU の借り越しをしない設定。借り越しの追加料金が出ないかわりに、
  # CPU を使う権利（CPU クレジット）が尽きると、CPU 1つあたり 10% の速さに落ちる。
  # 作った直後は権利が 0 なので、最初の準備は少し遅い（デプロイガイド 06）。
  credit_specification {
    cpu_credits = "standard"
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = var.root_volume_size
    encrypted   = true # 保存されるデータを暗号化する。追加料金はかからない
  }

  # サーバーの中から自分の情報を読む仕組み（メタデータ）を、安全な方式（IMDSv2）に限る。
  metadata_options {
    http_tokens = "required"
  }

  # サーバーを作った直後に1回だけ実行される手順（ユーザーデータ）。
  # 段階 1 の動作確認用に、Web サーバー（nginx）を入れて簡単なページを出す。
  # 段階 3 で、ここをアプリを動かす手順に置き換える。
  user_data = <<-EOF
    #!/bin/bash
    dnf install -y nginx
    echo '<h1>taskmgmt: EC2 is running</h1>' > /usr/share/nginx/html/index.html
    systemctl enable --now nginx
  EOF

  # ユーザーデータを書き換えたら、サーバーを作り直す（作った直後にしか実行されないため）。
  user_data_replace_on_change = true

  lifecycle {
    # Amazon Linux の新しい版が出るたびに「サーバーを作り直す」と plan に出るのを防ぐ。
    # 作業のたびに destroy して作り直す運用なので、新しい版は次に作るときに自動で使われる。
    ignore_changes = [ami]
  }

  tags = {
    Name = "taskmgmt-web"
  }
}
