# =============================================================================
# Terraform 本体と、AWS を操作する部品（プロバイダ）の設定
# =============================================================================
#
# このフォルダ（infra/persistent）は、infra とは別の Terraform。
# 記録（state）も別のファイルになるので、infra で terraform destroy しても、
# ここで作ったもの（バックアップの置き場）は消えない。

terraform {
  required_version = "~> 1.16"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.68"
    }

    # バケットの名前の末尾に付ける、ランダムな文字を作るのに使う（main.tf）。
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }
}

provider "aws" {
  region = var.region

  # どの鍵（プロファイル）を使うかは書かない。実行するときに AWS_PROFILE で指定する。

  default_tags {
    tags = {
      Project   = "taskmgmt"
      ManagedBy = "terraform"
      Lifetime  = "persistent" # 作業のたびに消さないもの、という目印
    }
  }
}
