#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(
	cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd
)"
readonly REPO_ROOT="$(
	cd -- "$SCRIPT_DIR/.." && pwd
)"
readonly NODE_BIN="${NODE_BIN:-node}"
readonly CURL_BIN="${CURL_BIN:-curl}"
readonly DEPLOY_ORIGIN_VALUE="${DEPLOY_ORIGIN:-}"
readonly DEPLOY_PROBE_ORIGIN_VALUE="${DEPLOY_PROBE_ORIGIN:-$DEPLOY_ORIGIN_VALUE}"
readonly WORKOS_API_HOSTNAME_VALUE="${WORKOS_API_HOSTNAME:-}"
readonly ROOT_PATH='/'
readonly HEALTH_PATH='/healthz'
readonly SERVICES_PATH='/services'
readonly CALLBACK_PATH='/auth/callback'
readonly SIGN_IN_PATH='/auth/sign-in'
readonly WORKOS_AUTHORIZE_PATH='/user_management/authorize'
readonly EXPECTED_HEALTH_BODY='ok'
readonly PROBE_RETRY_COUNT="${DEPLOY_HEALTH_RETRY_COUNT:-6}"
readonly PROBE_RETRY_DELAY_SECONDS="${DEPLOY_HEALTH_RETRY_DELAY_SECONDS:-10}"
readonly PROBE_CONNECT_TIMEOUT_SECONDS="${DEPLOY_HEALTH_CONNECT_TIMEOUT_SECONDS:-10}"
readonly PROBE_MAX_TIME_SECONDS="${DEPLOY_HEALTH_MAX_TIME_SECONDS:-20}"
readonly PUBLIC_DOCUMENT_CACHE_CONTROL='public, max-age=300, stale-while-revalidate=60'
readonly PRIVATE_NO_STORE_CACHE_CONTROL='private, no-store'
readonly HEALTH_CACHE_CONTROL='no-store'
readonly HSTS_HEADER_VALUE='max-age=63072000; includeSubDomains'
readonly FRAME_OPTIONS_HEADER_VALUE='DENY'
readonly CONTENT_TYPE_OPTIONS_HEADER_VALUE='nosniff'
readonly REFERRER_POLICY_HEADER_VALUE='strict-origin-when-cross-origin'
readonly PERMISSIONS_POLICY_HEADER_VALUE='camera=(), microphone=(), geolocation=()'

cd "$REPO_ROOT"

mapfile -t BROWSER_NAVIGATION_PROBE_HEADERS < <(
	"$NODE_BIN" --input-type=module -e '
		import { getBrowserNavigationProbeHeaders } from "./apps/hub/src/lib/auth/request-policy.ts";
		for (const [name, value] of Object.entries(getBrowserNavigationProbeHeaders())) {
			process.stdout.write(`${name}: ${value}\n`);
		}
	'
)
readonly EXPECTED_AUTH_ERROR_MESSAGE="$(
	"$NODE_BIN" --input-type=module -e '
		import { AUTH_ERROR_MESSAGE } from "./apps/hub/src/lib/auth/auth-error-query.ts";
		process.stdout.write(AUTH_ERROR_MESSAGE);
	'
)"

if [[ -z "$DEPLOY_ORIGIN_VALUE" ]]; then
	echo "DEPLOY_ORIGIN must be set for production health verification" >&2
	exit 1
fi

canonicalize_origin() {
	local origin="$1"
	local field_name="${2:-DEPLOY_ORIGIN}"

	"$NODE_BIN" --input-type=module -e '
		import { normalizeConfiguredOrigin } from "./apps/hub/src/lib/auth/request-policy.ts";
		import { isLoopbackHostname } from "./apps/hub/src/lib/server/ip-address.ts";

		const candidate = normalizeConfiguredOrigin(process.argv[1], process.argv[2]);
		const parsed = new URL(candidate);
		if (
			parsed.protocol !== "https:" &&
			!(parsed.protocol === "http:" && isLoopbackHostname(parsed.hostname))
		) {
			throw new Error(
				`${process.argv[2]} must use https unless it targets a loopback host`
			);
		}
		process.stdout.write(candidate);
	' "$origin" "$field_name"
}

resolve_expected_auth_origin() {
	local api_hostname="$1"

	"$NODE_BIN" --input-type=module -e '
		import { getTrustedWorkosAuthOrigin } from "./apps/hub/src/lib/server/auth-origin-policy.ts";

		process.stdout.write(
			getTrustedWorkosAuthOrigin({
				apiHostname: process.argv[1] === "" ? undefined : process.argv[1]
			})
		);
	' "$api_hostname"
}

