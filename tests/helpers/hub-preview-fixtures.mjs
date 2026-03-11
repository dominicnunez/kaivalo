import http from 'node:http';

const PEER_ADDRESS_OVERRIDE_HEADER = 'x-kaivalo-preview-peer-address';
const PREVIEW_SESSION_COOKIE_NAME = '__Host-wos_session';
const PREVIEW_SESSION_COOKIE_VALUE = 'preview-session';
const PREVIEW_SESSION_COOKIE_PAIR = `${PREVIEW_SESSION_COOKIE_NAME}=${PREVIEW_SESSION_COOKIE_VALUE}`;
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

const signInFixtureMode = process.env.HUB_PREVIEW_SIGN_IN_FIXTURE_MODE;
if (signInFixtureMode) {
	const { authKit } = await import('@workos/authkit-sveltekit');
	authKit.getSignInUrl = async () => {
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
	const { authKit } = await import('@workos/authkit-sveltekit');
	const originalGetUser = authKit.getUser.bind(authKit);

	authKit.handleCallback = () => async () => {
		switch (callbackFixtureMode) {
			case 'signed-in': {
				const headers = new Headers();
				headers.set('location', `${process.env.ORIGIN}/services?welcome=1`);
				headers.set(
					'set-cookie',
					`${PREVIEW_SESSION_COOKIE_PAIR}; Path=/; HttpOnly; Secure; SameSite=Lax`
				);
				return new Response(null, {
					status: 302,
					headers
				});
			}
			default:
				throw new Error(
					`Unsupported HUB_PREVIEW_CALLBACK_FIXTURE_MODE: ${callbackFixtureMode}`
				);
		}
	};

	authKit.getUser = async (event) => {
		const cookieHeader = event.request.headers.get('cookie') ?? '';
		if (cookieHeader.includes(PREVIEW_SESSION_COOKIE_PAIR)) {
			return PREVIEW_USER;
		}

		return originalGetUser(event);
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
			default:
				throw new Error(
					`Unsupported HUB_PREVIEW_AVATAR_FIXTURE_MODE: ${avatarFixtureMode}`
				);
		}
	};
}
