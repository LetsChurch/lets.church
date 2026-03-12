# Kubernetes Setup

## Prerequisites

1. Install [`pgo`](https://github.com/CrunchyData/postgres-operator)
1. Install the [Infisical Kubernetes operator](https://infisical.com/docs/integrations/platforms/kubernetes/overview):

   ```sh
   helm repo add infisical-helm-charts 'https://dl.cloudsmith.io/public/infisical/helm-charts/helm/charts/'
   helm repo update
   helm install --generate-name infisical-helm-charts/secrets-operator
   ```

1. Create namespace for deployment (e.g., `letschurch-prod`)
1. Install the [Tailscale Kubernetes operator](https://tailscale.com/kb/1236/kubernetes-operator):

   ```sh
   helm repo add tailscale https://pkgs.tailscale.com/helmcharts
   helm repo update
   helm upgrade \
     --install \
     tailscale-operator \
     tailscale/tailscale-operator \
     --namespace=tailscale \
     --create-namespace \
     --set-string oauth.clientId="<OAuth client ID>" \
     --set-string oauth.clientSecret="<OAuth client secret>" \
     --wait
   ```

## Secrets

Secrets are synced from [Infisical](https://infisical.com) via the Infisical Kubernetes operator using `InfisicalSecret` resources defined in [`./prod/infisical-secrets.yml`](./prod/infisical-secrets.yml).

### Setup

1. Create a [machine identity](https://infisical.com/docs/documentation/platform/identities/universal-auth) in Infisical with universal auth and grant it read access to your project.

2. Create the credentials secret in the cluster:

   ```sh
   kubectl create secret generic infisical-universal-auth \
     --namespace letschurch-prod \
     --from-literal=clientId=<client-id> \
     --from-literal=clientSecret=<client-secret>
   ```

3. Populate secrets in Infisical under the `prod` environment using the following path layout:

   | Infisical path              | Kubernetes secret    |
   |-----------------------------|----------------------|
   | `/app/jwt`                  | `jwt-secret`         |
   | `/app/listmonk`             | `listmonk-secret`    |
   | `/app/mapbox`               | `mapbox-secret`      |
   | `/app/web`                  | `web-app-secret`     |
   | `/infra/cloudflare`         | `cloudflare-secret`  |
   | `/infra/imgproxy`           | `imgproxy-secret`    |
   | `/infra/pgo-backup-creds`   | `pgo-backup-creds`   |
   | `/infra/s3/backup`          | `s3-backup-secret`   |
   | `/infra/s3/ingest`          | `s3-ingest-secret`   |
   | `/infra/s3/public`          | `s3-public-secret`   |
   | `/infra/smtp`               | `smtp-secret`        |
   | `/observability/axiom-pino` | `axiom-pino-secret`  |
   | `/observability/sentry`     | `sentry-secret`      |
   | `/observability/vector`     | `vector-secret`      |

   > **Note:** `/infra/pgo-backup-creds` must contain a single secret with key `s3.conf` whose value is the full pgBackRest INI configuration file content.

4. Set the project slug in [`./prod/kustomization.yml`](./prod/kustomization.yml) under the `infisical-config` configMapGenerator.
