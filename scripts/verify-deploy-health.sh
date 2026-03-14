#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(
	cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd
)"
readonly REPO_ROOT="$(
	cd -- "$SCRIPT_DIR/.." && pwd
)"
readonly DEPLOY_ORIGIN_VALUE="${DEPLOY_ORIGIN:-}"
readonly AUTH_ERROR_SIGNING_SECRET_VALUE="${AUTH_ERROR_SIGNING_SECRET:-}"
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

cd "$REPO_ROOT"

mapfile -t BROWSER_NAVIGATION_PROBE_HEADERS < <(
	node --input-type=module -e '
		import { getBrowserNavigationProbeHeaders } from "./apps/hub/src/lib/auth/request-policy.ts";
		for (const [name, value] of Object.entries(getBrowserNavigationProbeHeaders())) {
			process.stdout.write(`${name}: ${value}\n`);
		}
	'
)

if [[ -z "$DEPLOY_ORIGIN_VALUE" ]]; then
	echo "DEPLOY_ORIGIN must be set for production health verification" >&2
	exit 1
fi
if [[ -z "$AUTH_ERROR_SIGNING_SECRET_VALUE" ]]; then
	echo "AUTH_ERROR_SIGNING_SECRET must be set for production health verification" >&2
	exit 1
fi

canonicalize_origin() {
	local origin="$1"

	node --input-type=module -e '
		import { normalizeConfiguredOrigin } from "./apps/hub/src/lib/auth/request-policy.ts";
		import { isLoopbackHostname } from "./apps/hub/src/lib/server/ip-address.ts";

		const candidate = normalizeConfiguredOrigin(process.argv[1], "DEPLOY_ORIGIN");
		const parsed = new URL(candidate);
		if (
			parsed.protocol !== "https:" &&
			!(parsed.protocol === "http:" && isLoopbackHostname(parsed.hostname))
		) {
			throw new Error(
				"DEPLOY_ORIGIN must use https unless it targets a loopback host"
			);
		}
		process.stdout.write(candidate);
	' "$origin"
}

resolve_expected_auth_origin() {
	local api_hostname="$1"

	node --input-type=module -e '
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
	local auth_error_signing_secret="$2"
	local location="$3"

	node --input-type=module -e '
		import { readVerifiedAuthError } from "./apps/hub/src/lib/auth/auth-error-query.ts";

		const expectedOrigin = process.argv[1];
		const authErrorSigningSecret = process.argv[2];
		const location = process.argv[3];
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
		const verifiedAuthError = readVerifiedAuthError(parsed.searchParams, {
			secret: authErrorSigningSecret,
			now: Date.now()
		});
		if (!verifiedAuthError) {
			throw new Error(
				"Expected callback redirect to include a valid signed auth error query"
			);
		}
	' "$expected_origin" "$auth_error_signing_secret" "$location"
}

validate_services_redirect() {
	local expected_origin="$1"
	local location="$2"
	local sign_in_path="$3"

	node -e '
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

	node -e '
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
}

assert_browser_navigation_redirect_probe() {
	local url="$1"
	local pathname="$2"

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
expected_auth_origin="$(resolve_expected_auth_origin "$WORKOS_API_HOSTNAME_VALUE")"
expected_callback_url="$(request_url "$expected_origin" "$CALLBACK_PATH")"

root_url="$(request_url "$expected_origin" "$ROOT_PATH")"
assert_no_redirect_probe "$root_url" "200"

health_url="$(request_url "$expected_origin" "$HEALTH_PATH")"
assert_no_redirect_probe "$health_url" "200"
if [[ "$PROBE_BODY" != "$EXPECTED_HEALTH_BODY" ]]; then
	echo "Expected $HEALTH_PATH to return plain-text $EXPECTED_HEALTH_BODY" >&2
	exit 1
fi

services_url="$(request_url "$expected_origin" "$SERVICES_PATH")"
assert_browser_navigation_redirect_probe "$services_url" "$SERVICES_PATH"
validate_services_redirect "$expected_origin" "$PROBE_LOCATION" "$SIGN_IN_PATH"

sign_in_url="$(request_url "$expected_origin" "$SIGN_IN_PATH")"
assert_browser_navigation_redirect_probe "$sign_in_url" "$SIGN_IN_PATH"
validate_sign_in_redirect \
	"$expected_origin" \
	"$expected_auth_origin" \
	"$expected_callback_url" \
	"$WORKOS_AUTHORIZE_PATH" \
	"$PROBE_LOCATION"

callback_url="$(request_url "$expected_origin" "$CALLBACK_PATH")"
assert_browser_navigation_redirect_probe "$callback_url" "$CALLBACK_PATH"
validate_callback_redirect \
	"$expected_origin" \
	"$AUTH_ERROR_SIGNING_SECRET_VALUE" \
	"$PROBE_LOCATION"
