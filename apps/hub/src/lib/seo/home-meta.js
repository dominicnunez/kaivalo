/**
 * @param {string} origin
 * @returns {{
 *  title: string;
 *  description: string;
 *  url: string;
 *  image: string;
 *  imageAlt: string;
 *  twitterCard: string;
 * }}
 */
export function getHomeMeta(origin) {
	const siteOrigin = new URL(origin).origin;
	const imageUrl = new URL('/og-image.png', siteOrigin).toString();

	return {
		title: 'Kaivalo | Tools That Solve Things',
		description:
			'Tools that cut through complexity. One account, all tools — sign up once and everything just works.',
		url: siteOrigin,
		image: imageUrl,
		imageAlt: 'Kaivalo — tools that cut through complexity',
		twitterCard: 'summary_large_image'
	};
}
