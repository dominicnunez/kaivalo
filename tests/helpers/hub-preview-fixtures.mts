import http from 'node:http';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { AVATAR_MAX_RESPONSE_BYTES } from '../../apps/hub/src/lib/server/avatar-proxy.ts';

const PEER_ADDRESS_OVERRIDE_HEADER = 'x-kaivalo-preview-peer-address';
const PREVIEW_SESSION_COOKIE_VALUE = 'preview-session';
const OVERSIZED_AVATAR_CONTENT_LENGTH = String(AVATAR_MAX_RESPONSE_BYTES + 1);
const PREVIEW_USER = Object.freeze({
	object: 'user',
	id: 'user_preview_fixture',
	firstName: 'Preview User',
	email: 'preview-user@example.com',
	emailVerified: true,
	profilePictureUrl: null,
	lastName: null,
	lastSignInAt: '2026-03-10T12:00:00.000Z',
	locale: 'en',
	createdAt: '2026-03-01T12:00:00.000Z',
	updatedAt: '2026-03-10T12:00:00.000Z',
	externalId: null,
	metadata: {}
});
const PREVIEW_USER_AUTH_RESPONSE = Object.freeze({
	object: 'user',
	id: PREVIEW_USER.id,
	email: PREVIEW_USER.email,
	email_verified: PREVIEW_USER.emailVerified,
	first_name: PREVIEW_USER.firstName,
	profile_picture_url: PREVIEW_USER.profilePictureUrl,
	last_name: PREVIEW_USER.lastName,
	last_sign_in_at: PREVIEW_USER.lastSignInAt,
	locale: PREVIEW_USER.locale,
	created_at: PREVIEW_USER.createdAt,
	updated_at: PREVIEW_USER.updatedAt,
	external_id: PREVIEW_USER.externalId,
	metadata: PREVIEW_USER.metadata
});
const PREVIEW_AUTHENTICATE_PATHNAME = '/user_management/authenticate';

const originalCreateServer = http.createServer.bind(http);
http.createServer = function patchedCreateServer(...args) {
	const server = originalCreateServer(...args);

	server.prependListener('request', (req) => {
		const overrideHeader = req.headers[PEER_ADDRESS_OVERRIDE_HEADER];
		const overrideValue = Array.isArray(overrideHeader)
			? overrideHeader[0]
			: overrideHeader;
		if (typeof overrideValue !== 'string') {
			return;
		}

		const normalizedValue = overrideValue.trim();
		const remoteAddress =
			normalizedValue.toLowerCase() === 'missing'
				? undefined
				: normalizedValue || undefined;

		applyRemoteAddressOverride(req.socket, remoteAddress);
		if (req.connection && req.connection !== req.socket) {
			applyRemoteAddressOverride(req.connection, remoteAddress);
		}

		const connectionSocket = req.connection?.socket;
		if (
			connectionSocket &&
			typeof connectionSocket === 'object' &&
			connectionSocket !== req.socket
		) {
			applyRemoteAddressOverride(connectionSocket, remoteAddress);
		}
	});

	return server;
};

function applyRemoteAddressOverride(target, remoteAddress) {
	if (!target || typeof target !== 'object') {
		return;
	}

	Object.defineProperty(target, 'remoteAddress', {
		configurable: true,
		value: remoteAddress
	});
}

function getPreviewAuthOrigin() {
	return `https://${process.env.WORKOS_API_HOSTNAME || 'api.workos.com'}`;
}

function getPreviewJwksPathname() {
	return `/sso/jwks/${process.env.WORKOS_CLIENT_ID || ''}`;
}

function createPreviewJsonResponse(body) {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: {
			'content-type': 'application/json'
		}
	});
}

const { privateKey: callbackSigningKey, publicKey: callbackPublicKey } =
	generateKeyPairSync('rsa', {
		modulusLength: 2048
	});
const callbackPublicJwk = callbackPublicKey.export({
	format: 'jwk'
});
callbackPublicJwk.alg = 'RS256';
callbackPublicJwk.kid = 'preview-callback-key';
callbackPublicJwk.use = 'sig';

async function createPreviewAccessToken() {
	const now = Math.floor(Date.now() / 1000);
	const header = Buffer.from(
		JSON.stringify({
			alg: 'RS256',
			kid: String(callbackPublicJwk.kid),
			typ: 'JWT'
		}),
		'utf8'
	).toString('base64url');
	const payload = Buffer.from(
		JSON.stringify({
			sid: PREVIEW_SESSION_COOKIE_VALUE,
			sub: PREVIEW_USER.id,
			iat: now,
			exp: now + 60 * 60
		}),
		'utf8'
	).toString('base64url');
	const signingInput = `${header}.${payload}`;
	const signer = createSign('RSA-SHA256');
	signer.update(signingInput);
	signer.end();

	return `${signingInput}.${signer.sign(callbackSigningKey).toString('base64url')}`;
}

