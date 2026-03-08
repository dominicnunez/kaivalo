import { cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const HUB_ROOT = path.resolve(import.meta.dirname, '..');
const RUNTIME_SOURCE_DIR = path.join(HUB_ROOT, 'src', 'lib', 'server');
const RUNTIME_BUILD_DIR = path.join(HUB_ROOT, 'build', 'runtime', 'server');
const RUNTIME_SERVER_FILES = [
	'authkit-config.ts',
	'auth-cookie-names.ts',
	'error-diagnostics.ts',
	'ip-address.ts',
	'node-server.ts',
	'node-server-request.ts',
	'node-server-runtime.ts',
	'workos-security.ts',
	'workos-security-cache.ts',
	'workos-security-env.ts'
];

mkdirSync(RUNTIME_BUILD_DIR, { recursive: true });

for (const fileName of RUNTIME_SERVER_FILES) {
	cpSync(
		path.join(RUNTIME_SOURCE_DIR, fileName),
		path.join(RUNTIME_BUILD_DIR, fileName)
	);
}
