import { describe, expect, it } from 'vitest';
import {
	createRateLimitKey,
	createSlidingWindowRateLimiter,
	type RateLimitEvent
} from './request-rate-limit.ts';

describe('sliding window rate limiter', () => {
	function createLimiter(
		now: () => number,
		overrides: Partial<
			Parameters<typeof createSlidingWindowRateLimiter>[0]
		> = {}
	) {
		return createSlidingWindowRateLimiter({
			profile: 'test_profile',
			limit: 1,
			windowMs: 60_000,
			maxEntries: 32,
			now,
			...overrides
		});
	}

	it('rejects requests after the configured limit within the active window', () => {
		let now = 1_000;
		const limiter = createLimiter(() => now, {
			limit: 2,
			maxEntries: 32
		});

		expect(limiter.check('203.0.113.10')).toMatchObject({
			allowed: true,
			retryAfterSeconds: 0,
			decision: 'allowed',
			mode: 'lru'
		});
		now += 1;
		expect(limiter.check('203.0.113.10')).toMatchObject({
			allowed: true,
			retryAfterSeconds: 0,
			decision: 'allowed',
			mode: 'lru'
		});
		now += 1;
		expect(limiter.check('203.0.113.10')).toMatchObject({
			allowed: false,
			retryAfterSeconds: 60,
			decision: 'rejected_quota',
			mode: 'lru'
		});
	});

	it('reopens the bucket once the window has expired', () => {
		let now = 1_000;
		const limiter = createLimiter(() => now, { windowMs: 1_000 });

		expect(limiter.check('203.0.113.10').allowed).toBe(true);
		expect(limiter.check('203.0.113.10').allowed).toBe(false);

		now += 1_000;

		expect(limiter.check('203.0.113.10')).toMatchObject({
			allowed: true,
			retryAfterSeconds: 0
		});
	});

	it('tracks quotas independently per key', () => {
		const limiter = createLimiter(() => 1_000);

		expect(limiter.check('203.0.113.10').allowed).toBe(true);
		expect(limiter.check('203.0.113.11').allowed).toBe(true);
		expect(limiter.check('203.0.113.10').allowed).toBe(false);
	});

	it('falls back to a shared unknown bucket for blank keys', () => {
		const limiter = createLimiter(() => 1_000);

		expect(limiter.check('').allowed).toBe(true);
		expect(limiter.check('   ')).toMatchObject({
			allowed: false,
			retryAfterSeconds: 60
		});
	});

	it('evicts the least recently used bucket when capacity is full', () => {
		let now = 1_000;
		const limiter = createLimiter(() => now, {
			limit: 2,
			maxEntries: 2
		});

		expect(limiter.check('203.0.113.10').allowed).toBe(true);
		now += 1;
		expect(limiter.check('203.0.113.11').allowed).toBe(true);
		now += 1;
		expect(limiter.check('203.0.113.10').allowed).toBe(true);
		now += 1;
		expect(limiter.check('203.0.113.12')).toMatchObject({
			allowed: true,
			retryAfterSeconds: 0,
			decision: 'allowed_after_lru_eviction',
			mode: 'lru'
		});

		expect(limiter.check('203.0.113.10')).toMatchObject({
			allowed: false,
			retryAfterSeconds: 60
		});
		expect(limiter.check('203.0.113.11')).toMatchObject({
			allowed: true,
			retryAfterSeconds: 0
		});
	});

	it('drops stale buckets before admitting new keys on overflow', () => {
		let now = 1_000;
		const limiter = createLimiter(() => now, {
			windowMs: 1_000,
			maxEntries: 1
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

	it('admits new keys immediately after evicting a saturated table entry', () => {
		let now = 1_000;
		const limiter = createLimiter(() => now, { maxEntries: 1 });

		expect(limiter.check('203.0.113.10')).toMatchObject({
			allowed: true,
			retryAfterSeconds: 0
		});
		now += 30_000;
		expect(limiter.check('203.0.113.10')).toMatchObject({
			allowed: false,
			retryAfterSeconds: 30
		});
		now += 1;
		expect(limiter.check('203.0.113.11')).toMatchObject({
			allowed: true,
			retryAfterSeconds: 0
		});
		expect(limiter.check('203.0.113.12')).toMatchObject({
			allowed: true,
			retryAfterSeconds: 0,
			decision: 'allowed_after_lru_eviction',
			mode: 'lru'
		});
	});

	it('enters guarded mode and rejects unseen keys when both churn thresholds are met', () => {
		let now = 1_000;
		const events: RateLimitEvent[] = [];
		const limiter = createLimiter(() => now, {
			maxEntries: 1,
			guardrails: {
				anomalyWindowMs: 60_000,
				newKeysWhileFullThreshold: 1,
				evictionsWhileFullThreshold: 1,
				triggerMode: 'both',
				guardedOverflowDurationMs: 60_000,
				evictionWarnThreshold: 1
			},
			onEvent: (event) => events.push(event)
		});

		expect(limiter.check('203.0.113.10')).toMatchObject({
			allowed: true,
			decision: 'allowed'
		});
		now += 1;
		expect(limiter.check('203.0.113.11')).toMatchObject({
			allowed: true,
			decision: 'allowed_after_lru_eviction',
			mode: 'lru'
		});
		now += 1;

		const guarded = limiter.check('203.0.113.12');

		expect(guarded).toMatchObject({
			allowed: false,
			retryAfterSeconds: 60,
			decision: 'rejected_guarded_overflow',
			mode: 'guarded_fail_closed'
		});
		expect(limiter.snapshot()).toMatchObject({
			nowMs: now,
			mode: 'guarded_fail_closed',
			guardedRemainingMs: 60_000
		});
		expect(events.map((event) => event.type)).toEqual([
			'rate_limit_overflow_eviction',
			'rate_limit_eviction_warning',
			'rate_limit_guard_entered',
			'rate_limit_guard_rejected'
		]);
		now += 60_000;
		expect(limiter.check('203.0.113.13')).toMatchObject({
			allowed: true,
			decision: 'allowed',
			mode: 'lru'
		});
		expect(events.at(-1)).toMatchObject({
			type: 'rate_limit_guard_exited',
			mode: 'lru'
		});
	});

	it('supports entering guarded mode when either churn threshold is met', () => {
		let now = 1_000;
		const limiter = createLimiter(() => now, {
			maxEntries: 1,
			guardrails: {
				anomalyWindowMs: 60_000,
				newKeysWhileFullThreshold: 1,
				evictionsWhileFullThreshold: 99,
				triggerMode: 'either',
				guardedOverflowDurationMs: 60_000
			}
		});

		expect(limiter.check('203.0.113.10').allowed).toBe(true);
		now += 1;
		expect(limiter.check('203.0.113.11')).toMatchObject({
			allowed: false,
			decision: 'rejected_guarded_overflow',
			mode: 'guarded_fail_closed'
		});
	});

	it('reports snapshot timing fields using the injected clock', () => {
		let now = 1_000;
		const limiter = createLimiter(() => now, {
			maxEntries: 1,
			guardrails: {
				anomalyWindowMs: 60_000,
				newKeysWhileFullThreshold: 1,
				evictionsWhileFullThreshold: 99,
				triggerMode: 'either',
				guardedOverflowDurationMs: 5_000
			}
		});

		expect(limiter.check('203.0.113.10').allowed).toBe(true);
		now += 1;
		expect(limiter.check('203.0.113.11').allowed).toBe(false);

		now += 1_234;

		expect(limiter.snapshot()).toMatchObject({
			nowMs: 2_235,
			mode: 'guarded_fail_closed',
			guardedRemainingMs: 3_766
		});
	});

	it('clears guarded state counters and throttling state', () => {
		let now = 60_000;
		const events: RateLimitEvent[] = [];
		const limiter = createLimiter(() => now, {
			maxEntries: 1,
			guardrails: {
				anomalyWindowMs: 60_000,
				newKeysWhileFullThreshold: 1,
				evictionsWhileFullThreshold: 99,
				triggerMode: 'either',
				guardedOverflowDurationMs: 60_000
			},
			onEvent: (event) => events.push(event)
		});

		expect(limiter.check('203.0.113.10').allowed).toBe(true);
		now += 1;
		expect(limiter.check('203.0.113.11').allowed).toBe(false);
		limiter.clear();
		expect(limiter.snapshot()).toMatchObject({
			mode: 'lru',
			activeBucketCount: 0,
			newKeysWhileFull: 0,
			evictionsWhileFull: 0,
			guardedRemainingMs: 0
		});

		now = 120_000;
		expect(limiter.check('203.0.113.20').allowed).toBe(true);
		now += 1;
		expect(limiter.check('203.0.113.21').allowed).toBe(false);
		expect(
			events.filter((event) => event.type === 'rate_limit_guard_entered')
		).toHaveLength(2);
	});

	it('throttles sampled events in fixed windows and emits a suppressed summary on rollover', () => {
		let now = 60_000;
		const events: RateLimitEvent[] = [];
		const limiter = createLimiter(() => now, {
			limit: 1,
			windowMs: 120_000,
			onEvent: (event) => events.push(event)
		});

		for (let index = 0; index < 12; index += 1) {
			expect(limiter.check('203.0.113.10')).toMatchObject({
				allowed: index === 0
			});
		}

		expect(
			events.filter((event) => event.type === 'rate_limit_quota_rejected')
		).toHaveLength(10);
		expect(
			events.find((event) => event.type === 'rate_limit_suppressed_summary')
		).toBeUndefined();

		now = 120_000;
		expect(limiter.check('203.0.113.10')).toMatchObject({
			allowed: false,
			decision: 'rejected_quota'
		});

		expect(events).toContainEqual(
			expect.objectContaining({
				type: 'rate_limit_suppressed_summary',
				eventType: 'rate_limit_quota_rejected',
				suppressedCount: 1,
				windowStartMs: 60_000
			})
		);
	});

	it('flushes suppressed summaries when a later check has no sampled event', () => {
		let now = 60_000;
		const events: RateLimitEvent[] = [];
		const limiter = createLimiter(() => now, {
			limit: 1,
			windowMs: 120_000,
			onEvent: (event) => events.push(event)
		});

		for (let index = 0; index < 12; index += 1) {
			limiter.check('203.0.113.10');
		}

		now = 180_001;
		expect(limiter.check('203.0.113.10')).toMatchObject({
			allowed: true,
			decision: 'allowed'
		});
		expect(events).toContainEqual(
			expect.objectContaining({
				type: 'rate_limit_suppressed_summary',
				eventType: 'rate_limit_quota_rejected',
				suppressedCount: 1,
				windowStartMs: 60_000
			})
		);
	});
});

describe('createRateLimitKey', () => {
	it('uses the network key alone for public traffic', () => {
		expect(
			createRateLimitKey({
				networkKey: '203.0.113.10'
			})
		).toBe('network:203.0.113.10');
	});

	it('combines an opaque principal key with the network key when provided', () => {
		expect(
			createRateLimitKey({
				networkKey: '203.0.113.10',
				principalKey: 'user_123'
			})
		).toBe('principal:user_123|network:203.0.113.10');
	});

	it('normalizes blank network keys into the shared unknown bucket', () => {
		expect(
			createRateLimitKey({
				networkKey: '   '
			})
		).toBe('network:unknown');
		expect(
			createRateLimitKey({
				networkKey: '203.0.113.10',
				principalKey: '   '
			})
		).toBe('network:203.0.113.10');
	});
});