validate_callback_redirect() {
	local expected_origin="$1"
	local location="$2"

	"$NODE_BIN" --input-type=module -e '
		import { readAuthErrorRedirectShape } from "./apps/hub/src/lib/auth/auth-error-query.ts";

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
		if (!readAuthErrorRedirectShape(parsed.searchParams)) {
			throw new Error(
				"Expected callback redirect to include the auth error redirect contract"
			);
		}
	' "$expected_origin" "$location"
}

resolve_probe_url() {
	local expected_origin="$1"
	local probe_origin="$2"
	local location="$3"

	"$NODE_BIN" --input-type=module -e '
		const expectedOrigin = process.argv[1];
		const probeOrigin = process.argv[2];
		const location = process.argv[3];
		const canonical = new URL(location, expectedOrigin);
		const probe = new URL(
			`${canonical.pathname}${canonical.search}${canonical.hash}`,
			probeOrigin
		);
		process.stdout.write(probe.toString());
	' "$expected_origin" "$probe_origin" "$location"
}

read_callback_incident_id() {
	local expected_origin="$1"
	local location="$2"

	"$NODE_BIN" --input-type=module -e '
		import { readAuthErrorRedirectShape } from "./apps/hub/src/lib/auth/auth-error-query.ts";

		const expectedOrigin = process.argv[1];
		const location = process.argv[2];
		const parsed = new URL(location, expectedOrigin);
		const shape = readAuthErrorRedirectShape(parsed.searchParams);
		if (!shape) {
			throw new Error(
				"Expected callback redirect to include the auth error redirect contract"
			);
		}
		process.stdout.write(shape.incidentId);
	' "$expected_origin" "$location"
}

validate_services_redirect() {
	local expected_origin="$1"
	local location="$2"
	local sign_in_path="$3"

	"$NODE_BIN" -e '
		const expectedOrigin = process.argv[1];
		const location = process.argv[2];
		const signInPath = process.argv[3];
		const parsed = new URL(location, expectedOrigin);
		if (parsed.origin !== expectedOrigin) {
			throw new Error(
				`Expected services redirect to stay on ${expectedOrigin}, received ${parsed.origin}`
			);
		}
		if (parsed.pathname !== signInPath) {
			throw new Error(
				`Expected services redirect to land on ${signInPath}, received ${parsed.pathname}`
			);
		}
	' "$expected_origin" "$location" "$sign_in_path"
}

validate_sign_in_redirect() {
	local expected_origin="$1"
	local expected_auth_origin="$2"
	local expected_callback_url="$3"
	local authorize_path="$4"
	local location="$5"

	"$NODE_BIN" -e '
		const expectedOrigin = process.argv[1];
		const expectedAuthOrigin = process.argv[2];
		const expectedCallbackUrl = process.argv[3];
		const authorizePath = process.argv[4];
		const location = process.argv[5];
		const parsed = new URL(location, expectedOrigin);
		if (parsed.origin !== expectedAuthOrigin) {
			throw new Error(
				`Expected sign-in redirect to use ${expectedAuthOrigin}, received ${parsed.origin}`
			);
		}
		if (
			parsed.pathname !== authorizePath &&
			!parsed.pathname.startsWith(`${authorizePath}/`)
		) {
			throw new Error(
				`Expected sign-in redirect to use ${authorizePath}, received ${parsed.pathname}`
			);
		}
		if (parsed.searchParams.get("redirect_uri") !== expectedCallbackUrl) {
			throw new Error(
				`Expected sign-in redirect_uri to be ${expectedCallbackUrl}, received ${parsed.searchParams.get("redirect_uri")}`
			);
		}
	' "$expected_origin" "$expected_auth_origin" "$expected_callback_url" "$authorize_path" "$location"
}

request_url() {
	local origin="$1"
	local pathname="$2"

	printf '%s/%s' "$origin" "${pathname#/}"
}

