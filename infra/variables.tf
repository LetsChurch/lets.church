variable "linode_token" {
  default = "Linode API personal access token"
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
