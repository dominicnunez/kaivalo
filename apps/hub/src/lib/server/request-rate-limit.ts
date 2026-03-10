const UNKNOWN_RATE_LIMIT_KEY = 'unknown';
const BUCKET_COMPACTION_MIN_HEAD_INDEX = 32;

type SlidingWindowBucket = {
	timestamps: number[];
	headIndex: number;
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

function getBucketSize(bucket: SlidingWindowBucket): number {
	return bucket.timestamps.length - bucket.headIndex;
}

function getOldestBucketTimestamp(bucket: SlidingWindowBucket): number | null {
	return bucket.timestamps[bucket.headIndex] ?? null;
}

function compactBucket(bucket: SlidingWindowBucket): void {
	if (bucket.headIndex === 0) {
		return;
	}

	if (bucket.headIndex >= bucket.timestamps.length) {
		bucket.timestamps = [];
		bucket.headIndex = 0;
		return;
	}

	if (
		bucket.headIndex < BUCKET_COMPACTION_MIN_HEAD_INDEX &&
		bucket.headIndex * 2 < bucket.timestamps.length
	) {
		return;
	}

	bucket.timestamps = bucket.timestamps.slice(bucket.headIndex);
	bucket.headIndex = 0;
}

function pruneBucket(
	bucket: SlidingWindowBucket,
	now: number,
	windowMs: number
): void {
	while (bucket.headIndex < bucket.timestamps.length) {
		const timestamp = bucket.timestamps[bucket.headIndex];
		if (timestamp > now - windowMs) {
			break;
		}

		bucket.headIndex += 1;
	}

	compactBucket(bucket);
}

function sweepStaleBuckets(
	buckets: ReadonlyMap<string, SlidingWindowBucket>,
	now: number,
	windowMs: number
): string[] {
	const emptyBucketKeys: string[] = [];

	for (const [key, bucket] of buckets.entries()) {
		pruneBucket(bucket, now, windowMs);
		if (getBucketSize(bucket) === 0) {
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

function evictOverflowBuckets(
	buckets: Map<string, SlidingWindowBucket>,
	maxEntries: number
): void {
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
	let nextSweepAt = 0;

	return {
		check(key: string): RateLimitResult {
			const nowMs = now();
			if (nowMs >= nextSweepAt) {
				deleteBuckets(buckets, sweepStaleBuckets(buckets, nowMs, windowMs));
				nextSweepAt = nowMs + windowMs;
			}

			const normalizedKey = normalizeRateLimitKey(key);
			const bucket = buckets.get(normalizedKey) ?? {
				timestamps: [],
				headIndex: 0,
				lastSeenAt: nowMs
			};
			pruneBucket(bucket, nowMs, windowMs);
			bucket.lastSeenAt = nowMs;

			if (getBucketSize(bucket) >= limit) {
				const oldestTimestamp = getOldestBucketTimestamp(bucket) ?? nowMs;
				buckets.set(normalizedKey, bucket);
				return {
					allowed: false,
					retryAfterSeconds: Math.max(
						1,
						Math.ceil((oldestTimestamp + windowMs - nowMs) / 1000)
					)
				};
			}

			bucket.timestamps.push(nowMs);
			buckets.set(normalizedKey, bucket);

			if (buckets.size > maxEntries) {
				deleteBuckets(buckets, sweepStaleBuckets(buckets, nowMs, windowMs));
				evictOverflowBuckets(buckets, maxEntries);
				nextSweepAt = nowMs + windowMs;
			}

			return {
				allowed: true,
				retryAfterSeconds: 0
			};
		},
		clear(): void {
			buckets.clear();
			nextSweepAt = 0;
		}
	};
}
