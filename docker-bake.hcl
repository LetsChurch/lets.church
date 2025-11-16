variable "TAG" {
  default = "latest"
}

variable "REGISTRY" {
  default = "registry.gitlab.com/letschurch/lets.church"
}

variable "PLATFORMS" {
  default = ["linux/amd64", "linux/arm64"]
}

group "default" {
  targets = [
    "db-migrate",
    "elasticsearch-migrate",
    "web",
    "background-worker",
    "probe-worker",
    "transcode-worker",
    "import-worker",
    "transcribe-worker"
  ]
}

target "db-migrate" {
  target = "db-migrate"
  tags = ["${REGISTRY}/db-migrate:${TAG}"]
  platforms = PLATFORMS
}

target "elasticsearch-migrate" {
  target = "elasticsearch-migrate"
  tags = ["${REGISTRY}/elasticsearch-migrate:${TAG}"]
  platforms = PLATFORMS
}

target "web" {
  target = "web"
  tags = ["${REGISTRY}/web:${TAG}"]
  platforms = PLATFORMS
}

target "background-worker" {
  target = "background-worker"
  tags = ["${REGISTRY}/background-worker:${TAG}"]
  platforms = PLATFORMS
}

target "probe-worker" {
  target = "probe-worker"
  tags = ["${REGISTRY}/probe-worker:${TAG}"]
  platforms = PLATFORMS
}

target "transcode-worker" {
  target = "transcode-worker"
  tags = ["${REGISTRY}/transcode-worker:${TAG}"]
  platforms = PLATFORMS
}

target "import-worker" {
  target = "import-worker"
  tags = ["${REGISTRY}/import-worker:${TAG}"]
  platforms = PLATFORMS
}

target "transcribe-worker" {
  target = "transcribe-worker"
  tags = ["${REGISTRY}/transcribe-worker:${TAG}"]
  platforms = PLATFORMS
  args = {
    WHISPER_MODEL = "large-v2"
  }
}
