#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(
	cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd
)"
readonly REPO_ROOT="$(
	cd -- "$SCRIPT_DIR/.." && pwd
)"
readonly DOCKER_BIN="${DOCKER_BIN:-docker}"
readonly CURL_BIN="${CURL_BIN:-curl}"
readonly NODE_BIN="${NODE_BIN:-node}"
readonly DOCKERFILE_PATH="$REPO_ROOT/Dockerfile"
readonly BUILD_CONTEXT="$REPO_ROOT"
readonly CONTAINER_HEALTH_PORT='3100'
readonly DEFAULT_IMAGE_TAG="kaivalo-hub-smoke:${GITHUB_RUN_ID:-local}-$$"
readonly IMAGE_TAG="${PRODUCTION_IMAGE_SMOKE_TAG:-$DEFAULT_IMAGE_TAG}"
readonly DEPLOY_HEALTH_SCRIPT_PATH="${PRODUCTION_IMAGE_SMOKE_DEPLOY_HEALTH_SCRIPT:-$SCRIPT_DIR/verify-deploy-health.sh}"
readonly HEALTH_RETRY_COUNT="${PRODUCTION_IMAGE_SMOKE_HEALTH_RETRY_COUNT:-10}"
readonly HEALTH_RETRY_DELAY_SECONDS="${PRODUCTION_IMAGE_SMOKE_HEALTH_RETRY_DELAY_SECONDS:-1}"
readonly HEALTH_CONNECT_TIMEOUT_SECONDS="${PRODUCTION_IMAGE_SMOKE_HEALTH_CONNECT_TIMEOUT_SECONDS:-2}"
readonly HEALTH_MAX_TIME_SECONDS="${PRODUCTION_IMAGE_SMOKE_HEALTH_MAX_TIME_SECONDS:-5}"
readonly SMOKE_ORIGIN='http://127.0.0.1:3100'
readonly SMOKE_WORKOS_CLIENT_ID='client_image_smoke'
readonly SMOKE_WORKOS_API_KEY='sk_image_smoke'
readonly SMOKE_WORKOS_COOKIE_PASSWORD='abababababababababababababababababababababababababababababababab'
readonly SMOKE_AUTH_ERROR_SIGNING_SECRET='cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd'
readonly SMOKE_AVATAR_PROXY_SIGNING_SECRET='efefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef'
readonly SMOKE_WORKOS_API_HOSTNAME="${WORKOS_API_HOSTNAME:-}"

container_id=''
remove_image_tag='false'

should_skip_build() {
	case "${PRODUCTION_IMAGE_SMOKE_SKIP_BUILD:-}" in
		1 | true | yes)
			return 0
			;;
		*)
			return 1
			;;
	esac
}

cleanup() {
	if [[ -n "$container_id" ]]; then
		"$DOCKER_BIN" container rm --force "$container_id" >/dev/null 2>&1 || true
	fi

	if [[ "$remove_image_tag" == 'true' ]]; then
		"$DOCKER_BIN" image rm --force "$IMAGE_TAG" >/dev/null 2>&1 || true
	fi
}

trap cleanup EXIT

cd -- "$REPO_ROOT"

fail_with_container_logs() {
	local message="$1"

	echo "$message" >&2
	if [[ -n "$container_id" ]]; then
		"$DOCKER_BIN" logs "$container_id" >&2 || true
	fi
	exit 1
}

get_published_health_port() {
	local published_port

	published_port="$("$DOCKER_BIN" port "$container_id" "${CONTAINER_HEALTH_PORT}/tcp")"
	published_port="${published_port##*:}"
	if [[ -z "$published_port" ]]; then
		fail_with_container_logs 'Failed to resolve the published smoke-test port'
	fi

	printf '%s' "$published_port"
}

run_deploy_health_verification() {
	local published_port="$1"
	local probe_origin="http://127.0.0.1:${published_port}"

	env \
		"DEPLOY_ORIGIN=$SMOKE_ORIGIN" \
		"DEPLOY_PROBE_ORIGIN=$probe_origin" \
		"WORKOS_API_HOSTNAME=$SMOKE_WORKOS_API_HOSTNAME" \
		"DEPLOY_HEALTH_RETRY_COUNT=$HEALTH_RETRY_COUNT" \
		"DEPLOY_HEALTH_RETRY_DELAY_SECONDS=$HEALTH_RETRY_DELAY_SECONDS" \
		"DEPLOY_HEALTH_CONNECT_TIMEOUT_SECONDS=$HEALTH_CONNECT_TIMEOUT_SECONDS" \
		"DEPLOY_HEALTH_MAX_TIME_SECONDS=$HEALTH_MAX_TIME_SECONDS" \
		"CURL_BIN=$CURL_BIN" \
		"NODE_BIN=$NODE_BIN" \
		"$DEPLOY_HEALTH_SCRIPT_PATH"
}

if ! should_skip_build; then
	"$DOCKER_BIN" build --file "$DOCKERFILE_PATH" --tag "$IMAGE_TAG" "$BUILD_CONTEXT"
	remove_image_tag='true'
fi

docker_run_args=(
	run
	--detach
	--publish "127.0.0.1::${CONTAINER_HEALTH_PORT}"
	--env "AUTH_ERROR_SIGNING_SECRET=${SMOKE_AUTH_ERROR_SIGNING_SECRET}"
	--env "AVATAR_PROXY_SIGNING_SECRET=${SMOKE_AVATAR_PROXY_SIGNING_SECRET}"
	--env "ORIGIN=${SMOKE_ORIGIN}"
	--env "WORKOS_API_KEY=${SMOKE_WORKOS_API_KEY}"
	--env "WORKOS_CLIENT_ID=${SMOKE_WORKOS_CLIENT_ID}"
	--env "WORKOS_COOKIE_PASSWORD=${SMOKE_WORKOS_COOKIE_PASSWORD}"
	--env "WORKOS_REDIRECT_URI=${SMOKE_ORIGIN}/auth/callback"
)

if [[ -n "$SMOKE_WORKOS_API_HOSTNAME" ]]; then
	docker_run_args+=(--env "WORKOS_API_HOSTNAME=${SMOKE_WORKOS_API_HOSTNAME}")
fi

container_id="$("$DOCKER_BIN" "${docker_run_args[@]}" "$IMAGE_TAG")"

published_port="$(get_published_health_port)"
if ! run_deploy_health_verification "$published_port"; then
	fail_with_container_logs 'Production image deploy verification failed'
fi