const signInFixtureMode = process.env.HUB_PREVIEW_SIGN_IN_FIXTURE_MODE;
if (signInFixtureMode) {
	const { AuthService } = await import('@workos/authkit-session');
	AuthService.prototype.getSignInUrl = async function signInFixtureUrl() {
		switch (signInFixtureMode) {
			case 'same-origin':
				return `${process.env.ORIGIN}/services?welcome=1#hero`;
			case 'self-referential':
				return `${process.env.ORIGIN}/auth/sign-in?screen_hint=sign-up#hero`;
			case 'untrusted-origin':
				return 'https://evil.example/login';
			case 'throw':
				throw new Error('fixture sign-in failure');
			default:
				throw new Error(
					`Unsupported HUB_PREVIEW_SIGN_IN_FIXTURE_MODE: ${signInFixtureMode}`
				);
		}
	};
}

const callbackFixtureMode = process.env.HUB_PREVIEW_CALLBACK_FIXTURE_MODE;
if (callbackFixtureMode) {
	const originalFetch = globalThis.fetch.bind(globalThis);

	globalThis.fetch = async (input, init) => {
		const request =
			input instanceof Request ? input : new Request(String(input), init);
		const requestUrl = new URL(request.url);
		if (requestUrl.origin !== getPreviewAuthOrigin()) {
			return originalFetch(input, init);
		}

		if (requestUrl.pathname === PREVIEW_AUTHENTICATE_PATHNAME) {
			switch (callbackFixtureMode) {
				case 'signed-in':
					return createPreviewJsonResponse({
						access_token: await createPreviewAccessToken(),
						refresh_token: 'preview-refresh-token',
						user: PREVIEW_USER_AUTH_RESPONSE
					});
				case 'auth-error-redirect':
				case 'throw':
					throw new Error('fixture callback failure: preview secret');
				default:
					throw new Error(
						`Unsupported HUB_PREVIEW_CALLBACK_FIXTURE_MODE: ${callbackFixtureMode}`
					);
			}
		}

		if (requestUrl.pathname === getPreviewJwksPathname()) {
			return createPreviewJsonResponse({
				keys: [callbackPublicJwk]
			});
		}

		return originalFetch(input, init);
	};
}

const signOutFixtureMode = process.env.HUB_PREVIEW_SIGN_OUT_FIXTURE_MODE;
if (signOutFixtureMode) {
	if (signOutFixtureMode !== 'throw') {
		throw new Error(
			`Unsupported HUB_PREVIEW_SIGN_OUT_FIXTURE_MODE: ${signOutFixtureMode}`
		);
	}

	const { AuthService } = await import('@workos/authkit-session');
	AuthService.prototype.signOut = async function signOutFixtureFailure() {
		throw new Error('fixture sign-out failure: preview secret');
	};
}

const avatarFixtureMode = process.env.HUB_PREVIEW_AVATAR_FIXTURE_MODE;
if (avatarFixtureMode) {
	const originalFetch = globalThis.fetch.bind(globalThis);

	globalThis.fetch = async (input, init) => {
		const requestUrl =
			typeof input === 'string' || input instanceof URL
				? new URL(String(input))
				: input instanceof Request
					? new URL(input.url)
					: null;
		if (requestUrl?.hostname !== 'avatars.githubusercontent.com') {
			return originalFetch(input, init);
		}

		switch (avatarFixtureMode) {
			case 'success':
				return new Response('image-bytes', {
					status: 200,
					headers: {
						'cache-control':
							'public, max-age=600, stale-while-revalidate=86400',
						'content-type': 'image/png',
						'content-length': '11',
						etag: '"avatar-1"'
					}
				});
			case 'timeout':
				throw new DOMException(
					'fixture avatar fetch timed out',
					'TimeoutError'
				);
			case 'non-image':
				return new Response('<html>not image</html>', {
					status: 200,
					headers: {
						'content-type': 'text/html; charset=utf-8',
						'content-length': '22'
					}
				});
			case 'upstream-error':
				return new Response('upstream failure', {
					status: 503,
					headers: {
						'content-type': 'text/plain; charset=utf-8'
					}
				});
			case 'oversized':
				return new Response('image-bytes', {
					status: 200,
					headers: {
						'content-type': 'image/png',
						'content-length': OVERSIZED_AVATAR_CONTENT_LENGTH,
						etag: '"avatar-oversized"'
					}
				});
			default:
				throw new Error(
					`Unsupported HUB_PREVIEW_AVATAR_FIXTURE_MODE: ${avatarFixtureMode}`
				);
		}
	};
}
