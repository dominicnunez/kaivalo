const UNKNOWN_RATE_LIMIT_KEY = 'unknown';

type SlidingWindowBucket = {
	timestamps: number[];
	lastSeenAt: number;
};

export type RateLimitResult = {
	allowed: boolean;
	retryAfterSeconds: number;
};

export type SlidingWindowRateLimiter = {
	check(key: string): RateLimitResult;
	clear(): void;
};

type SlidingWindowRateLimiterOptions = {
	limit: number;
	windowMs: number;
	maxEntries: number;
	now?: () => number;
};

function validatePositiveInteger(value: number, name: string): void {
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new Error(`${name} must be a positive integer`);
	}
}

function normalizeRateLimitKey(value: string): string {
	const normalized = value.trim();
	return normalized === '' ? UNKNOWN_RATE_LIMIT_KEY : normalized;
}

function pruneBucket(
	bucket: SlidingWindowBucket,
	now: number,
	windowMs: number
): void {
	while (bucket.timestamps[0] !== undefined) {
		const timestamp = bucket.timestamps[0];
		if (timestamp > now - windowMs) {
			break;
		}

		bucket.timestamps.shift();
	}
}

function compactBuckets(
	buckets: Map<string, SlidingWindowBucket>,
	now: number,
	windowMs: number,
	maxEntries: number
): void {
	for (const [key, bucket] of buckets.entries()) {
		pruneBucket(bucket, now, windowMs);
		if (bucket.timestamps.length === 0) {
			buckets.delete(key);
		}
	}

	if (buckets.size <= maxEntries) {
		return;
	}

	const evictedKeys = [...buckets.entries()]
		.sort((left, right) => left[1].lastSeenAt - right[1].lastSeenAt)
		.slice(0, buckets.size - maxEntries)
		.map(([key]) => key);
	for (const key of evictedKeys) {
		buckets.delete(key);
	}
}

export function createSlidingWindowRateLimiter({
	limit,
	windowMs,
	maxEntries,
	now = Date.now
}: SlidingWindowRateLimiterOptions): SlidingWindowRateLimiter {
	validatePositiveInteger(limit, 'limit');
	validatePositiveInteger(windowMs, 'windowMs');
	validatePositiveInteger(maxEntries, 'maxEntries');

	const buckets = new Map<string, SlidingWindowBucket>();

	return {
		check(key: string): RateLimitResult {
			const nowMs = now();
			compactBuckets(buckets, nowMs, windowMs, maxEntries);

			const normalizedKey = normalizeRateLimitKey(key);
			const bucket = buckets.get(normalizedKey) ?? {
				timestamps: [],
				lastSeenAt: nowMs
			};
			pruneBucket(bucket, nowMs, windowMs);
			bucket.lastSeenAt = nowMs;

			if (bucket.timestamps.length >= limit) {
				buckets.set(normalizedKey, bucket);
				return {
					allowed: false,
					retryAfterSeconds: Math.max(
						1,
						Math.ceil((bucket.timestamps[0] + windowMs - nowMs) / 1000)
					)
				};
			}

			bucket.timestamps.push(nowMs);
			buckets.set(normalizedKey, bucket);

			if (buckets.size > maxEntries) {
				compactBuckets(buckets, nowMs, windowMs, maxEntries);
			}

			return {
				allowed: true,
				retryAfterSeconds: 0
			};
		},
		clear(): void {
			buckets.clear();
		}
	};
}
