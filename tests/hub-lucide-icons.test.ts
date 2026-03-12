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

	it('renders a visible sign-in control on the homepage', () => {
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
		assert.ok(
			/sign in/i.test(signInControl.textContent ?? ''),
			'Expected sign-in control to include visible text'
		);
	});

	it('renders services content with a launch action and the shared footer', () => {
		const servicesSection = document.getElementById('services');
		assert.ok(servicesSection, 'Expected a services section');

		const expectedServiceTitles = ['Sweep', 'PodStudio'];
		for (const title of expectedServiceTitles) {
			const cardTitle = [...servicesSection.querySelectorAll('h3')].find(
				(heading) => heading.textContent?.trim() === title
			);
			assert.ok(cardTitle, `Expected a service card titled "${title}"`);
		}

		const openServicesLink = [
			...servicesSection.querySelectorAll('a[href]')
		].find((link) => link.getAttribute('href') === '/services');
		assert.ok(
			openServicesLink,
			'Expected the services section to expose the /services action'
		);

		const footer = document.querySelector('footer');
		assert.ok(footer, 'Expected the shared footer to render');
		assert.match(footer.textContent ?? '', /Kaivalo/);
	});

	it('renders user-visible state and actions in every visible service card', () => {
		const servicesSection = document.getElementById('services');
		assert.ok(servicesSection, 'Expected a services section');

		const serviceCards = [...servicesSection.querySelectorAll('.service-card')];
		assert.ok(serviceCards.length > 0, 'Expected at least one service card');

		for (const serviceCard of serviceCards) {
			const title = serviceCard.querySelector('h3')?.textContent?.trim();
			assert.ok(title, 'Expected each service card to expose a title');

			const status = [...serviceCard.querySelectorAll('span')].find((badge) =>
				/^(Active|Soon)$/i.test(badge.textContent?.trim() ?? '')
			);
			assert.ok(status, `Expected ${title} to expose a visible status`);

			if (/^active$/i.test(status.textContent?.trim() ?? '')) {
				const launchLink = [...serviceCard.querySelectorAll('a[href]')].find(
					(link) =>
						link.getAttribute('href') === '/services' &&
						/Open from your services/i.test(link.textContent ?? '')
				);
				assert.ok(
					launchLink,
					`Expected active service ${title} to expose a launcher action`
				);
			}
		}
	});
});
