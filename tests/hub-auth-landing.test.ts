import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { startHubPreview, httpGet } from './helpers/hub-preview.ts';

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
});
