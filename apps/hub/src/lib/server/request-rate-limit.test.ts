import { describe, expect, it } from 'vitest';
import { createSlidingWindowRateLimiter } from './request-rate-limit.ts';

describe('sliding window rate limiter', () => {
	it('rejects requests after the configured limit within the active window', () => {
		let now = 1_000;
		const limiter = createSlidingWindowRateLimiter({
			limit: 2,
			windowMs: 60_000,
			maxEntries: 32,
			now: () => now
		});

		expect(limiter.check('203.0.113.10')).toMatchObject({
			allowed: true,
			retryAfterSeconds: 0
		});
		now += 1;
		expect(limiter.check('203.0.113.10')).toMatchObject({
			allowed: true,
			retryAfterSeconds: 0
		});
		now += 1;
		expect(limiter.check('203.0.113.10')).toMatchObject({
			allowed: false,
			retryAfterSeconds: 60
		});
	});

	it('reopens the bucket once the window has expired', () => {
		let now = 1_000;
		const limiter = createSlidingWindowRateLimiter({
			limit: 1,
			windowMs: 1_000,
			maxEntries: 32,
			now: () => now
		});

		expect(limiter.check('203.0.113.10').allowed).toBe(true);
		expect(limiter.check('203.0.113.10').allowed).toBe(false);

		now += 1_000;

		expect(limiter.check('203.0.113.10')).toMatchObject({
			allowed: true,
			retryAfterSeconds: 0
		});
	});

	it('tracks quotas independently per key', () => {
		const limiter = createSlidingWindowRateLimiter({
			limit: 1,
			windowMs: 60_000,
			maxEntries: 32,
			now: () => 1_000
		});

		expect(limiter.check('203.0.113.10').allowed).toBe(true);
		expect(limiter.check('203.0.113.11').allowed).toBe(true);
		expect(limiter.check('203.0.113.10').allowed).toBe(false);
	});

	it('falls back to a shared unknown bucket for blank keys', () => {
		const limiter = createSlidingWindowRateLimiter({
			limit: 1,
			windowMs: 60_000,
			maxEntries: 32,
			now: () => 1_000
		});

		expect(limiter.check('').allowed).toBe(true);
		expect(limiter.check('   ')).toMatchObject({
			allowed: false,
			retryAfterSeconds: 60
		});
	});
});
