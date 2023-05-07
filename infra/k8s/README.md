# Kubernetes Setup

## Prerequisites

1. Install [`pgo`](https://github.com/CrunchyData/postgres-operator)
1. Create namespace for deployment (e.g., `letschurch-prod`)
  1. Make sure the namespace has an image pull secret called `regcred`:

```sh
kubectl create secret docker-registry regcred --namespace=letschurch-prod --docker-server=registry.gitlab.com --docker-username=<username> --docker-password=$(gum input --password)
```

## Secrets

Secrets are generated through [Kustomize](https://kustomize.io/) via [`./prod/kustomization.yml`](./prod/kustomization.yml).
