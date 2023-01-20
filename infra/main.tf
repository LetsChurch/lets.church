terraform {
  required_providers {
    linode = {
      source  = "linode/linode"
      version = "1.29.4"
    }
  }
}

provider "linode" {
  token = var.linode_token
}

provider "helm" {
  kubernetes {
    config_path = var.kubeconfig_location
  }
}

resource "linode_lke_cluster" "k8s" {
  k8s_version = var.k8s_version
  label       = var.k8s_label
  region      = var.k8s_region
  tags        = var.k8s_tags

  pool {
    type  = "g6-standard-4"
    count = 1
    autoscaler {
      min = 1
      max = 3
    }
  }
}

resource "local_sensitive_file" "kubeconfig" {
  depends_on     = [linode_lke_cluster.k8s]
  filename       = var.kubeconfig_location
  content_base64 = linode_lke_cluster.k8s.kubeconfig
}

resource "helm_release" "ingress-nginx" {
  depends_on = [local_sensitive_file.kubeconfig]
  name       = "ingress-nginx"
  repository = "https://kubernetes.github.io/ingress-nginx"
  chart      = "ingress-nginx"
}

output "kubeconfig" {
  value     = linode_lke_cluster.k8s.kubeconfig
  sensitive = true
}

output "api_endpoints" {
  value = linode_lke_cluster.k8s.api_endpoints
}

output "status" {
  value = linode_lke_cluster.k8s.status
}

output "id" {
  value = linode_lke_cluster.k8s.id
}

output "pool" {
  value = linode_lke_cluster.k8s.pool
}
