#!/usr/bin/env bash

set -euo pipefail

readonly DOCKER_BIN="${DOCKER_BIN:-docker}"
readonly CURL_BIN="${CURL_BIN:-curl}"
readonly DOCKERFILE_PATH='./Dockerfile'
readonly BUILD_CONTEXT='.'
readonly CONTAINER_HEALTH_PORT='3100'
readonly CONTAINER_HEALTH_PATH='/healthz'
readonly DEFAULT_IMAGE_TAG="kaivalo-hub-smoke:${GITHUB_RUN_ID:-local}-$$"
readonly IMAGE_TAG="${PRODUCTION_IMAGE_SMOKE_TAG:-$DEFAULT_IMAGE_TAG}"
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

probe_container_health() {
	local published_port="$1"

	"$CURL_BIN" \
		--silent \
		--show-error \
		--fail \
		--retry "$HEALTH_RETRY_COUNT" \
		--retry-delay "$HEALTH_RETRY_DELAY_SECONDS" \
		--retry-connrefused \
		--connect-timeout "$HEALTH_CONNECT_TIMEOUT_SECONDS" \
		--max-time "$HEALTH_MAX_TIME_SECONDS" \
		"http://127.0.0.1:${published_port}${CONTAINER_HEALTH_PATH}"
}

if ! should_skip_build; then
	remove_image_tag='true'
	"$DOCKER_BIN" build --file "$DOCKERFILE_PATH" --tag "$IMAGE_TAG" "$BUILD_CONTEXT"
fi

container_id="$(
	"$DOCKER_BIN" run \
		--detach \
		--publish "127.0.0.1::${CONTAINER_HEALTH_PORT}" \
		--env "AUTH_ERROR_SIGNING_SECRET=${SMOKE_AUTH_ERROR_SIGNING_SECRET}" \
		--env "AVATAR_PROXY_SIGNING_SECRET=${SMOKE_AVATAR_PROXY_SIGNING_SECRET}" \
		--env "ORIGIN=${SMOKE_ORIGIN}" \
		--env "WORKOS_API_KEY=${SMOKE_WORKOS_API_KEY}" \
		--env "WORKOS_CLIENT_ID=${SMOKE_WORKOS_CLIENT_ID}" \
		--env "WORKOS_COOKIE_PASSWORD=${SMOKE_WORKOS_COOKIE_PASSWORD}" \
		--env "WORKOS_REDIRECT_URI=${SMOKE_ORIGIN}/auth/callback" \
		"$IMAGE_TAG"
)"

published_port="$(get_published_health_port)"
if ! health_body="$(probe_container_health "$published_port")"; then
	fail_with_container_logs 'Production image health probe failed'
fi
if [[ "$health_body" != 'ok' ]]; then
	fail_with_container_logs \
		"Expected ${CONTAINER_HEALTH_PATH} to return ok, received: ${health_body}"
fi
