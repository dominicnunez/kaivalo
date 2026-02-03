import type { PageLoad } from './$types';

export const load: PageLoad = () => {
	return {
		meta: {
			title: 'Kai Valo | AI Tools That Actually Help',
			description: 'Practical AI tools built by Kai Valo. No hype, just utility. Decode mechanic speak, understand what you\'re paying for, and more.',
			url: 'https://kaivalo.com',
			image: 'https://kaivalo.com/og-image.png',
			imageAlt: 'Kai Valo - AI Tools That Actually Help',
			twitterCard: 'summary_large_image'
		}
	};
};
