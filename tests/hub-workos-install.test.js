import { describe, it } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { httpGet, startHubPreview } from './helpers/hub-preview.js';

describe('WorkOS AuthKit Installation', () => {
	it('preview renders an unauthenticated auth entrypoint with fixture WorkOS configuration', async () => {
		const preview = await startHubPreview();
		try {
			const homepage = await httpGet(preview.baseUrl);
			assert.strictEqual(
				homepage.statusCode,
				200,
				'preview should respond successfully'
			);
			const dom = new JSDOM(homepage.data);
			const { document } = dom.window;
			const signInControl = Array.from(
				document.querySelectorAll('a[href]')
			).find((anchor) =>
				(anchor.textContent ?? '').toLowerCase().includes('sign in')
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
					'Expected sign-in target to stay on the application origin'
				);
				const target = new URL(href, preview.baseUrl);
				assert.match(
					target.pathname,
					/^\/(?:auth\/sign-in|user_management\/authorize)(?:\/|$)/
				);
			} else {
				const target = new URL(href);
				assert.strictEqual(target.protocol, 'https:');
				assert.ok(
					target.origin === 'https://api.workos.com' ||
						target.origin === new URL(preview.baseUrl).origin,
					'Expected sign-in target to use a trusted origin'
				);
				assert.match(
					target.pathname,
					/^\/(?:auth\/sign-in|user_management\/authorize)(?:\/|$)/
				);
			}
			assert.ok(!homepage.data.includes('action="/auth/sign-out"'));
			dom.window.close();
		} finally {
			await preview.stop();
		}
	});
});