run_probe() {
	local url="$1"
	shift
	local body_file
	local header_file
	local probe_output
	local -a curl_args=(
		"$CURL_BIN"
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

	for header_line in "$@"; do
		curl_args+=(--header "$header_line")
	done

	probe_output="$("${curl_args[@]}" "$url")"

	mapfile -t probe_meta <<<"$probe_output"
	PROBE_STATUS="${probe_meta[0]:-}"
	PROBE_EFFECTIVE_URL="${probe_meta[1]:-}"
	PROBE_BODY="$(<"$body_file")"
	PROBE_LOCATION="$(
		awk 'BEGIN { IGNORECASE = 1 } /^location:/ { sub(/^[^:]+:[[:space:]]*/, "", $0); sub(/\r$/, "", $0); print; exit }' "$header_file"
	)"
	PROBE_CACHE_CONTROL="$(
		awk 'BEGIN { IGNORECASE = 1 } /^cache-control:/ { sub(/^[^:]+:[[:space:]]*/, "", $0); sub(/\r$/, "", $0); print; exit }' "$header_file"
	)"
	PROBE_STRICT_TRANSPORT_SECURITY="$(
		awk 'BEGIN { IGNORECASE = 1 } /^strict-transport-security:/ { sub(/^[^:]+:[[:space:]]*/, "", $0); sub(/\r$/, "", $0); print; exit }' "$header_file"
	)"
	PROBE_X_FRAME_OPTIONS="$(
		awk 'BEGIN { IGNORECASE = 1 } /^x-frame-options:/ { sub(/^[^:]+:[[:space:]]*/, "", $0); sub(/\r$/, "", $0); print; exit }' "$header_file"
	)"
	PROBE_X_CONTENT_TYPE_OPTIONS="$(
		awk 'BEGIN { IGNORECASE = 1 } /^x-content-type-options:/ { sub(/^[^:]+:[[:space:]]*/, "", $0); sub(/\r$/, "", $0); print; exit }' "$header_file"
	)"
	PROBE_REFERRER_POLICY="$(
		awk 'BEGIN { IGNORECASE = 1 } /^referrer-policy:/ { sub(/^[^:]+:[[:space:]]*/, "", $0); sub(/\r$/, "", $0); print; exit }' "$header_file"
	)"
	PROBE_PERMISSIONS_POLICY="$(
		awk 'BEGIN { IGNORECASE = 1 } /^permissions-policy:/ { sub(/^[^:]+:[[:space:]]*/, "", $0); sub(/\r$/, "", $0); print; exit }' "$header_file"
	)"
}

assert_probe_header() {
	local pathname="$1"
	local header_name="$2"
	local actual_value="$3"
	local expected_value="$4"

	if [[ "$actual_value" != "$expected_value" ]]; then
		echo "Expected $pathname to include $header_name: $expected_value, received ${actual_value:-<missing>}" >&2
		exit 1
	fi
}

