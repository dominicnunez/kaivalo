const UNKNOWN_RATE_LIMIT_KEY = 'unknown';
const BUCKET_COMPACTION_MIN_HEAD_INDEX = 32;
const EVENT_THROTTLE_WINDOW_MS = 60_000;
const MAX_SAMPLED_EVENTS_PER_WINDOW = 10;

type TimestampWindow = {
	timestamps: number[];
	headIndex: number;
};

type SlidingWindowBucket = TimestampWindow;

type SampledRateLimitEventType =
	| 'rate_limit_overflow_eviction'
	| 'rate_limit_guard_rejected'
	| 'rate_limit_quota_rejected'
	| 'rate_limit_eviction_warning';

type EventThrottleState = {
	windowIndex: number;
	emittedCount: number;
	suppressedCount: number;
};

export type RateLimitDecision =
	| 'allowed'
	| 'allowed_after_lru_eviction'
	| 'rejected_quota'
	| 'rejected_guarded_overflow';

export type RateLimitMode = 'lru' | 'guarded_fail_closed';

export type RateLimitEventType =
	| SampledRateLimitEventType
	| 'rate_limit_guard_entered'
	| 'rate_limit_guard_exited'
	| 'rate_limit_suppressed_summary';

export type RateLimitSnapshot = {
	nowMs: number;
	mode: RateLimitMode;
	guardedUntilMs: number;
	guardedRemainingMs: number;
	activeBucketCount: number;
	maxEntries: number;
	newKeysWhileFull: number;
	evictionsWhileFull: number;
	largestBucketSize: number;
	distinctKeysTracked: number;
};

export type RateLimitEvent = RateLimitSnapshot & {
	profile: string;
	type: RateLimitEventType;
	decision?: RateLimitDecision;
	retryAfterSeconds?: number;
	eventType?: SampledRateLimitEventType;
	suppressedCount?: number;
	windowStartMs?: number;
};

export type RateLimitResult = {
	allowed: boolean;
	retryAfterSeconds: number;
	decision: RateLimitDecision;
	mode: RateLimitMode;
};

export type SlidingWindowRateLimiter = {
	check(key: string): RateLimitResult;
	clear(): void;
	snapshot(): RateLimitSnapshot;
};

export type RateLimitGuardrails = {
	anomalyWindowMs: number;
	newKeysWhileFullThreshold: number;
	evictionsWhileFullThreshold: number;
	triggerMode?: 'both' | 'either';
	guardedOverflowDurationMs: number;
	evictionWarnThreshold?: number;
};

export type SlidingWindowRateLimiterOptions = {
	profile: string;
	limit: number;
	windowMs: number;
	maxEntries: number;
	guardrails?: RateLimitGuardrails;
	onEvent?: (event: RateLimitEvent) => void;
	now?: () => number;
};

type RateLimitKeyOptions = {
	networkKey: string;
	principalKey?: string | null;
};

type NormalizedGuardrails = {
	anomalyWindowMs: number;
	newKeysWhileFullThreshold: number;
	evictionsWhileFullThreshold: number;
	triggerMode: 'both' | 'either';
	guardedOverflowDurationMs: number;
	evictionWarnThreshold: number;
};

function validatePositiveInteger(value: number, name: string): void {
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new Error(`${name} must be a positive integer`);
	}
}

function validateRequiredString(value: string, name: string): string {
	const normalized = value.trim();
	if (normalized === '') {
		throw new Error(`${name} must be a non-empty string`);
	}

	return normalized;
}

function normalizeRateLimitKey(value: string): string {
	const normalized = value.trim();
	return normalized === '' ? UNKNOWN_RATE_LIMIT_KEY : normalized;
}

function normalizeOptionalKey(value: string | null | undefined): string {
	return typeof value === 'string' ? value.trim() : '';
}

export function createRateLimitKey({
	networkKey,
	principalKey
}: RateLimitKeyOptions): string {
	const normalizedNetworkKey = normalizeRateLimitKey(networkKey);
	const normalizedPrincipalKey = normalizeOptionalKey(principalKey);

	return normalizedPrincipalKey === ''
		? `network:${normalizedNetworkKey}`
		: `principal:${normalizedPrincipalKey}|network:${normalizedNetworkKey}`;
}

