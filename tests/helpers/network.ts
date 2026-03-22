import net from 'node:net';

/**
 * @param {string} [host]
 * @returns {Promise<{port: number, release: () => Promise<void>}>}
 */
export function reserveLocalPort(host = '127.0.0.1') {
	return new Promise((resolve, reject) => {
		const reservation = net.createServer();
		let released = false;
		const release = () =>
			new Promise<void>((releaseResolve, releaseReject) => {
				if (released) {
					releaseResolve();
					return;
				}
				released = true;
				reservation.close((error) => {
					if (error) {
						releaseReject(error);
						return;
					}
					releaseResolve();
				});
			});

		reservation.unref();
		reservation.once('error', reject);
		reservation.listen(0, host, () => {
			const address = reservation.address();
			if (!address || typeof address === 'string') {
				void release().finally(() =>
					reject(new Error('Unable to reserve local TCP port'))
				);
				return;
			}
			resolve({ port: address.port, release });
		});
	});
}
