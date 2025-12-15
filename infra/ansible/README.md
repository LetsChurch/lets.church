# Ansible Infrastructure

This directory contains Ansible playbooks and configuration for deploying and managing Let's Church Temporal worker infrastructure on remote hosts.

## Overview

The Ansible setup manages:

- Docker installation on remote hosts
- Deployment and lifecycle management of Temporal workers
  - **Import Worker**: Handles media file imports and processing
  - **Probe Worker**: Analyzes media files to extract metadata

Workers are deployed as Docker containers pulled from GitLab Container Registry and configured with encrypted environment variables.

## Directory Structure

```
.
├── collections/              # Installed Ansible collections
│   └── ansible_collections/
│       └── community.docker/ # Docker management modules
├── playbooks/               # Ansible playbooks
│   ├── install-docker.yml   # Install Docker on hosts
│   ├── import-worker.yml    # Deploy import worker
│   └── probe-worker.yml     # Deploy probe worker
├── variables/               # Encrypted variable files
│   ├── common.crypt.yml          # Shared variables (Temporal, logging, monitoring)
│   ├── s3-ingest.crypt.yml       # S3 ingest bucket configuration
│   ├── s3-public.crypt.yml       # S3 public bucket configuration
│   ├── s3-backup.crypt.yml       # S3 backup bucket configuration
│   ├── import-worker.crypt.yml   # Import worker specific settings
│   └── probe-worker.crypt.yml    # Probe worker specific settings
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

- Pulls the latest worker image from GitLab Container Registry
- Creates/recreates the worker container with proper configuration
- Sets environment variables from encrypted vault files
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
ansible-playbook ./playbooks/import-worker.yml -K
ansible-playbook ./playbooks/probe-worker.yml -K -e "lc_hash=abc12345"
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

Worker configuration is stored in modular encrypted vault files for security and maintainability.

### Variables File Structure

Variables are split into separate files based on functionality:

#### Shared Variables (`common.crypt.yml`)

Contains configuration shared across all workers:

- `TEMPORAL_ADDRESS`: Temporal server address
- `TEMPORAL_SHUTDOWN_GRACE_TIME`: Graceful shutdown timeout
- `AXIOM_DATASET`: Axiom dataset for logging
- `AXIOM_TOKEN`: Axiom API token
- `SENTRY_DSN`: Sentry DSN for error tracking

#### S3 Configuration Files

Each S3 bucket has its own variables file, allowing workers to access only what they need:

**`s3-ingest.crypt.yml`** (Ingest bucket for user uploads):

- `S3_INGEST_REGION`
- `S3_INGEST_ENDPOINT`
- `S3_INGEST_BUCKET`
- `S3_INGEST_ACCESS_KEY_ID`
- `S3_INGEST_SECRET_ACCESS_KEY`

**`s3-public.crypt.yml`** (Public bucket for processed media):

- `S3_PUBLIC_REGION`
- `S3_PUBLIC_ENDPOINT`
- `S3_PUBLIC_BUCKET`
- `S3_PUBLIC_ACCESS_KEY_ID`
- `S3_PUBLIC_SECRET_ACCESS_KEY`

**`s3-backup.crypt.yml`** (Backup bucket for Glacier archives):

- `S3_BACKUP_REGION`
- `S3_BACKUP_ENDPOINT`
- `S3_BACKUP_BUCKET`
- `S3_BACKUP_ACCESS_KEY_ID`
- `S3_BACKUP_SECRET_ACCESS_KEY`

#### Worker-Specific Variables

Each worker has its own file for worker-specific configuration:

**`import-worker.crypt.yml`**:

- `MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS`
- `MAX_CONCURRENT_WORKFLOW_TASK_EXECUTIONS`

**`probe-worker.crypt.yml`**:

- `MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS`
- `MAX_CONCURRENT_WORKFLOW_TASK_EXECUTIONS`

### S3 Access Matrix

Workers only load the S3 configuration they need:

| Worker | Ingest | Public | Backup |
|--------|--------|--------|--------|
| **import-worker** | ✓ | - | - |
| **probe-worker** | ✓ | - | - |
| **transcode-worker** | ✓ | ✓ | - |
| **transcribe-worker** | ✓ | ✓ | - |
| **background-worker** | ✓ | ✓ | ✓ |

### Playbook Variable Inclusion

Each playbook includes only the variables files it needs:

**Import Worker** (`import-worker.yml`):

```yaml
vars_files:
  - ../variables/common.crypt.yml
  - ../variables/s3-ingest.crypt.yml
  - ../variables/import-worker.crypt.yml
```

**Probe Worker** (`probe-worker.yml`):

```yaml
vars_files:
  - ../variables/common.crypt.yml
  - ../variables/s3-ingest.crypt.yml
  - ../variables/probe-worker.crypt.yml
```

**Background Worker** (hypothetical, needs all buckets):

```yaml
vars_files:
  - ../variables/common.crypt.yml
  - ../variables/s3-ingest.crypt.yml
  - ../variables/s3-public.crypt.yml
  - ../variables/s3-backup.crypt.yml
  - ../variables/background-worker.crypt.yml
```

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
just play-workers
```

### Deploy New Version

```bash
# Get the commit hash you want to deploy
git log --oneline

# Deploy specific version to all workers
just play-workers abc12345
```

### Deploy Latest Version

```bash
# Deploys based on current git commit
just play-workers
```

### Check Worker Status

SSH into the host and check container status:

```bash
ssh dorean
docker ps | grep lc-
docker logs lc-import-worker
docker logs lc-probe-worker
```

### Update Worker Configuration

```bash
# Update shared configuration (affects all workers)
ansible-vault edit variables/common.crypt.yml

# Update S3 ingest bucket settings (affects import, probe, transcode, transcribe, background workers)
ansible-vault edit variables/s3-ingest.crypt.yml

# Update S3 public bucket settings (affects transcode, transcribe, background workers)
ansible-vault edit variables/s3-public.crypt.yml

# Update S3 backup bucket settings (affects background worker only)
ansible-vault edit variables/s3-backup.crypt.yml

# Update worker-specific settings
ansible-vault edit variables/import-worker.crypt.yml

# Redeploy affected workers to apply changes
just play-import-worker
just play-probe-worker
```
