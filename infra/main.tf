terraform {
  cloud {
    organization = "LetsChurch"

    workspaces {
      name = "LetsChurch"
    }
  }
  required_providers {
    linode = {
      source  = "linode/linode"
      version = "1.29.4"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "4.57.1"
    }
  }
}

provider "linode" {
  token = var.linode_token
}

provider "aws" {
  alias                       = "cloudflare"
  region                      = "us-east-1"
  access_key                  = var.cloudflare_r2_access_key
  secret_key                  = var.cloudflare_r2_secret_key
  skip_credentials_validation = true
  skip_region_validation      = true
  skip_requesting_account_id  = true

  endpoints {
    s3 = var.cloudflare_r2_endpoint
  }
}

provider "kubernetes" {
  config_path = var.kubeconfig_location
}

resource "linode_lke_cluster" "k8s" {
  k8s_version = var.k8s_version
  label       = var.k8s_label
  region      = var.k8s_region
  tags        = var.k8s_tags

  pool {
    type  = "g6-dedicated-2"
    count = 1
  }
}

resource "local_sensitive_file" "kubeconfig" {
  depends_on     = [linode_lke_cluster.k8s]
  filename       = var.kubeconfig_location
  content_base64 = linode_lke_cluster.k8s.kubeconfig
}

resource "aws_s3_bucket" "ingest_bucket" {
  provider = aws.cloudflare
  bucket   = var.cloudflare_r2_ingest_bucket
}

// Must manually configure public access URL
resource "aws_s3_bucket" "public_bucket" {
  provider = aws.cloudflare
  bucket   = var.cloudflare_r2_public_bucket
}

resource "aws_s3_bucket_cors_configuration" "ingest_bucket_cors" {
  provider = aws.cloudflare
  bucket   = aws_s3_bucket.ingest_bucket.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
  }
}

resource "aws_s3_bucket_cors_configuration" "public_bucket_cors" {
  provider = aws.cloudflare
  bucket   = aws_s3_bucket.public_bucket.id

  cors_rule {
    allowed_methods = ["GET"]
    allowed_origins = ["*"]
  }
}

output "kubeconfig" {
  value     = linode_lke_cluster.k8s.kubeconfig
  sensitive = true
}

output "api_endpoints" {
  value     = linode_lke_cluster.k8s.api_endpoints
  sensitive = true
}
