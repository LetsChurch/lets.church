# Kubernetes Setup

## Prerequisites

1. Install [`pgo`](https://github.com/CrunchyData/postgres-operator)
1. Create namespace for deployment (e.g., `letschurch-prod`)
1. Optional: install the [tailscale k8s operator](https://tailscale.com/kb/1236/kubernetes-operator)

## Secrets

Secrets are generated through [Kustomize](https://kustomize.io/) via [`./prod/kustomization.yml`](./prod/kustomization.yml).
