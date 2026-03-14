import { describe, expect, it } from 'vitest';
import {
	AVATAR_PROXY_PATH,
	sanitizeAvatarUrl,
	toAvatarProxyUrl
} from './avatar-url.ts';

describe('avatar url policy', () => {
	it('preserves trusted avatar query parameters for upstream variants', () => {
		expect(
			sanitizeAvatarUrl(
				'https://avatars.githubusercontent.com/u/1?token=signed&size=96'
			)
		).toBe('https://avatars.githubusercontent.com/u/1?token=signed&size=96');
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
		expect(toAvatarProxyUrl(candidate)).toBeNull();
	});

	it('maps trusted avatar urls onto the first-party proxy path', () => {
		expect(
			toAvatarProxyUrl(
				'https://lh3.googleusercontent.com/a/abc123?sz=256&cache=1'
			)
		).toBe(
			`${AVATAR_PROXY_PATH}?source=https%3A%2F%2Flh3.googleusercontent.com%2Fa%2Fabc123%3Fsz%3D256%26cache%3D1`
		);
	});
});
