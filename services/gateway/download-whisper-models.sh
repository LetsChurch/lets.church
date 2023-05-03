#!/usr/bin/env bash

downloadModel() {
  mkdir -p /opt/whisper/models/
  curl https://data.letschurch.cloud/whisper-ctranslate2/models/$1.tar.gz | tar -xzC /opt/whisper/models/
}

downloadModel tiny.en
downloadModel large-v2
