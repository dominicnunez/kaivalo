import type { PageLoad } from './$types';

export const load: PageLoad = () => {
	return {
		meta: {
			title: 'Kai Valo | Tools That Solve Things',
			description: 'Simple tools for complicated problems. One account, every tool — sign up once and go.',
			url: 'https://kaivalo.com',
			image: 'https://kaivalo.com/og-image.png',
			imageAlt: 'Kai Valo - AI Tools That Actually Help',
			twitterCard: 'summary_large_image'
		}
	};
};
