import assert from 'node:assert/strict';
import { AUTHKIT_COOKIE_NAME } from '../../src/lib/server/authkit-config.ts';

const SESSION_COOKIE_MAX_AGE = String(60 * 60 * 24 * 400);

type HeaderMap = Record<string, string | string[] | undefined>;
type HeaderContainer = HeaderMap | Headers;

type ParsedSetCookie = {
	name: string;
	value: string;
	attributes: Map<string, string>;
};

function parseSetCookieHeader(setCookieHeader: string): ParsedSetCookie {
	const [nameValue, ...attributeEntries] = setCookieHeader.split(';');
	const separatorIndex = nameValue.indexOf('=');
	assert.ok(
		separatorIndex > 0,
		`invalid set-cookie header: ${setCookieHeader}`
	);

	const attributes = new Map<string, string>();
	for (const attributeEntry of attributeEntries) {
		const trimmedEntry = attributeEntry.trim();
		if (trimmedEntry === '') {
			continue;
		}

		const attributeSeparatorIndex = trimmedEntry.indexOf('=');
		if (attributeSeparatorIndex < 0) {
			attributes.set(trimmedEntry.toLowerCase(), '');
			continue;
		}

		attributes.set(
			trimmedEntry.slice(0, attributeSeparatorIndex).toLowerCase(),
			trimmedEntry.slice(attributeSeparatorIndex + 1)
		);
	}

	return {
		name: nameValue.slice(0, separatorIndex),
		value: nameValue.slice(separatorIndex + 1),
		attributes
	};
}

function getCookieAttributes(
	headers: HeaderContainer,
	cookieName = AUTHKIT_COOKIE_NAME
): ParsedSetCookie {
	const cookieHeader = getSetCookieHeaders(headers).find((value) =>
		value.startsWith(`${cookieName}=`)
	);
	assert.ok(cookieHeader, `Expected ${cookieName} to be set`);
	return parseSetCookieHeader(cookieHeader);
}

export function getSetCookieHeaders(headers: HeaderContainer): string[] {
	if (headers instanceof Headers) {
		if (typeof headers.getSetCookie === 'function') {
			return headers.getSetCookie();
		}

		const value = headers.get('set-cookie');
		return value ? [value] : [];
	}

	const values = headers['set-cookie'];
	if (!values) {
		return [];
	}

	return Array.isArray(values) ? values : [values];
}

export function assertSessionCookieContract(
	headers: HeaderContainer,
	{
		cookieName = AUTHKIT_COOKIE_NAME,
		expectedDecodedValue
	}: {
		cookieName?: string;
		expectedDecodedValue?: string;
	} = {}
): string {
	const sessionCookie = getCookieAttributes(headers, cookieName);

	assert.match(
		sessionCookie.name,
		/^__Host-/,
		`session cookie must use a host-prefixed name: ${sessionCookie.name}`
	);
	assert.strictEqual(sessionCookie.name, cookieName);
	assert.notStrictEqual(
		sessionCookie.value,
		'',
		'session cookie value must not be empty'
	);
	if (expectedDecodedValue !== undefined) {
		assert.strictEqual(
			decodeURIComponent(sessionCookie.value),
			expectedDecodedValue
		);
	}

	assert.strictEqual(sessionCookie.attributes.get('path'), '/');
	assert.ok(
		!sessionCookie.attributes.has('domain'),
		'session cookie must not set Domain when using __Host- prefix'
	);
	assert.ok(sessionCookie.attributes.has('httponly'));
	assert.ok(sessionCookie.attributes.has('secure'));
	assert.strictEqual(
		sessionCookie.attributes.get('samesite')?.toLowerCase(),
		'lax'
	);
	assert.strictEqual(
		sessionCookie.attributes.get('max-age'),
		SESSION_COOKIE_MAX_AGE
	);

	return `${sessionCookie.name}=${sessionCookie.value}`;
}

export function assertClearedSessionCookieContract(
	headers: HeaderContainer,
	cookieName = AUTHKIT_COOKIE_NAME
): string {
	const sessionCookie = getCookieAttributes(headers, cookieName);

	assert.strictEqual(sessionCookie.name, cookieName);
	assert.strictEqual(sessionCookie.value, '');
	assert.strictEqual(sessionCookie.attributes.get('path'), '/');
	assert.ok(
		!sessionCookie.attributes.has('domain'),
		'session cookie must not set Domain when using __Host- prefix'
	);
	assert.ok(sessionCookie.attributes.has('httponly'));
	assert.ok(sessionCookie.attributes.has('secure'));
	assert.strictEqual(
		sessionCookie.attributes.get('samesite')?.toLowerCase(),
		'lax'
	);
	assert.strictEqual(sessionCookie.attributes.get('max-age'), '0');

	return `${sessionCookie.name}=`;
}
