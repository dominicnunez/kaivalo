import { handler } from './build/handler.js';
import { startHubServer } from './build/runtime/server/node-server.ts';

await startHubServer({
	handler,
	onFatal: ({ exitCode }) => {
		process.exit(exitCode);
	}
});
