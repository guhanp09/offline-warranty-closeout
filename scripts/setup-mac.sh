#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "$(uname -m)" != arm64 || "$(uname -s)" != Darwin ]]; then
  echo "Use an Apple silicon Mac for local inference. The browser demo runs in a modern browser."
  exit 1
fi
if ! command -v brew >/dev/null; then
  echo "Install Homebrew from https://brew.sh/ and run this again."
  exit 1
fi
if ! node -e 'const [major,minor]=process.versions.node.split(".").map(Number);process.exit(major===24 && minor>=13 && process.arch==="arm64" ? 0 : 1)' 2>/dev/null; then
  echo "Install native Node 24.13 or newer in the Node 24 series."
  echo 'Run brew install node@24 and add $(brew --prefix node@24)/bin to PATH.'
  exit 1
fi

missing=()
command -v ollama >/dev/null || missing+=(ollama)
command -v ffmpeg >/dev/null || missing+=(ffmpeg)
command -v whisper-cli >/dev/null || missing+=(whisper.cpp)
if [[ ${#missing[@]} -gt 0 ]]; then brew install "${missing[@]}"; fi

umask 077
mkdir -p .data/models
if ! curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  OLLAMA_NO_CLOUD=1 OLLAMA_HOST=127.0.0.1:11434 nohup ollama serve >.data/ollama.log 2>&1 &
  for _ in {1..25}; do
    if curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then break; fi
    sleep 1
  done
fi
if ! curl -fsS http://127.0.0.1:11434/api/tags >/dev/null; then
  echo "Ollama did not start. Check .data/ollama.log and retry."
  exit 1
fi

echo "Preloading qwen3:4b (about 2.5 GB on first setup)…"
ollama pull qwen3:4b
model=.data/models/ggml-base.en.bin
sha=a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002
valid_model() { printf '%s  %s\n' "$sha" "$1" | shasum -a 256 -c - >/dev/null 2>&1; }
if ! valid_model "$model"; then
  echo "Preloading Whisper base.en (about 150 MB)…"
  curl --fail --location --retry 3 \
    https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin \
    -o "$model.part"
  if ! valid_model "$model.part"; then echo "Whisper checksum mismatch."; exit 1; fi
  mv "$model.part" "$model"
fi

echo "Setup complete. Run npm start, then open http://127.0.0.1:4173."
