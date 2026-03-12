import { cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import {
	RUNTIME_SERVER_FILES,
	RUNTIME_SHARED_FILES
} from './runtime-server-files.ts';

const HUB_ROOT = path.resolve(import.meta.dirname, '..');
const RUNTIME_LIB_SOURCE_DIR = path.join(HUB_ROOT, 'src', 'lib');
const RUNTIME_SERVER_SOURCE_DIR = path.join(RUNTIME_LIB_SOURCE_DIR, 'server');
const RUNTIME_BUILD_ROOT = path.join(HUB_ROOT, 'build', 'runtime');
const RUNTIME_BUILD_DIR = path.join(HUB_ROOT, 'build', 'runtime', 'server');

mkdirSync(RUNTIME_BUILD_DIR, { recursive: true });
mkdirSync(RUNTIME_BUILD_ROOT, { recursive: true });

for (const fileName of RUNTIME_SERVER_FILES) {
	cpSync(
		path.join(RUNTIME_SERVER_SOURCE_DIR, fileName),
		path.join(RUNTIME_BUILD_DIR, fileName)
	);
}

for (const fileName of RUNTIME_SHARED_FILES) {
	cpSync(
		path.join(RUNTIME_LIB_SOURCE_DIR, fileName),
		path.join(RUNTIME_BUILD_ROOT, fileName)
	);
}
