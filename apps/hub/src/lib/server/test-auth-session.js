import { createHmac, timingSafeEqual } from 'node:crypto';

const TEST_AUTH_SIGNATURE_SEPARATOR = '.';
const TEST_AUTH_SIGNATURE_ALGORITHM = 'sha256';

/**
 * @param {string} secret
 * @returns {string}
 */
function requireSigningSecret(secret) {
	if (typeof secret !== 'string' || secret.length === 0) {
		throw new Error('Test auth fixture signing secret must be configured');
	}

	return secret;
}

/**
 * @param {string} encodedPayload
 * @param {string} secret
 * @returns {Buffer}
 */
function signPayload(encodedPayload, secret) {
	return createHmac(TEST_AUTH_SIGNATURE_ALGORITHM, requireSigningSecret(secret))
		.update(encodedPayload)
		.digest();
}

/**
 * @param {unknown} payload
 * @param {string} secret
 * @returns {string}
 */
export function encodeSignedTestAuthSession(payload, secret) {
	const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
		'base64url'
	);
	const encodedSignature = signPayload(encodedPayload, secret).toString(
		'base64url'
	);
	return `${encodedPayload}${TEST_AUTH_SIGNATURE_SEPARATOR}${encodedSignature}`;
}

/**
 * @param {string} value
 * @param {string} secret
 * @returns {unknown | null}
 */
export function decodeSignedTestAuthSession(value, secret) {
	if (typeof value !== 'string' || value.length === 0) {
		return null;
	}

	const separatorIndex = value.lastIndexOf(TEST_AUTH_SIGNATURE_SEPARATOR);
	if (separatorIndex <= 0 || separatorIndex >= value.length - 1) {
		return null;
	}

	const encodedPayload = value.slice(0, separatorIndex);
	const encodedSignature = value.slice(separatorIndex + 1);

	let actualSignature;
	try {
		actualSignature = Buffer.from(encodedSignature, 'base64url');
	} catch {
		return null;
	}

	const expectedSignature = signPayload(encodedPayload, secret);
	if (
		actualSignature.length !== expectedSignature.length ||
		!timingSafeEqual(actualSignature, expectedSignature)
	) {
		return null;
	}

	try {
		return JSON.parse(
			Buffer.from(encodedPayload, 'base64url').toString('utf8')
		);
	} catch {
		return null;
	}
}
