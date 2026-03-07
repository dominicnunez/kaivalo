/**
 * @returns {{
 *  title: string;
 *  description: string;
 *  url: string;
 *  image: string;
 *  imageAlt: string;
 *  twitterCard: string;
 * }}
 */
export function getHomeMeta() {
	return {
		title: 'Kaivalo | Tools That Solve Things',
		description: 'Tools that cut through complexity. One account, all tools — sign up once and everything just works.',
		url: 'https://kaivalo.com',
		image: 'https://kaivalo.com/og-image.png',
		imageAlt: 'Kaivalo — tools that cut through complexity',
		twitterCard: 'summary_large_image'
	};
}
