# =============================================================================
# 変数（外から渡す値）
# =============================================================================
#
# 人によって違う値や、後から変えたくなる値は、ここで「変数」として宣言しておく。
# 実際の値は terraform.tfvars に書く（見本は terraform.tfvars.example）。
# terraform.tfvars は .gitignore に入っているので、自宅の IP などがコミットされることはない。

variable "region" {
  description = "AWS のリージョン（どの地域のデータセンターを使うか）"
  type        = string
  default     = "ap-northeast-1" # 東京
}

variable "my_ip_cidr" {
  description = "アクセスを許可する自分の IP アドレス。末尾に /32 を付ける（例: 203.0.113.10/32）"
  type        = string

  # 書き間違いを apply の前に見つけるための検査。
  # /32 は「この IP アドレス1つだけ」という意味。/0 などにすると世界中に開いてしまう。
  validation {
    condition     = can(cidrhost(var.my_ip_cidr, 0)) && endswith(var.my_ip_cidr, "/32")
    error_message = "my_ip_cidr は「IP アドレス/32」の形で書いてください（例: 203.0.113.10/32）。"
  }
}

variable "instance_type" {
  description = "EC2 の種類（CPU とメモリの大きさ）"
  type        = string
  default     = "t3.micro" # x64・メモリ 1GB。決めた理由はデプロイガイド 06
}

variable "root_volume_size" {
  description = "EC2 のディスクの大きさ（GB）"
  type        = number
  default     = 8 # Amazon Linux 2023 が配られている大きさ。見積もりはデプロイガイド 06
}

variable "alert_topic_name" {
  description = "アラームの通知先にする SNS トピックの名前。安全装置の通知先と同じものを使う"
  type        = string
  default     = "guard-alerts"
}
