#!/usr/bin/env bash

set -euo pipefail

readonly DEPLOY_ORIGIN_VALUE="${DEPLOY_ORIGIN:-}"
readonly ROOT_PATH='/'
readonly HEALTH_PATH='/healthz'
readonly CALLBACK_PATH='/auth/callback'
readonly CALLBACK_ACCEPT_HEADER='text/html'
readonly EXPECTED_HEALTH_BODY='ok'
readonly PROBE_RETRY_COUNT="${DEPLOY_HEALTH_RETRY_COUNT:-6}"
readonly PROBE_RETRY_DELAY_SECONDS="${DEPLOY_HEALTH_RETRY_DELAY_SECONDS:-10}"
readonly PROBE_CONNECT_TIMEOUT_SECONDS="${DEPLOY_HEALTH_CONNECT_TIMEOUT_SECONDS:-10}"
readonly PROBE_MAX_TIME_SECONDS="${DEPLOY_HEALTH_MAX_TIME_SECONDS:-20}"

if [[ -z "$DEPLOY_ORIGIN_VALUE" ]]; then
	echo "DEPLOY_ORIGIN must be set for production health verification" >&2
	exit 1
fi

canonicalize_origin() {
	local origin="$1"

	node -e '
		const { isIP } = require("node:net");
		const candidate = process.argv[1];
		const parsed = new URL(candidate);
		const hostname = parsed.hostname.toLowerCase();
		const normalizedHostname =
			hostname.startsWith("[") && hostname.endsWith("]")
				? hostname.slice(1, -1)
				: hostname;
		const isLoopbackHostname =
			normalizedHostname === "localhost" ||
			normalizedHostname === "::1" ||
			(isIP(normalizedHostname) === 4 && normalizedHostname.startsWith("127."));
		if (
			parsed.username ||
			parsed.password ||
			parsed.pathname !== "/" ||
			parsed.search ||
			parsed.hash
		) {
			throw new Error("DEPLOY_ORIGIN must be a bare origin");
		}
		if (
			parsed.protocol !== "https:" &&
			!(parsed.protocol === "http:" && isLoopbackHostname)
		) {
			throw new Error(
				"DEPLOY_ORIGIN must use https unless it targets a loopback host"
			);
		}
		process.stdout.write(parsed.origin);
	' "$origin"
}

validate_callback_redirect() {
	local expected_origin="$1"
	local location="$2"

	node -e '
		const expectedOrigin = process.argv[1];
		const location = process.argv[2];
		const parsed = new URL(location, expectedOrigin);
		if (parsed.origin !== expectedOrigin) {
			throw new Error(
				`Expected callback redirect to stay on ${expectedOrigin}, received ${parsed.origin}`
			);
		}
		if (parsed.pathname !== "/") {
			throw new Error(
				`Expected callback redirect to land on /, received ${parsed.pathname}`
			);
		}
		if (!parsed.search) {
			throw new Error("Expected callback redirect to include query parameters");
		}
	' "$expected_origin" "$location"
}

request_url() {
	local origin="$1"
	local pathname="$2"

	printf '%s/%s' "$origin" "${pathname#/}"
}

run_probe() {
	local url="$1"
	local accept_header="${2:-}"
	local body_file
	local header_file
	local probe_output
	local -a curl_args=(
		curl
		--silent
		--show-error
		--retry "$PROBE_RETRY_COUNT"
		--retry-delay "$PROBE_RETRY_DELAY_SECONDS"
		--retry-connrefused
		--connect-timeout "$PROBE_CONNECT_TIMEOUT_SECONDS"
		--max-time "$PROBE_MAX_TIME_SECONDS"
		--dump-header
	)

	body_file="$(mktemp)"
	header_file="$(mktemp)"
	trap "rm -f '$body_file' '$header_file'" RETURN

	curl_args+=("$header_file" --output "$body_file" --write-out '%{http_code}\n%{url_effective}\n')

	if [[ -n "$accept_header" ]]; then
		curl_args+=(--header "accept: $accept_header")
	fi

	probe_output="$("${curl_args[@]}" "$url")"

	mapfile -t probe_meta <<<"$probe_output"
	PROBE_STATUS="${probe_meta[0]:-}"
	PROBE_EFFECTIVE_URL="${probe_meta[1]:-}"
	PROBE_BODY="$(<"$body_file")"
	PROBE_LOCATION="$(
		awk 'BEGIN { IGNORECASE = 1 } /^location:/ { sub(/^[^:]+:[[:space:]]*/, "", $0); sub(/\r$/, "", $0); print; exit }' "$header_file"
	)"
}

assert_no_redirect_probe() {
	local url="$1"
	local expected_status="$2"

	run_probe "$url"

	if [[ "$PROBE_STATUS" != "$expected_status" ]]; then
		echo "Expected $url to return $expected_status, received $PROBE_STATUS" >&2
		exit 1
	fi

	if [[ "$PROBE_EFFECTIVE_URL" != "$url" ]]; then
		echo "Expected $url to stay on the canonical origin, received $PROBE_EFFECTIVE_URL" >&2
		exit 1
	fi

	if [[ -n "$PROBE_LOCATION" ]]; then
		echo "Expected $url not to redirect, received location $PROBE_LOCATION" >&2
		exit 1
	fi
}

expected_origin="$(canonicalize_origin "$DEPLOY_ORIGIN_VALUE")"

root_url="$(request_url "$expected_origin" "$ROOT_PATH")"
assert_no_redirect_probe "$root_url" "200"

health_url="$(request_url "$expected_origin" "$HEALTH_PATH")"
assert_no_redirect_probe "$health_url" "200"
if [[ "$PROBE_BODY" != "$EXPECTED_HEALTH_BODY" ]]; then
	echo "Expected $HEALTH_PATH to return plain-text $EXPECTED_HEALTH_BODY" >&2
	exit 1
fi

callback_url="$(request_url "$expected_origin" "$CALLBACK_PATH")"
run_probe "$callback_url" "$CALLBACK_ACCEPT_HEADER"

if [[ "$PROBE_STATUS" != "303" ]]; then
	echo "Expected $CALLBACK_PATH to return a same-origin browser redirect, received $PROBE_STATUS" >&2
	exit 1
fi

if [[ "$PROBE_EFFECTIVE_URL" != "$callback_url" ]]; then
	echo "Expected $CALLBACK_PATH probe to stay on the canonical callback URL, received $PROBE_EFFECTIVE_URL" >&2
	exit 1
fi

if [[ -z "$PROBE_LOCATION" ]]; then
	echo "Expected $CALLBACK_PATH to include a redirect location" >&2
	exit 1
fi

validate_callback_redirect "$expected_origin" "$PROBE_LOCATION"