assert_security_headers() {
	local pathname="$1"
	local expected_origin="$2"

	if [[ "$expected_origin" == https://* ]]; then
		assert_probe_header \
			"$pathname" \
			'strict-transport-security' \
			"$PROBE_STRICT_TRANSPORT_SECURITY" \
			"$HSTS_HEADER_VALUE"
	fi

	assert_probe_header \
		"$pathname" \
		'x-frame-options' \
		"$PROBE_X_FRAME_OPTIONS" \
		"$FRAME_OPTIONS_HEADER_VALUE"
	assert_probe_header \
		"$pathname" \
		'x-content-type-options' \
		"$PROBE_X_CONTENT_TYPE_OPTIONS" \
		"$CONTENT_TYPE_OPTIONS_HEADER_VALUE"
	assert_probe_header \
		"$pathname" \
		'referrer-policy' \
		"$PROBE_REFERRER_POLICY" \
		"$REFERRER_POLICY_HEADER_VALUE"
	assert_probe_header \
		"$pathname" \
		'permissions-policy' \
		"$PROBE_PERMISSIONS_POLICY" \
		"$PERMISSIONS_POLICY_HEADER_VALUE"
}

assert_browser_navigation_redirect_probe() {
	local url="$1"
	local pathname="$2"
	local expected_origin="$3"

	run_probe "$url" "${BROWSER_NAVIGATION_PROBE_HEADERS[@]}"

	if [[ "$PROBE_STATUS" != "303" ]]; then
		echo "Expected $url to return 303, received $PROBE_STATUS" >&2
		exit 1
	fi

	if [[ "$PROBE_EFFECTIVE_URL" != "$url" ]]; then
		echo "Expected $url probe to stay on the canonical origin, received $PROBE_EFFECTIVE_URL" >&2
		exit 1
	fi

	if [[ -z "$PROBE_LOCATION" ]]; then
		echo "Expected $pathname to include a redirect location" >&2
		exit 1
	fi

	assert_security_headers "$pathname" "$expected_origin"
}

assert_callback_landing_probe() {
	local expected_origin="$1"
	local probe_origin="$2"
	local location="$3"
	local probe_url
	local incident_id

	probe_url="$(resolve_probe_url "$expected_origin" "$probe_origin" "$location")"
	incident_id="$(read_callback_incident_id "$expected_origin" "$location")"

	run_probe "$probe_url" "${BROWSER_NAVIGATION_PROBE_HEADERS[@]}"

	if [[ "$PROBE_STATUS" != "200" ]]; then
		echo "Expected callback landing page $probe_url to return 200, received $PROBE_STATUS" >&2
		exit 1
	fi

	if [[ "$PROBE_EFFECTIVE_URL" != "$probe_url" ]]; then
		echo "Expected callback landing page to stay on $probe_url, received $PROBE_EFFECTIVE_URL" >&2
		exit 1
	fi

	if [[ -n "$PROBE_LOCATION" ]]; then
		echo "Expected callback landing page not to redirect, received location $PROBE_LOCATION" >&2
		exit 1
	fi

	if [[ "$PROBE_BODY" != *"$EXPECTED_AUTH_ERROR_MESSAGE"* || "$PROBE_BODY" != *"$incident_id"* ]]; then
		echo "Expected callback landing page to render the verified auth error banner" >&2
		exit 1
	fi

	assert_security_headers 'callback landing page' "$expected_origin"
	assert_probe_header \
		'callback landing page' \
		'cache-control' \
		"$PROBE_CACHE_CONTROL" \
		"$PRIVATE_NO_STORE_CACHE_CONTROL"
}

assert_no_redirect_probe() {
	local url="$1"
	local expected_status="$2"
	local pathname="$3"
	local expected_origin="$4"

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

	assert_security_headers "$pathname" "$expected_origin"
}

expected_origin="$(canonicalize_origin "$DEPLOY_ORIGIN_VALUE" 'DEPLOY_ORIGIN')"
probe_origin="$(canonicalize_origin "$DEPLOY_PROBE_ORIGIN_VALUE" 'DEPLOY_PROBE_ORIGIN')"
expected_auth_origin="$(resolve_expected_auth_origin "$WORKOS_API_HOSTNAME_VALUE")"
expected_callback_url="$(request_url "$expected_origin" "$CALLBACK_PATH")"

root_url="$(request_url "$probe_origin" "$ROOT_PATH")"
assert_no_redirect_probe "$root_url" "200" "$ROOT_PATH" "$expected_origin"
assert_probe_header \
	"$ROOT_PATH" \
	'cache-control' \
	"$PROBE_CACHE_CONTROL" \
	"$PUBLIC_DOCUMENT_CACHE_CONTROL"

health_url="$(request_url "$probe_origin" "$HEALTH_PATH")"
assert_no_redirect_probe "$health_url" "200" "$HEALTH_PATH" "$expected_origin"
assert_probe_header \
	"$HEALTH_PATH" \
	'cache-control' \
	"$PROBE_CACHE_CONTROL" \
	"$HEALTH_CACHE_CONTROL"
if [[ "$PROBE_BODY" != "$EXPECTED_HEALTH_BODY" ]]; then
	echo "Expected $HEALTH_PATH to return plain-text $EXPECTED_HEALTH_BODY" >&2
	exit 1
fi

services_url="$(request_url "$probe_origin" "$SERVICES_PATH")"
assert_browser_navigation_redirect_probe \
	"$services_url" \
	"$SERVICES_PATH" \
	"$expected_origin"
assert_probe_header \
	"$SERVICES_PATH" \
	'cache-control' \
	"$PROBE_CACHE_CONTROL" \
	"$PRIVATE_NO_STORE_CACHE_CONTROL"
validate_services_redirect "$expected_origin" "$PROBE_LOCATION" "$SIGN_IN_PATH"

sign_in_url="$(request_url "$probe_origin" "$SIGN_IN_PATH")"
assert_browser_navigation_redirect_probe \
	"$sign_in_url" \
	"$SIGN_IN_PATH" \
	"$expected_origin"
assert_probe_header \
	"$SIGN_IN_PATH" \
	'cache-control' \
	"$PROBE_CACHE_CONTROL" \
	"$PRIVATE_NO_STORE_CACHE_CONTROL"
validate_sign_in_redirect \
	"$expected_origin" \
	"$expected_auth_origin" \
	"$expected_callback_url" \
	"$WORKOS_AUTHORIZE_PATH" \
	"$PROBE_LOCATION"

callback_url="$(request_url "$probe_origin" "$CALLBACK_PATH")"
assert_browser_navigation_redirect_probe \
	"$callback_url" \
	"$CALLBACK_PATH" \
	"$expected_origin"
assert_probe_header \
	"$CALLBACK_PATH" \
	'cache-control' \
	"$PROBE_CACHE_CONTROL" \
	"$PRIVATE_NO_STORE_CACHE_CONTROL"
validate_callback_redirect \
	"$expected_origin" \
	"$PROBE_LOCATION"
assert_callback_landing_probe \
	"$expected_origin" \
	"$probe_origin" \
	"$PROBE_LOCATION"
