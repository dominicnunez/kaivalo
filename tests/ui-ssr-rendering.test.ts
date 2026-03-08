import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { startHubPreview, httpGet } from './helpers/hub-preview.ts';

describe('ui package SSR markup', () => {
	let preview;
	let homepage;
	let dom;
	let document;

	before(async () => {
		preview = await startHubPreview();
		homepage = await httpGet(preview.baseUrl);
		dom = new JSDOM(homepage.data, { url: preview.baseUrl });
		document = dom.window.document;
	});

	after(async () => {
		dom?.window.close();
		await preview?.stop();
	});

	it('renders a valid unauthenticated auth control and a contact control', () => {
		assert.strictEqual(homepage.statusCode, 200);

		const controls = Array.from(document.querySelectorAll('a,button'));
		const signInLink = controls.find(
			(element) =>
				element.tagName.toLowerCase() === 'a' &&
				/sign in/i.test(element.textContent ?? '')
		);
		const signInUnavailableButton = controls.find(
			(element) =>
				element.tagName.toLowerCase() === 'button' &&
				/sign in unavailable/i.test(element.textContent ?? '')
		);

		assert.ok(
			signInLink || signInUnavailableButton,
			'Expected either an interactive sign-in link or an unavailable sign-in button'
		);

		if (signInLink) {
			const href = signInLink.getAttribute('href');
			assert.ok(href, 'Sign-in link must include an href');

			const parsed = new URL(href, preview.baseUrl);
			const trustedHost =
				parsed.origin === new URL(preview.baseUrl).origin ||
				parsed.origin === 'https://api.workos.com';
			const trustedPath =
				parsed.pathname.startsWith('/auth/sign-in') ||
				parsed.pathname.startsWith('/user_management/authorize');
			assert.ok(trustedHost, `Unexpected sign-in origin: ${parsed.origin}`);
			assert.ok(trustedPath, `Unexpected sign-in path: ${parsed.pathname}`);
		}

		if (signInUnavailableButton) {
			assert.strictEqual(
				signInUnavailableButton.getAttribute('type'),
				'button'
			);
			assert.strictEqual(signInUnavailableButton.getAttribute('disabled'), '');
			assert.strictEqual(
				signInUnavailableButton.getAttribute('aria-disabled'),
				'true'
			);
		}

		const contactLink = controls.find(
			(element) =>
				element.tagName.toLowerCase() === 'a' &&
				element.getAttribute('href') === 'mailto:kaivalo@proton.me' &&
				/contact/i.test(element.textContent ?? '')
		);
		assert.ok(
			contactLink,
			'Expected a mailto contact control with a visible label'
		);
	});
});