function normalizeGuardrails(
	guardrails: RateLimitGuardrails | undefined
): NormalizedGuardrails | null {
	if (!guardrails) {
		return null;
	}

	validatePositiveInteger(
		guardrails.anomalyWindowMs,
		'guardrails.anomalyWindowMs'
	);
	validatePositiveInteger(
		guardrails.newKeysWhileFullThreshold,
		'guardrails.newKeysWhileFullThreshold'
	);
	validatePositiveInteger(
		guardrails.evictionsWhileFullThreshold,
		'guardrails.evictionsWhileFullThreshold'
	);
	validatePositiveInteger(
		guardrails.guardedOverflowDurationMs,
		'guardrails.guardedOverflowDurationMs'
	);

	const evictionWarnThreshold =
		guardrails.evictionWarnThreshold ?? guardrails.evictionsWhileFullThreshold;
	validatePositiveInteger(
		evictionWarnThreshold,
		'guardrails.evictionWarnThreshold'
	);

	return {
		anomalyWindowMs: guardrails.anomalyWindowMs,
		newKeysWhileFullThreshold: guardrails.newKeysWhileFullThreshold,
		evictionsWhileFullThreshold: guardrails.evictionsWhileFullThreshold,
		triggerMode: guardrails.triggerMode ?? 'both',
		guardedOverflowDurationMs: guardrails.guardedOverflowDurationMs,
		evictionWarnThreshold
	};
}

function createTimestampWindow(): TimestampWindow {
	return {
		timestamps: [],
		headIndex: 0
	};
}

function getWindowSize(window: TimestampWindow): number {
	return window.timestamps.length - window.headIndex;
}

function compactWindow(window: TimestampWindow): void {
	if (window.headIndex === 0) {
		return;
	}

	if (window.headIndex >= window.timestamps.length) {
		window.timestamps = [];
		window.headIndex = 0;
		return;
	}

	if (
		window.headIndex < BUCKET_COMPACTION_MIN_HEAD_INDEX &&
		window.headIndex * 2 < window.timestamps.length
	) {
		return;
	}

	window.timestamps = window.timestamps.slice(window.headIndex);
	window.headIndex = 0;
}

function pruneWindow(
	window: TimestampWindow,
	nowMs: number,
	windowMs: number
): void {
	while (window.headIndex < window.timestamps.length) {
		const timestamp = window.timestamps[window.headIndex];
		if (timestamp > nowMs - windowMs) {
			break;
		}

		window.headIndex += 1;
	}

	compactWindow(window);
}

function recordWindowTimestamp(
	window: TimestampWindow,
	nowMs: number,
	windowMs: number
): void {
	pruneWindow(window, nowMs, windowMs);
	window.timestamps.push(nowMs);
}

function getOldestBucketTimestamp(bucket: SlidingWindowBucket): number | null {
	return bucket.timestamps[bucket.headIndex] ?? null;
}

function sweepStaleBuckets(
	buckets: ReadonlyMap<string, SlidingWindowBucket>,
	nowMs: number,
	windowMs: number
): string[] {
	const emptyBucketKeys: string[] = [];

	for (const [key, bucket] of buckets.entries()) {
		pruneWindow(bucket, nowMs, windowMs);
		if (getWindowSize(bucket) === 0) {
			emptyBucketKeys.push(key);
		}
	}

	return emptyBucketKeys;
}

function deleteBuckets(
	buckets: Map<string, SlidingWindowBucket>,
	keys: readonly string[]
): void {
	for (const key of keys) {
		buckets.delete(key);
	}
}

function getRetryAfterSeconds(
	oldestTimestamp: number,
	nowMs: number,
	windowMs: number
): number {
	return Math.max(1, Math.ceil((oldestTimestamp + windowMs - nowMs) / 1000));
}

function touchBucket(
	buckets: Map<string, SlidingWindowBucket>,
	key: string,
	bucket: SlidingWindowBucket
): void {
	buckets.delete(key);
	buckets.set(key, bucket);
}

function evictLeastRecentlyUsedBucket(
	buckets: Map<string, SlidingWindowBucket>
): string | null {
	const oldestKey = buckets.keys().next().value as string | undefined;
	if (oldestKey === undefined) {
		return null;
	}

	buckets.delete(oldestKey);
	return oldestKey;
}

function getLargestBucketSize(
	buckets: ReadonlyMap<string, SlidingWindowBucket>
): number {
	let largestBucketSize = 0;

	for (const bucket of buckets.values()) {
		largestBucketSize = Math.max(largestBucketSize, getWindowSize(bucket));
	}

	return largestBucketSize;
}

function isSampledEventType(
	type: RateLimitEventType
): type is SampledRateLimitEventType {
	return (
		type === 'rate_limit_overflow_eviction' ||
		type === 'rate_limit_guard_rejected' ||
		type === 'rate_limit_quota_rejected' ||
		type === 'rate_limit_eviction_warning'
	);
}

