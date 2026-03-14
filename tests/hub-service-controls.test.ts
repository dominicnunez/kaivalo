import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { httpGet, startHubPreview } from './helpers/hub-preview.ts';
import { assertSessionCookieContract } from './helpers/session-cookie.ts';

const AUTHKIT_COOKIE_NAME = '__Host-wos_session';
const previewFixtureImport = new URL(
	'./helpers/hub-preview-fixtures.mts',
	import.meta.url
).href;

let preview;
let publicHomepage;
let signedInHomepage;
let servicesPage;
let publicDom;
let signedInDom;
let servicesDom;

function findLinkByText(
	container: ParentNode,
	pattern: RegExp
): HTMLAnchorElement | null {
	return (
		Array.from(container.querySelectorAll('a[href]')).find((link) =>
			pattern.test(link.textContent ?? '')
		) ?? null
	);
}

function findButtonByText(
	container: ParentNode,
	pattern: RegExp
): HTMLButtonElement | null {
	return (
		Array.from(container.querySelectorAll('button')).find((button) =>
			pattern.test(button.textContent ?? '')
		) ?? null
	);
}

function findByTestId(container: ParentNode, testId: string): Element {
	const element = container.querySelector(`[data-testid="${testId}"]`);
	assert.ok(
		element,
		`Expected an element with data-testid="${testId}" to exist`
	);
	return element;
}

describe('hub preview service controls', () => {
	before(async () => {
		preview = await startHubPreview({
			shared: false,
			env: {
				HUB_PREVIEW_CALLBACK_FIXTURE_MODE: 'signed-in'
			},
			imports: [previewFixtureImport]
		});

		publicHomepage = await httpGet(preview.baseUrl);
		publicDom = new JSDOM(publicHomepage.data, { url: preview.baseUrl });

		const callbackResponse = await httpGet(
			`${preview.baseUrl}/auth/callback?code=test-code&state=test-state`,
			{
				accept: 'text/html',
				'sec-fetch-mode': 'navigate'
			}
		);
		const sessionCookie = assertSessionCookieContract(
			callbackResponse.headers,
			{
				cookieName: AUTHKIT_COOKIE_NAME,
				expectedDecodedValue: 'preview-session'
			}
		);

		signedInHomepage = await httpGet(preview.baseUrl, {
			accept: 'text/html',
			cookie: sessionCookie
		});
		servicesPage = await httpGet(`${preview.baseUrl}/services`, {
			accept: 'text/html',
			cookie: sessionCookie
		});

		signedInDom = new JSDOM(signedInHomepage.data, { url: preview.baseUrl });
		servicesDom = new JSDOM(servicesPage.data, {
			url: `${preview.baseUrl}/services`
		});
	});

	after(async () => {
		publicDom?.window.close();
		signedInDom?.window.close();
		servicesDom?.window.close();
		await preview?.stop();
	});

	it('renders public landing page service controls from the real preview bundle', () => {
		assert.strictEqual(publicHomepage.statusCode, 200);
		const document = publicDom.window.document;
		const servicesSection = document.getElementById('services');
		assert.ok(servicesSection, 'Expected the public services section');

		const signInLink = findLinkByText(document, /sign in/i);
		assert.ok(signInLink, 'Expected an interactive sign-in link');
		assert.ok(
			signInLink.getAttribute('href'),
			'Expected the sign-in control to keep a live destination'
		);
		assert.match(servicesSection.textContent ?? '', /Sweep/);
		assert.match(servicesSection.textContent ?? '', /PodStudio/);

		const openServicesLink = findLinkByText(
			servicesSection,
			/open from your services/i
		);
		assert.ok(openServicesLink, 'Expected an open services link');
		assert.strictEqual(openServicesLink.getAttribute('href'), '/services');
	});

	it('renders authenticated navigation and launcher controls in preview', () => {
		assert.strictEqual(signedInHomepage.statusCode, 200);
		assert.strictEqual(servicesPage.statusCode, 200);

		const signedInDocument = signedInDom.window.document;
		const servicesDocument = servicesDom.window.document;
		const activeServices = findByTestId(servicesDocument, 'active-services');
		const plannedServices = findByTestId(servicesDocument, 'planned-services');

		const openServicesLink = findLinkByText(signedInDocument, /open services/i);
		assert.ok(openServicesLink, 'Expected an authenticated open services link');
		assert.strictEqual(openServicesLink.getAttribute('href'), '/services');

		const signOutButton = findButtonByText(signedInDocument, /sign out/i);
		assert.ok(signOutButton, 'Expected a sign-out button');
		assert.strictEqual(
			signOutButton.closest('form')?.getAttribute('action'),
			'/auth/sign-out'
		);

		assert.match(activeServices.textContent ?? '', /Sweep/);
		assert.match(plannedServices.textContent ?? '', /PodStudio/);

		const launcherLink = findLinkByText(activeServices, /open sweep/i);
		assert.ok(launcherLink, 'Expected a launcher link for Sweep');
		assert.strictEqual(
			launcherLink.getAttribute('href'),
			'https://sweep.kaivalo.com'
		);
	});
});
