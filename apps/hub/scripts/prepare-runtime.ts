import { cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { RUNTIME_SERVER_FILES } from './runtime-server-files.ts';

const HUB_ROOT = path.resolve(import.meta.dirname, '..');
const RUNTIME_SOURCE_DIR = path.join(HUB_ROOT, 'src', 'lib', 'server');
const RUNTIME_BUILD_DIR = path.join(HUB_ROOT, 'build', 'runtime', 'server');

mkdirSync(RUNTIME_BUILD_DIR, { recursive: true });

for (const fileName of RUNTIME_SERVER_FILES) {
	cpSync(
		path.join(RUNTIME_SOURCE_DIR, fileName),
		path.join(RUNTIME_BUILD_DIR, fileName)
	);
}
