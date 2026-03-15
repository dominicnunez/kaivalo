import { describe, expect, it } from 'vitest';
import {
	AVATAR_PROXY_PATH,
	AVATAR_PROXY_TOKEN_QUERY_NAME,
	AVATAR_PROXY_TOKEN_TTL_MS,
	readVerifiedAvatarProxySource,
	sanitizeAvatarUrl,
	toAvatarProxyUrl
} from './avatar-url.ts';

const AVATAR_PROXY_SECRET = 'cd'.repeat(32);
const AVATAR_PROXY_NOW = Date.UTC(2026, 2, 14, 12, 0, 0);

function decodeAvatarProxyToken(token: string): {
	source: string;
	timestamp: string;
	signature: string;
} {
	return JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as {
		source: string;
		timestamp: string;
		signature: string;
	};
}

describe('avatar url policy', () => {
	it('strips trusted avatar query parameters before proxying', () => {
		expect(
			sanitizeAvatarUrl(
				'https://avatars.githubusercontent.com/u/1?token=signed&size=96'
			)
		).toBe('https://avatars.githubusercontent.com/u/1');
	});

	it.each([
		'http://avatars.githubusercontent.com/u/1',
		'https://avatars.githubusercontent.com:444/u/1',
		'https://user:pass@avatars.githubusercontent.com/u/1',
		'https://avatars.githubusercontent.com/u/1?token=signed#tracker',
		'https://cdn.attacker.example/avatar.png',
		'not-a-url'
	])('rejects unsafe avatar candidate %s', (candidate) => {
		expect(sanitizeAvatarUrl(candidate)).toBeNull();
		expect(
			toAvatarProxyUrl(candidate, {
				secret: AVATAR_PROXY_SECRET,
				now: AVATAR_PROXY_NOW
			})
		).toBeNull();
	});

	it('maps trusted avatar urls onto the first-party proxy path with a signed token', () => {
		const avatarProxyUrl = toAvatarProxyUrl(
			'https://lh3.googleusercontent.com/a/abc123?sz=256&cache=1',
			{
				secret: AVATAR_PROXY_SECRET,
				now: AVATAR_PROXY_NOW
			}
		);

		expect(avatarProxyUrl).toContain(`${AVATAR_PROXY_PATH}?`);
		const parsed = new URL(avatarProxyUrl ?? '', 'https://kaivalo.test');
		expect(parsed.searchParams.has(AVATAR_PROXY_TOKEN_QUERY_NAME)).toBe(true);
		expect(parsed.searchParams.has('source')).toBe(false);
		expect(
			readVerifiedAvatarProxySource(parsed.searchParams, {
				secret: AVATAR_PROXY_SECRET,
				now: AVATAR_PROXY_NOW
			})
		).toBe('https://lh3.googleusercontent.com/a/abc123');
	});

	it('rejects expired avatar proxy tokens', () => {
		const avatarProxyUrl = toAvatarProxyUrl(
			'https://avatars.githubusercontent.com/u/1',
			{
				secret: AVATAR_PROXY_SECRET,
				now: AVATAR_PROXY_NOW
			}
		);
		const parsed = new URL(avatarProxyUrl ?? '', 'https://kaivalo.test');

		expect(
			readVerifiedAvatarProxySource(parsed.searchParams, {
				secret: AVATAR_PROXY_SECRET,
				now: AVATAR_PROXY_NOW + AVATAR_PROXY_TOKEN_TTL_MS + 1
			})
		).toBeNull();
	});

	it('rejects tampered avatar proxy tokens', () => {
		const avatarProxyUrl = toAvatarProxyUrl(
			'https://avatars.githubusercontent.com/u/1',
			{
				secret: AVATAR_PROXY_SECRET,
				now: AVATAR_PROXY_NOW
			}
		);
		const parsed = new URL(avatarProxyUrl ?? '', 'https://kaivalo.test');
		const token = parsed.searchParams.get(AVATAR_PROXY_TOKEN_QUERY_NAME);
		expect(token).not.toBeNull();

		const tamperedToken = decodeAvatarProxyToken(token ?? '');
		tamperedToken.source = 'https://avatars.githubusercontent.com/u/2';
		parsed.searchParams.set(
			AVATAR_PROXY_TOKEN_QUERY_NAME,
			Buffer.from(JSON.stringify(tamperedToken), 'utf8').toString('base64url')
		);

		expect(
			readVerifiedAvatarProxySource(parsed.searchParams, {
				secret: AVATAR_PROXY_SECRET,
				now: AVATAR_PROXY_NOW
			})
		).toBeNull();
	});
});
