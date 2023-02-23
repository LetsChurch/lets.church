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
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "3.34.0"
    }
  }
}

provider "linode" {
  token = var.linode_token
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

provider "helm" {
  kubernetes {
    config_path = var.kubeconfig_location
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
    type  = "g6-standard-4"
    count = 1
    autoscaler {
      min = 1
      max = 3
    }
  }
}

# This is imported. TODO: use external dns
resource "linode_nodebalancer" "nginx_ingress" {
  region               = "us-central"
  label                = "nginx-ingress"
  client_conn_throttle = 20
}

resource "local_sensitive_file" "kubeconfig" {
  depends_on     = [linode_lke_cluster.k8s]
  filename       = var.kubeconfig_location
  content_base64 = linode_lke_cluster.k8s.kubeconfig
}

resource "helm_release" "ingress_nginx" {
  depends_on = [local_sensitive_file.kubeconfig]
  name       = "ingress-nginx"
  repository = "https://kubernetes.github.io/ingress-nginx"
  chart      = "ingress-nginx"
  values = [
    "${file("nginx-values.yml")}"
  ]
}

resource "kubernetes_namespace_v1" "preview" {
  depends_on = [local_sensitive_file.kubeconfig]

  metadata {
    name = "preview"
  }
}

resource "kubernetes_secret_v1" "image_pull" {
  depends_on = [local_sensitive_file.kubeconfig]

  metadata {
    name      = "regcred"
    namespace = kubernetes_namespace_v1.preview.metadata[0].name
  }

  type = "kubernetes.io/dockerconfigjson"

  data = {
    ".dockerconfigjson" = jsonencode({
      auths = {
        "${var.docker_registry_server}" = {
          username = var.docker_registry_username
          password = var.docker_registry_password
        }
      }
    })
  }
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
