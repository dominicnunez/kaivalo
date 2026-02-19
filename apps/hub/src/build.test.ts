import { describe, it } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

const hubDir = path.resolve(import.meta.dirname, '..');

describe('Production build', () => {
	it('should build successfully with zero errors', { timeout: 60000 }, () => {
		execSync('npm run build', {
			cwd: hubDir,
			stdio: 'pipe'
		});
	});
});
