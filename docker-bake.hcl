variable "TAG" {
  default = "latest"
}

variable "REGISTRY" {
  default = "registry.gitlab.com/letschurch/lets.church"
}

variable "PLATFORMS" {
  default = ["linux/amd64", "linux/arm64"]
}

# Depot project IDs for build parallelism
# Each target gets its own dedicated builder to avoid deduplication delays
# See: https://depot.dev/docs/container-builds/build-parallelism#docker-bake-for-orchestrated-builds

group "default" {
  targets = [
    "web",
    "background-worker",
    "probe-worker",
    "transcode-worker",
    "import-worker",
    "transcribe-worker",
    "download-service"
  ]
}

# Shared base stages - not tagged, used as dependencies
target "build-audiowaveform" {
  target = "build-audiowaveform"
  platforms = PLATFORMS
  project-id = "letschurch-base"
}

target "base" {
  target = "base"
  platforms = PLATFORMS
  project-id = "letschurch-base"
}

target "prod" {
  target = "prod"
  platforms = PLATFORMS
  project-id = "letschurch-base"
}

target "prod-with-image-tools" {
  target = "prod-with-image-tools"
  platforms = PLATFORMS
  project-id = "letschurch-base"
}

target "prod-with-ffmpeg" {
  target = "prod-with-ffmpeg"
  platforms = PLATFORMS
  project-id = "letschurch-base"
}

target "prod-with-media-tools" {
  target = "prod-with-media-tools"
  platforms = PLATFORMS
  project-id = "letschurch-base"
}

target "web" {
  target = "web"
  tags = ["${REGISTRY}/web:${TAG}"]
  platforms = PLATFORMS
  project-id = "letschurch-web"
}

target "background-worker" {
  target = "background-worker"
  tags = ["${REGISTRY}/background-worker:${TAG}"]
  platforms = PLATFORMS
  project-id = "letschurch-background-worker"
}

target "probe-worker" {
  target = "probe-worker"
  tags = ["${REGISTRY}/probe-worker:${TAG}"]
  platforms = PLATFORMS
  project-id = "letschurch-probe-worker"
}

target "transcode-worker" {
  target = "transcode-worker"
  tags = ["${REGISTRY}/transcode-worker:${TAG}"]
  platforms = PLATFORMS
  project-id = "letschurch-transcode-worker"
}

target "import-worker" {
  target = "import-worker"
  tags = ["${REGISTRY}/import-worker:${TAG}"]
  platforms = PLATFORMS
  project-id = "letschurch-import-worker"
}

target "transcribe-worker" {
  target = "transcribe-worker"
  tags = ["${REGISTRY}/transcribe-worker:${TAG}"]
  platforms = PLATFORMS
  project-id = "letschurch-transcribe-worker"
  args = {
    WHISPER_MODEL = "large-v3"
  }
}

target "download-service" {
  target = "download-service"
  tags = ["${REGISTRY}/download-service:${TAG}"]
  platforms = PLATFORMS
  project-id = "letschurch-download-service"
}