export function createSlidingWindowRateLimiter({
	profile,
	limit,
	windowMs,
	maxEntries,
	guardrails,
	onEvent,
	now = Date.now
}: SlidingWindowRateLimiterOptions): SlidingWindowRateLimiter {
	validateRequiredString(profile, 'profile');
	validatePositiveInteger(limit, 'limit');
	validatePositiveInteger(windowMs, 'windowMs');
	validatePositiveInteger(maxEntries, 'maxEntries');

	const normalizedGuardrails = normalizeGuardrails(guardrails);
	const buckets = new Map<string, SlidingWindowBucket>();
	const newKeysWhileFullWindow = createTimestampWindow();
	const evictionsWhileFullWindow = createTimestampWindow();
	const sampledEventState = new Map<
		SampledRateLimitEventType,
		EventThrottleState
	>();
	let nextSweepAt = 0;
	let guardedUntilMs = 0;

	function getMode(nowMs: number): RateLimitMode {
		return guardedUntilMs > nowMs ? 'guarded_fail_closed' : 'lru';
	}

	function buildSnapshot(nowMs: number): RateLimitSnapshot {
		if (normalizedGuardrails) {
			pruneWindow(
				newKeysWhileFullWindow,
				nowMs,
				normalizedGuardrails.anomalyWindowMs
			);
			pruneWindow(
				evictionsWhileFullWindow,
				nowMs,
				normalizedGuardrails.anomalyWindowMs
			);
		}

		const effectiveGuardedUntilMs = guardedUntilMs > nowMs ? guardedUntilMs : 0;

		return {
			nowMs,
			mode: effectiveGuardedUntilMs > nowMs ? 'guarded_fail_closed' : 'lru',
			guardedUntilMs: effectiveGuardedUntilMs,
			guardedRemainingMs:
				effectiveGuardedUntilMs > nowMs ? effectiveGuardedUntilMs - nowMs : 0,
			activeBucketCount: buckets.size,
			maxEntries,
			newKeysWhileFull: getWindowSize(newKeysWhileFullWindow),
			evictionsWhileFull: getWindowSize(evictionsWhileFullWindow),
			largestBucketSize: getLargestBucketSize(buckets),
			distinctKeysTracked: buckets.size
		};
	}

	function emitEvent(
		type: RateLimitEventType,
		nowMs: number,
		fields: Partial<RateLimitEvent> = {}
	): void {
		if (!onEvent) {
			return;
		}

		if (isSampledEventType(type)) {
			const windowIndex = Math.floor(nowMs / EVENT_THROTTLE_WINDOW_MS);
			const existingState = sampledEventState.get(type);
			const state: EventThrottleState = existingState ?? {
				windowIndex,
				emittedCount: 0,
				suppressedCount: 0
			};

			if (state.windowIndex !== windowIndex) {
				flushSampledEventState(type, state, nowMs, windowIndex);
				state.windowIndex = windowIndex;
				state.emittedCount = 0;
				state.suppressedCount = 0;
			}

			if (state.emittedCount >= MAX_SAMPLED_EVENTS_PER_WINDOW) {
				state.suppressedCount += 1;
				sampledEventState.set(type, state);
				return;
			}

			state.emittedCount += 1;
			sampledEventState.set(type, state);
		}

		onEvent({
			...buildSnapshot(nowMs),
			profile,
			type,
			...fields
		});
	}

	function flushSampledEventState(
		type: SampledRateLimitEventType,
		state: EventThrottleState,
		nowMs: number,
		windowIndex = Math.floor(nowMs / EVENT_THROTTLE_WINDOW_MS)
	): void {
		if (!onEvent || state.windowIndex === windowIndex) {
			return;
		}

		if (state.suppressedCount > 0) {
			onEvent({
				...buildSnapshot(nowMs),
				profile,
				type: 'rate_limit_suppressed_summary',
				eventType: type,
				suppressedCount: state.suppressedCount,
				windowStartMs: state.windowIndex * EVENT_THROTTLE_WINDOW_MS
			});
		}
	}

	function flushSampledEventWindows(nowMs: number): void {
		const windowIndex = Math.floor(nowMs / EVENT_THROTTLE_WINDOW_MS);

		for (const [type, state] of sampledEventState.entries()) {
			if (state.windowIndex === windowIndex) {
				continue;
			}

			flushSampledEventState(type, state, nowMs, windowIndex);
			sampledEventState.set(type, {
				windowIndex,
				emittedCount: 0,
				suppressedCount: 0
			});
		}
	}

	function expireGuardIfNeeded(nowMs: number): void {
		if (guardedUntilMs === 0 || nowMs < guardedUntilMs) {
			return;
		}

		guardedUntilMs = 0;
		emitEvent('rate_limit_guard_exited', nowMs, {
			mode: 'lru'
		});
	}

	function shouldEnterGuardedMode(nowMs: number): boolean {
		if (!normalizedGuardrails || guardedUntilMs > nowMs) {
			return false;
		}

		const snapshot = buildSnapshot(nowMs);
		if (normalizedGuardrails.triggerMode === 'either') {
			return (
				snapshot.newKeysWhileFull >=
					normalizedGuardrails.newKeysWhileFullThreshold ||
				snapshot.evictionsWhileFull >=
					normalizedGuardrails.evictionsWhileFullThreshold
			);
		}

		return (
			snapshot.newKeysWhileFull >=
				normalizedGuardrails.newKeysWhileFullThreshold &&
			snapshot.evictionsWhileFull >=
				normalizedGuardrails.evictionsWhileFullThreshold
		);
	}

	function enterGuardedMode(nowMs: number): void {
		if (!normalizedGuardrails) {
			return;
		}

		guardedUntilMs = nowMs + normalizedGuardrails.guardedOverflowDurationMs;
		emitEvent('rate_limit_guard_entered', nowMs);
	}

	function rejectGuardedOverflow(nowMs: number): RateLimitResult {
		const retryAfterSeconds = Math.max(
			1,
			Math.ceil((guardedUntilMs - nowMs) / 1000)
		);
		emitEvent('rate_limit_guard_rejected', nowMs, {
			decision: 'rejected_guarded_overflow',
			retryAfterSeconds,
			mode: 'guarded_fail_closed'
		});
		return {
			allowed: false,
			retryAfterSeconds,
			decision: 'rejected_guarded_overflow',
			mode: 'guarded_fail_closed'
		};
	}

	return {
		check(key: string): RateLimitResult {
			const nowMs = now();
			expireGuardIfNeeded(nowMs);
			flushSampledEventWindows(nowMs);

			if (nowMs >= nextSweepAt) {
				deleteBuckets(buckets, sweepStaleBuckets(buckets, nowMs, windowMs));
				nextSweepAt = nowMs + windowMs;
			}

			const normalizedKey = normalizeRateLimitKey(key);
			let bucket = buckets.get(normalizedKey);
			let decision: RateLimitDecision = 'allowed';

			if (!bucket) {
				if (buckets.size >= maxEntries) {
					deleteBuckets(buckets, sweepStaleBuckets(buckets, nowMs, windowMs));
				}

				if (buckets.size >= maxEntries) {
					if (normalizedGuardrails) {
						recordWindowTimestamp(
							newKeysWhileFullWindow,
							nowMs,
							normalizedGuardrails.anomalyWindowMs
						);

						if (shouldEnterGuardedMode(nowMs)) {
							enterGuardedMode(nowMs);
						}
					}

					if (getMode(nowMs) === 'guarded_fail_closed') {
						return rejectGuardedOverflow(nowMs);
					}

					evictLeastRecentlyUsedBucket(buckets);
					decision = 'allowed_after_lru_eviction';
					emitEvent('rate_limit_overflow_eviction', nowMs, {
						decision
					});

					if (normalizedGuardrails) {
						recordWindowTimestamp(
							evictionsWhileFullWindow,
							nowMs,
							normalizedGuardrails.anomalyWindowMs
						);

						if (
							getWindowSize(evictionsWhileFullWindow) >=
							normalizedGuardrails.evictionWarnThreshold
						) {
							emitEvent('rate_limit_eviction_warning', nowMs);
						}
					}
				}

				bucket = createTimestampWindow();
				buckets.set(normalizedKey, bucket);
			} else {
				pruneWindow(bucket, nowMs, windowMs);
				touchBucket(buckets, normalizedKey, bucket);
			}

			if (getWindowSize(bucket) >= limit) {
				const oldestTimestamp = getOldestBucketTimestamp(bucket) ?? nowMs;
				const retryAfterSeconds = getRetryAfterSeconds(
					oldestTimestamp,
					nowMs,
					windowMs
				);
				const mode = getMode(nowMs);
				emitEvent('rate_limit_quota_rejected', nowMs, {
					decision: 'rejected_quota',
					retryAfterSeconds,
					mode
				});
				return {
					allowed: false,
					retryAfterSeconds,
					decision: 'rejected_quota',
					mode
				};
			}

			bucket.timestamps.push(nowMs);

			return {
				allowed: true,
				retryAfterSeconds: 0,
				decision,
				mode: getMode(nowMs)
			};
		},
		clear(): void {
			buckets.clear();
			newKeysWhileFullWindow.timestamps = [];
			newKeysWhileFullWindow.headIndex = 0;
			evictionsWhileFullWindow.timestamps = [];
			evictionsWhileFullWindow.headIndex = 0;
			sampledEventState.clear();
			nextSweepAt = 0;
			guardedUntilMs = 0;
		},
		snapshot(): RateLimitSnapshot {
			return buildSnapshot(now());
		}
	};
}
