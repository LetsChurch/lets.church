#!/usr/bin/env bash

downloadModel() {
  mkdir -p /opt/whisper/models/$1
  cd /opt/whisper/models/$1
  git init
  git remote add origin https://huggingface.co/guillaumekln/faster-whisper-$1
  git fetch origin $2
  git reset --hard FETCH_HEAD
}

downloadModel tiny.en 7d45cf02c1ed72d240c0dbf99d544d19bef1b5a3
downloadModel large-v2 fecb99cc227a240ccd295d99b6c9026e7a179508
