import http from 'node:http';

export function isPermissionDeniedError(error: unknown): boolean {
	return Boolean(
		error &&
		typeof error === 'object' &&
		'code' in error &&
		((error as { code?: unknown }).code === 'EPERM' ||
			(error as { code?: unknown }).code === 'EACCES')
	);
}

export async function canListenOnLoopback(
	host = '127.0.0.1'
): Promise<boolean> {
	return new Promise((resolve, reject) => {
		const server = http.createServer();
		server.once('error', (error) => {
			if (isPermissionDeniedError(error)) {
				resolve(false);
				return;
			}

			reject(error);
		});
		server.listen(0, host, () => {
			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}

				resolve(true);
			});
		});
	});
}
