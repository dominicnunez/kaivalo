import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { httpGet, startHubPreview } from './helpers/hub-preview.ts';

let preview;
let homepage;
let dom;
let document;

describe('hub auth and footer controls', () => {
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

	it('renders auth controls with visible text labels and icon affordances', () => {
		assert.strictEqual(homepage.statusCode, 200);

		const controls = [...document.querySelectorAll('a, button')];
		const signInLink = controls.find(
			(control) =>
				control.tagName.toLowerCase() === 'a' &&
				/sign in/i.test(control.textContent ?? '')
		);
		const signInUnavailableButton = controls.find(
			(control) =>
				control.tagName.toLowerCase() === 'button' &&
				/sign in unavailable/i.test(control.textContent ?? '')
		);

		assert.ok(
			signInLink || signInUnavailableButton,
			'Expected either a sign-in link or an unavailable sign-in button state'
		);

		const signInControl = signInLink ?? signInUnavailableButton;
		assert.ok(signInControl, 'Expected a rendered sign-in control');
		const icon = signInControl.querySelector('svg');
		assert.ok(icon, 'Expected sign-in control to render an icon SVG');
		assert.ok(
			/sign in/i.test(signInControl.textContent ?? ''),
			'Expected sign-in control to include visible text'
		);
		assert.strictEqual(icon.getAttribute('aria-hidden'), 'true');
	});

	it('renders service cards with icon affordances and the shared footer', () => {
		const servicesSection = document.getElementById('services');
		assert.ok(servicesSection, 'Expected a services section');

		const expectedServiceTitles = ['Sweep', 'PodStudio'];
		for (const title of expectedServiceTitles) {
			const cardTitle = [...servicesSection.querySelectorAll('h3')].find(
				(heading) => heading.textContent?.trim() === title
			);
			assert.ok(cardTitle, `Expected a service card titled "${title}"`);
			const card = cardTitle.closest('.service-card');
			assert.ok(
				card,
				`Expected "${title}" to render inside a service card container`
			);
			assert.ok(
				card.querySelector('svg'),
				`Expected "${title}" card to render an icon`
			);
		}

		const footer = document.querySelector('footer');
		assert.ok(footer, 'Expected the shared footer to render');
		assert.match(footer.textContent ?? '', /Kaivalo/);
	});
});
