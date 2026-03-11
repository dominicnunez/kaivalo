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

	it('keeps active buckets intact when new keys arrive after capacity is full', () => {
		let now = 1_000;
		const limiter = createSlidingWindowRateLimiter({
			limit: 2,
			windowMs: 60_000,
			maxEntries: 2,
			now: () => now
		});

		expect(limiter.check('203.0.113.10').allowed).toBe(true);
		now += 1;
		expect(limiter.check('203.0.113.11').allowed).toBe(true);
		now += 1;
		expect(limiter.check('203.0.113.10').allowed).toBe(true);
		now += 1;
		expect(limiter.check('203.0.113.12')).toMatchObject({
			allowed: false,
			retryAfterSeconds: 60
		});
		now += 1;

		expect(limiter.check('203.0.113.10')).toMatchObject({
			allowed: false,
			retryAfterSeconds: 60
		});
		expect(limiter.check('203.0.113.11')).toMatchObject({
			allowed: true,
			retryAfterSeconds: 0
		});
	});

	it('drops stale buckets before evicting active buckets on overflow', () => {
		let now = 1_000;
		const limiter = createSlidingWindowRateLimiter({
			limit: 1,
			windowMs: 1_000,
			maxEntries: 1,
			now: () => now
		});

		expect(limiter.check('203.0.113.10').allowed).toBe(true);
		now += 1_001;
		expect(limiter.check('203.0.113.11')).toMatchObject({
			allowed: true,
			retryAfterSeconds: 0
		});
		expect(limiter.check('203.0.113.11')).toMatchObject({
			allowed: false,
			retryAfterSeconds: 1
		});
	});

	it('rejects new keys until an active bucket ages out of the table', () => {
		let now = 1_000;
		const limiter = createSlidingWindowRateLimiter({
			limit: 1,
			windowMs: 60_000,
			maxEntries: 2,
			now: () => now
		});

		expect(limiter.check('203.0.113.10').allowed).toBe(true);
		now += 1;
		expect(limiter.check('203.0.113.11').allowed).toBe(true);
		now += 1;
		expect(limiter.check('203.0.113.12')).toMatchObject({
			allowed: false,
			retryAfterSeconds: 60
		});
		now += 60_000;

		expect(limiter.check('203.0.113.13')).toMatchObject({
			allowed: true,
			retryAfterSeconds: 0
		});
	});

	it('reports overflow retry-after from the earliest bucket reset time', () => {
		let now = 1_000;
		const limiter = createSlidingWindowRateLimiter({
			limit: 3,
			windowMs: 60_000,
			maxEntries: 2,
			now: () => now
		});

		expect(limiter.check('203.0.113.10').allowed).toBe(true);
		now += 1;
		expect(limiter.check('203.0.113.10').allowed).toBe(true);
		now += 1;
		expect(limiter.check('203.0.113.11').allowed).toBe(true);
		now += 1;
		expect(limiter.check('203.0.113.11').allowed).toBe(true);
		now += 1;

		expect(limiter.check('203.0.113.12')).toMatchObject({
			allowed: false,
			retryAfterSeconds: 60
		});

		now = 31_100;
		expect(limiter.check('203.0.113.12')).toMatchObject({
			allowed: false,
			retryAfterSeconds: 30
		});
	});
});
