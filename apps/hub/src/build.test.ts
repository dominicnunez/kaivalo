import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

const hubDir = path.resolve(import.meta.dirname, '..');

describe('Production build', () => {
	it('should build successfully with zero errors', { timeout: 60000 }, () => {
		// Run build and capture output
		let buildSucceeded = false;
		let errorMessage = '';

		try {
			const output = execSync('npm run build', {
				cwd: hubDir,
				encoding: 'utf-8',
				stdio: 'pipe'
			});

			// Check that the output contains success indicators
			const hasClientBuild = output.includes('✓ built in') && output.includes('.svelte-kit/output/client');
			const hasServerBuild = output.includes('.svelte-kit/output/server');
			const hasAdapterDone = output.includes('✔ done');

			buildSucceeded = hasClientBuild && hasServerBuild && hasAdapterDone;

			if (!buildSucceeded) {
				errorMessage = 'Build output missing expected success indicators';
			}
		} catch (error: any) {
			buildSucceeded = false;
			errorMessage = error.message || 'Build command failed';
		}

		expect(buildSucceeded).toBe(true);
		if (!buildSucceeded) {
			throw new Error(`Build failed: ${errorMessage}`);
		}
	});
});
