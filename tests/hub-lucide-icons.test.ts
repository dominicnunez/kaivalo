import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { httpGet, startHubPreview } from './helpers/hub-preview.ts';

const AUTHKIT_COOKIE_NAME = '__Host-wos_session';
const previewFixtureImport = new URL(
	'./helpers/hub-preview-fixtures.mjs',
	import.meta.url
).href;

let preview;
let publicHomepage;
let signedInHomepage;
let servicesPage;
let publicDom;
let signedInDom;
let servicesDom;

function getCookiePair(
	headers: Record<string, string | string[] | undefined>,
	cookieName: string
): string {
	const rawSetCookie = headers['set-cookie'];
	const values = Array.isArray(rawSetCookie)
		? rawSetCookie
		: rawSetCookie
			? [rawSetCookie]
			: [];
	const cookieHeader = values.find((value) =>
		value.startsWith(`${cookieName}=`)
	);
	assert.ok(cookieHeader, `Expected ${cookieName} to be set`);
	return cookieHeader.split(';', 1)[0];
}

function findServiceCard(document: Document, heading: string): Element {
	const cardHeading = Array.from(
		document.querySelectorAll('.service-card h3')
	).find((element) => element.textContent?.trim() === heading);
	assert.ok(cardHeading, `Expected a service card titled "${heading}"`);
	const serviceCard = cardHeading.closest('.service-card');
	assert.ok(
		serviceCard,
		`Expected "${heading}" to render inside a service card`
	);
	return serviceCard;
}

function expectLucideIcon(
	container: ParentNode,
	iconClass: string,
	context: string
): void {
	assert.ok(
		container.querySelector(`svg.lucide.${iconClass}`),
		`Expected ${context} to render ${iconClass}`
	);
}

describe('hub lucide icon rendering', () => {
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
		const sessionCookie = getCookiePair(
			callbackResponse.headers,
			AUTHKIT_COOKIE_NAME
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

	it('renders public landing page lucide icons from the real preview bundle', () => {
		assert.strictEqual(publicHomepage.statusCode, 200);
		const document = publicDom.window.document;

		const signInLink = Array.from(document.querySelectorAll('a[href]')).find(
			(control) => /sign in/i.test(control.textContent ?? '')
		);
		assert.ok(signInLink, 'Expected an interactive sign-in link');
		expectLucideIcon(signInLink, 'lucide-log-in', 'the sign-in control');

		expectLucideIcon(
			findServiceCard(document, 'Sweep'),
			'lucide-calendar',
			'the Sweep service card'
		);
		expectLucideIcon(
			findServiceCard(document, 'PodStudio'),
			'lucide-mic',
			'the PodStudio service card'
		);

		const openServicesLink = Array.from(
			document.querySelectorAll('#services a[href]')
		).find((link) => /open from your services/i.test(link.textContent ?? ''));
		assert.ok(openServicesLink, 'Expected an open services link');
		expectLucideIcon(
			openServicesLink,
			'lucide-arrow-right',
			'the open services link'
		);
	});

	it('renders authenticated navigation and launcher lucide icons in preview', () => {
		assert.strictEqual(signedInHomepage.statusCode, 200);
		assert.strictEqual(servicesPage.statusCode, 200);

		const signedInDocument = signedInDom.window.document;
		const servicesDocument = servicesDom.window.document;

		const openServicesLink = Array.from(
			signedInDocument.querySelectorAll('a[href]')
		).find((link) => /open services/i.test(link.textContent ?? ''));
		assert.ok(openServicesLink, 'Expected an authenticated open services link');
		expectLucideIcon(
			openServicesLink,
			'lucide-layout-dashboard',
			'the authenticated open services link'
		);

		const signOutButton = Array.from(
			signedInDocument.querySelectorAll('button')
		).find((button) => /sign out/i.test(button.textContent ?? ''));
		assert.ok(signOutButton, 'Expected a sign-out button');
		expectLucideIcon(signOutButton, 'lucide-log-out', 'the sign-out button');

		const launcherLink = Array.from(
			servicesDocument.querySelectorAll('a[href]')
		).find((link) => /open sweep/i.test(link.textContent ?? ''));
		assert.ok(launcherLink, 'Expected a launcher link for Sweep');
		expectLucideIcon(
			launcherLink,
			'lucide-external-link',
			'the Sweep launcher link'
		);
	});
});
