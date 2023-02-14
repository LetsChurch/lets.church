variable "linode_token" {
  description = "Linode API personal access token"
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare Account ID"
  sensitive   = true
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token"
  sensitive   = true
}

variable "k8s_version" {
  description = "Kubernetes version to use"
  default     = "1.25"
}

variable "k8s_label" {
  description = "Label for the Kubernetes cluster"
  default     = "k8s"
}

variable "k8s_region" {
  description = "Region to deploy the Kubernetes cluster"
  default     = "us-central"
}

variable "k8s_tags" {
  description = "Tags to apply to the Kubernetes cluster"
  default     = ["k8s"]
}

variable "kubeconfig_location" {
  description = "Location to store the kubeconfig file"
  default     = "kubeconfig.yaml"
}

variable "docker_registry_server" {
  description = "Docker registry server"
  default     = "https://registry.gitlab.com"
}

variable "docker_registry_username" {
  description = "Docker registry username"
  sensitive   = true
}

variable "docker_registry_password" {
  description = "Docker registry password"
  sensitive   = true
}
