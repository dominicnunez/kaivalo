import { configureAuthKit, authKitHandle } from '@workos/authkit-sveltekit';
import { sequence } from '@sveltejs/kit/hooks';
import { env } from '$env/dynamic/private';
import type { Handle } from '@sveltejs/kit';

const REQUIRED_ENV_VARS = ['WORKOS_CLIENT_ID', 'WORKOS_API_KEY', 'WORKOS_REDIRECT_URI', 'WORKOS_COOKIE_PASSWORD'] as const;

for (const name of REQUIRED_ENV_VARS) {
	if (!env[name]) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
}

configureAuthKit({
	clientId: env.WORKOS_CLIENT_ID!,
	apiKey: env.WORKOS_API_KEY!,
	redirectUri: env.WORKOS_REDIRECT_URI!,
	cookiePassword: env.WORKOS_COOKIE_PASSWORD!,
});

const HSTS_MAX_AGE_SECONDS = 63_072_000; // 2 years

const securityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	response.headers.set('Strict-Transport-Security', `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains`);
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	response.headers.set(
		'Content-Security-Policy',
		[
			"default-src 'self'",
			"script-src 'self'",
			"style-src 'self' 'unsafe-inline' https://api.fontshare.com https://fonts.googleapis.com",
			"font-src 'self' https://cdn.fontshare.com https://fonts.gstatic.com",
			"img-src 'self' data: https:",
			"connect-src 'self'",
			"form-action 'self'",
			"base-uri 'self'",
			"object-src 'none'",
			"frame-ancestors 'none'",
			"upgrade-insecure-requests",
		].join('; '),
	);
	return response;
};

export const handle = sequence(securityHeaders, authKitHandle());
