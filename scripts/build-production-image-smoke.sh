#!/usr/bin/env bash

set -euo pipefail

readonly DOCKER_BIN="${DOCKER_BIN:-docker}"
readonly DOCKERFILE_PATH='./Dockerfile'
readonly BUILD_CONTEXT='.'
readonly DEFAULT_IMAGE_TAG="kaivalo-hub-smoke:${GITHUB_RUN_ID:-local}-$$"
readonly IMAGE_TAG="${PRODUCTION_IMAGE_SMOKE_TAG:-$DEFAULT_IMAGE_TAG}"

cleanup() {
	"$DOCKER_BIN" image rm --force "$IMAGE_TAG" >/dev/null 2>&1 || true
}

trap cleanup EXIT

"$DOCKER_BIN" build --file "$DOCKERFILE_PATH" --tag "$IMAGE_TAG" "$BUILD_CONTEXT"
