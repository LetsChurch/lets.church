# Kubernetes Setup

## Prerequisites

1. Install [`pgo`](https://github.com/CrunchyData/postgres-operator)
1. Create namespace for deployment (e.g., `letschurch-prod`)

## Secrets

Secrets are generated through [Kustomize](https://kustomize.io/) via [`./prod/kustomization.yml`](./prod/kustomization.yml).
