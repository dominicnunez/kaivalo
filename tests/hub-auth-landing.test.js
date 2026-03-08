import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import {
	startHubPreview,
	httpGet,
	createAuthenticatedPreviewHeaders
} from './helpers/hub-preview.js';

describe('auth landing page behavior', () => {
	const trustedPathPrefixes = ['/auth/sign-in', '/user_management/authorize'];
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

	it('renders sign-in navigation for unauthenticated visitors', () => {
		assert.strictEqual(homepage.statusCode, 200);
		const signInControl = Array.from(document.querySelectorAll('a[href]')).find(
			(anchor) => (anchor.textContent ?? '').toLowerCase().includes('sign in')
		);

		assert.ok(
			signInControl,
			'Expected a sign-in link for unauthenticated users'
		);
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

	it('renders auth-unavailable messaging when auth calls fail', async () => {
		const failureResponse = await httpGet(preview.baseUrl, {
			'x-kaivalo-test-auth-failure': '1'
		});
		const failureDom = new JSDOM(failureResponse.data);
		const failureDocument = failureDom.window.document;

		try {
			assert.strictEqual(failureResponse.statusCode, 200);

			const banner = failureDocument.querySelector('.auth-error-banner');
			assert.ok(banner, 'Expected auth error banner when layout auth fails');
			const bannerText = (banner.textContent ?? '').replace(/\s+/g, ' ').trim();
			assert.ok(
				bannerText.includes(
					'Sign-in is temporarily unavailable. Please try again shortly.'
				),
				'Expected auth-unavailable copy in banner'
			);
			assert.match(bannerText, /\(ref authlayout_[a-f0-9-]+\)/i);

			const unavailableButton = Array.from(
				failureDocument.querySelectorAll('button')
			).find((button) =>
				(button.textContent ?? '').toLowerCase().includes('sign in unavailable')
			);
			assert.ok(
				unavailableButton,
				'Expected disabled sign-in button when auth is unavailable'
			);
			assert.strictEqual(unavailableButton?.getAttribute('disabled') ?? '', '');
		} finally {
			failureDom.window.close();
		}
	});

	it('renders signed-in controls for an authenticated runtime session fixture', async () => {
		const signedInResponse = await httpGet(
			preview.baseUrl,
			createAuthenticatedPreviewHeaders({
				firstName: 'Kai',
				email: 'kai@example.com',
				profilePictureUrl: 'https://attacker.example/avatar.png'
			})
		);
		const signedInDom = new JSDOM(signedInResponse.data);
		const signedInDocument = signedInDom.window.document;

		try {
			assert.strictEqual(signedInResponse.statusCode, 200);
			assert.strictEqual(
				signedInResponse.headers['cache-control'],
				'private, no-store'
			);
			const signOutForm = signedInDocument.querySelector(
				'form[action="/auth/sign-out"]'
			);
			assert.ok(signOutForm, 'Expected sign-out form for signed-in visitors');
			assert.match(
				signedInDocument.body.textContent ?? '',
				/\bKai\b/,
				'Expected rendered signed-in user name'
			);

			const signInLink = Array.from(
				signedInDocument.querySelectorAll('a[href]')
			).find((anchor) =>
				(anchor.textContent ?? '').toLowerCase().includes('sign in')
			);
			assert.strictEqual(signInLink, undefined);

			const avatarImage = signedInDocument.querySelector('img[alt="Kai"]');
			assert.strictEqual(
				avatarImage,
				null,
				'Expected untrusted avatar URLs to be dropped in the real runtime path'
			);
			assert.match(
				signOutForm.parentElement?.textContent ?? '',
				/\bK\b/,
				'Expected fallback avatar initial when profile image is rejected'
			);
		} finally {
			signedInDom.window.close();
		}
	});
});
