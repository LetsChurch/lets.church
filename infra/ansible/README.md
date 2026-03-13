# Ansible Infrastructure

This directory contains Ansible playbooks and configuration for deploying and managing Let's Church Temporal worker infrastructure on remote hosts.

## Overview

The Ansible setup manages:

- Docker installation on remote hosts
- Deployment and lifecycle management of Temporal workers
  - **Import Worker**: Handles media file imports and processing
  - **Probe Worker**: Analyzes media files to extract metadata

Workers are deployed as Docker containers pulled from GitLab Container Registry. Secrets are managed via [Infisical](https://infisical.com).

## Directory Structure

```
.
├── collections/              # Installed Ansible collections
│   └── ansible_collections/
│       ├── community.docker/ # Docker management modules
│       └── infisical.vault/  # Infisical secret management
├── playbooks/               # Ansible playbooks
│   ├── install-docker.yml   # Install Docker on hosts
│   ├── import-worker.yml    # Deploy import worker
│   └── probe-worker.yml     # Deploy probe worker
├── variables/               # Non-sensitive variable files
│   ├── import-worker.yml    # Import worker specific settings
│   └── probe-worker.yml     # Probe worker specific settings
├── hosts.yml                # Inventory file defining hosts
├── requirements.yml         # Ansible dependencies
├── justfile                 # Just commands for common tasks
└── .gitignore              # Git ignore rules
```

## Initial Setup

```bash
just init
```

This installs required Ansible roles and collections defined in `requirements.yml`:

- `geerlingguy.docker` role (v7.3.0)
- `community.docker` collection (v3.12.1)
- `infisical.vault` collection (v1.2.1)

## Playbooks

### install-docker.yml

Installs Docker and required Python dependencies on hosts in the `docker` group.

**What it does:**

- Installs Docker using the `geerlingguy.docker` role
- Installs Python 3 and python3-requests for Docker module support

**Usage:**

```bash
just play-docker
# Or directly:
ansible-playbook ./playbooks/install-docker.yml -K
```

### import-worker.yml / probe-worker.yml

Deploys and starts the respective worker containers.

**What they do:**

- Fetches secrets from Infisical at runtime
- Pulls the latest worker image from GitLab Container Registry
- Creates/recreates the worker container with proper configuration
- Configures restart policy to `unless-stopped`
- Sets hostname to the inventory hostname for worker identification

**Usage:**

```bash
# Deploy with latest git commit hash
just play-import-worker
just play-probe-worker

# Deploy specific version by hash
just play-import-worker abc12345
just play-probe-worker abc12345

# Or directly:
INFISICAL_CLIENT_ID=<id> INFISICAL_CLIENT_SECRET=<secret> ansible-playbook ./playbooks/import-worker.yml -K
INFISICAL_CLIENT_ID=<id> INFISICAL_CLIENT_SECRET=<secret> ansible-playbook ./playbooks/probe-worker.yml -K -e "lc_hash=abc12345"
```

**Hash behavior:**

- If no hash is provided, uses the current git commit hash (first 8 characters)
- If a hash is provided via `-e "lc_hash=<hash>"`, uses that specific version
- Image tag format: `registry.gitlab.com/letschurch/lets.church/{worker}:{hash}`

## Just Commands

The `justfile` provides convenient shortcuts:

```bash
# Install dependencies
just init

# Install Docker on all hosts
just play-docker

# Deploy import worker (with optional hash)
just play-import-worker
just play-import-worker abc12345

# Deploy probe worker (with optional hash)
just play-probe-worker
just play-probe-worker abc12345

# Deploy both workers with same hash
just play-workers
just play-workers abc12345

# Full setup: Docker + import worker
just play
```

## Environment Variables

### Infisical Credentials (required at runtime)

| Variable | Description |
|----------|-------------|
| `INFISICAL_CLIENT_ID` | Universal auth client ID |
| `INFISICAL_CLIENT_SECRET` | Universal auth client secret |

### Infisical Secret Paths (project: `b9c770a9-e3d7-4926-a2e0-2a1f43414f96`, environment: `prod`)

| Path | Contents |
|------|----------|
| `/ansible/common` | `AXIOM_DATASET`, `AXIOM_TOKEN`, `SENTRY_DSN`, `TEMPORAL_ADDRESS`, `TEMPORAL_SHUTDOWN_GRACE_TIME` |
| `/ansible/s3/ingest` | `S3_INGEST_REGION`, `S3_INGEST_ENDPOINT`, `S3_INGEST_BUCKET`, `S3_INGEST_ACCESS_KEY_ID`, `S3_INGEST_SECRET_ACCESS_KEY` |

### Worker-Specific Variables (`variables/`)

Non-sensitive settings committed directly:

**`import-worker.yml`** / **`probe-worker.yml`**:
- `MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS`
- `MAX_CONCURRENT_WORKFLOW_TASK_EXECUTIONS`

### Automatic Variables

These are set automatically by the playbooks:

- `IDENTITY`: Set to inventory hostname for worker identification
- `SERVICE_NAME`: Set to worker type (e.g., "import-worker", "probe-worker")

## Common Workflows

### Initial Server Setup

```bash
# 1. Install dependencies
just init

# 2. Install Docker on all hosts
just play-docker

# 3. Deploy workers
INFISICAL_CLIENT_ID=<id> INFISICAL_CLIENT_SECRET=<secret> just play-workers
```

### Deploy New Version

```bash
# Get the commit hash you want to deploy
git log --oneline

# Deploy specific version to all workers
INFISICAL_CLIENT_ID=<id> INFISICAL_CLIENT_SECRET=<secret> just play-workers abc12345
```

### Deploy Latest Version

```bash
INFISICAL_CLIENT_ID=<id> INFISICAL_CLIENT_SECRET=<secret> just play-workers
```

### Check Worker Status

SSH into the host and check container status:

```bash
ssh dorean
docker ps | grep lc-
docker logs lc-import-worker
docker logs lc-probe-worker
```
