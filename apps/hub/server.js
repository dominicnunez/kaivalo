import { handler } from './build/handler.js';
import { startHubServer } from './src/lib/server/node-server.js';

await startHubServer({
	handler,
	onFatal: ({ exitCode }) => {
		process.exit(exitCode);
	}
});
