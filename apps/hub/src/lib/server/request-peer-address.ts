import type { RequestEvent } from '@sveltejs/kit';
import { canonicalizeIpAddress } from './ip-address.ts';

type EventWithPeerAddress = Pick<RequestEvent, 'getClientAddress' | 'platform'>;

function readRemoteAddressFromNodePlatform(platform: unknown): string {
	if (!platform || typeof platform !== 'object') {
		return '';
	}

	const req = 'req' in platform ? platform.req : undefined;
	if (!req || typeof req !== 'object') {
		return '';
	}

	const connection =
		'connection' in req && req.connection && typeof req.connection === 'object'
			? req.connection
			: undefined;
	const socket =
		'socket' in req && req.socket && typeof req.socket === 'object'
			? req.socket
			: connection &&
				  'socket' in connection &&
				  connection.socket &&
				  typeof connection.socket === 'object'
				? connection.socket
				: undefined;

	const remoteAddress =
		(socket && 'remoteAddress' in socket ? socket.remoteAddress : undefined) ??
		(connection && 'remoteAddress' in connection
			? connection.remoteAddress
			: undefined);

	return typeof remoteAddress === 'string'
		? canonicalizeIpAddress(remoteAddress)
		: '';
}

export function getRequestPeerAddress(event: EventWithPeerAddress): string {
	const platformAddress = readRemoteAddressFromNodePlatform(event.platform);
	if (platformAddress) {
		return platformAddress;
	}

	if (typeof event.getClientAddress !== 'function') {
		return '';
	}

	try {
		return canonicalizeIpAddress(event.getClientAddress());
	} catch {
		return '';
	}
}
