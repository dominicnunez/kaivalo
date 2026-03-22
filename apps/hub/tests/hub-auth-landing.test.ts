import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import {
	AUTH_ERROR_QUERY_NAME,
	AUTH_ERROR_QUERY_VALUE,
	AUTH_ERROR_TIMESTAMP_QUERY_NAME,
	readVerifiedAuthError
} from '../src/lib/auth/auth-error-query.ts';
import {
	startHubPreview,
	httpGet
} from '../../../tests/helpers/hub-preview.ts';

describe('auth landing page behavior', () => {
	const trustedPathPrefixes = ['/auth/sign-in', '/user_management/authorize'];
	const previewFixtureImport = new URL(
		'../../../tests/helpers/hub-preview-fixtures.mts',
		import.meta.url
	).href;
	let preview;
	let homepage;
	let dom;
	let document;

	before(async () => {
		preview = await startHubPreview();
		homepage = await httpGet(preview.baseUrl);
		dom = new JSDOM(homepage.data);
		document = dom.window.document;
	});

	after(async () => {
		dom?.window.close();
		await preview?.stop();
	});

	it('renders an interactive sign-in link for unauthenticated users', () => {
		assert.strictEqual(homepage.statusCode, 200);
		const signInControl = Array.from(document.querySelectorAll('a[href]')).find(
			(control) => (control.textContent ?? '').toLowerCase().includes('sign in')
		);

		assert.ok(signInControl, 'Expected an interactive sign-in link');

		const href = signInControl.getAttribute('href') ?? '';
		assert.ok(href.length > 0, 'Expected a non-empty sign-in target');

		if (href.startsWith('/')) {
			assert.ok(
				!href.startsWith('//'),
				'Expected a same-origin relative sign-in path'
			);
			const target = new URL(href, preview.baseUrl);
			assert.ok(
				trustedPathPrefixes.some(
					(prefix) =>
						target.pathname === prefix ||
						target.pathname.startsWith(`${prefix}/`)
				),
				'Expected a trusted sign-in path'
			);
			return;
		}

		const target = new URL(href);
		assert.strictEqual(
			target.protocol,
			'https:',
			'Expected sign-in target to use https'
		);
		assert.ok(
			target.origin === 'https://api.workos.com' ||
				target.origin === new URL(preview.baseUrl).origin,
			'Expected sign-in target to use a trusted origin'
		);
		assert.ok(
			trustedPathPrefixes.some(
				(prefix) =>
					target.pathname === prefix || target.pathname.startsWith(`${prefix}/`)
			),
			'Expected sign-in target to use a trusted path'
		);
	});

	it('redirects direct sign-in requests through the local route to a trusted auth target', async () => {
		const response = await httpGet(`${preview.baseUrl}/auth/sign-in`, {
			accept: 'text/html',
			'sec-fetch-mode': 'navigate'
		});

		assert.strictEqual(response.statusCode, 303);
		assert.ok(response.headers.location, 'Expected a redirect location');

		const location = new URL(
			String(response.headers.location),
			preview.baseUrl
		);
		assert.strictEqual(location.protocol, 'https:');
		assert.strictEqual(location.origin, 'https://api.workos.com');
		assert.ok(
			location.pathname === '/user_management/authorize' ||
				location.pathname.startsWith('/user_management/authorize/'),
			'Expected direct sign-in requests to redirect to WorkOS authorization'
		);
	});

	it('rejects self-referential same-origin sign-in redirects over HTTP', async () => {
		const fixturePreview = await startHubPreview({
			shared: false,
			env: {
				HUB_PREVIEW_SIGN_IN_FIXTURE_MODE: 'self-referential'
			},
			imports: [previewFixtureImport]
		});

		try {
			const response = await httpGet(`${fixturePreview.baseUrl}/auth/sign-in`, {
				accept: 'application/json'
			});

			assert.strictEqual(response.statusCode, 503);
			assert.match(
				response.headers['content-type'] ?? '',
				/^application\/json\b/
			);
			const errorBody = JSON.parse(response.data);
			assert.match(errorBody.message, /^Sign-in failed\. Reference: authsign_/);
		} finally {
			await fixturePreview.stop();
		}
	});

	it('redirects browser sign-in failures back to the landing page with a signed error query', async () => {
		const fixturePreview = await startHubPreview({
			shared: false,
			env: {
				HUB_PREVIEW_SIGN_IN_FIXTURE_MODE: 'throw'
			},
			imports: [previewFixtureImport]
		});

		try {
			const response = await httpGet(`${fixturePreview.baseUrl}/auth/sign-in`, {
				accept: 'text/html',
				'sec-fetch-mode': 'navigate'
			});

			assert.strictEqual(response.statusCode, 303);
			assert.ok(response.headers.location, 'Expected a redirect location');

			const location = new URL(
				String(response.headers.location),
				fixturePreview.baseUrl
			);
			assert.strictEqual(location.pathname, '/');
			assert.strictEqual(
				location.searchParams.get(AUTH_ERROR_QUERY_NAME),
				AUTH_ERROR_QUERY_VALUE
			);

			const verifiedAuthError = readVerifiedAuthError(location.searchParams, {
				secret: 'cd'.repeat(32),
				now: Number(location.searchParams.get(AUTH_ERROR_TIMESTAMP_QUERY_NAME))
			});

			assert.ok(verifiedAuthError, 'Expected a verifiable auth error payload');
			assert.strictEqual(
				verifiedAuthError.message,
				'Sign-in is temporarily unavailable. Please try again shortly.'
			);
			assert.match(verifiedAuthError.incidentId, /^authsign_/);
		} finally {
			await fixturePreview.stop();
		}
	});
});
