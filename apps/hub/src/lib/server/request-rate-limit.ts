const UNKNOWN_RATE_LIMIT_KEY = 'unknown';
const BUCKET_COMPACTION_MIN_HEAD_INDEX = 32;

type SlidingWindowBucket = {
	timestamps: number[];
	headIndex: number;
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

function sweepOverflowBucket(
	overflowBucket: SlidingWindowBucket | null,
	now: number,
	windowMs: number
): SlidingWindowBucket | null {
	if (!overflowBucket) {
		return null;
	}

	pruneBucket(overflowBucket, now, windowMs);
	return getBucketSize(overflowBucket) === 0 ? null : overflowBucket;
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
	let overflowBucket: SlidingWindowBucket | null = null;
	let nextSweepAt = 0;

	return {
		check(key: string): RateLimitResult {
			const nowMs = now();
			if (nowMs >= nextSweepAt) {
				deleteBuckets(buckets, sweepStaleBuckets(buckets, nowMs, windowMs));
				overflowBucket = sweepOverflowBucket(overflowBucket, nowMs, windowMs);
				nextSweepAt = nowMs + windowMs;
			}

			const normalizedKey = normalizeRateLimitKey(key);
			let bucket = buckets.get(normalizedKey);
			let usesOverflowBucket = false;

			if (!bucket) {
				if (buckets.size >= maxEntries) {
					deleteBuckets(buckets, sweepStaleBuckets(buckets, nowMs, windowMs));
					overflowBucket = sweepOverflowBucket(overflowBucket, nowMs, windowMs);
				}

				if (buckets.size >= maxEntries) {
					bucket = overflowBucket ?? {
						timestamps: [],
						headIndex: 0
					};
					usesOverflowBucket = true;
				} else {
					bucket = {
						timestamps: [],
						headIndex: 0
					};
				}
			}

			pruneBucket(bucket, nowMs, windowMs);

			if (getBucketSize(bucket) >= limit) {
				const oldestTimestamp = getOldestBucketTimestamp(bucket) ?? nowMs;
				if (usesOverflowBucket) {
					overflowBucket = bucket;
				}

				return {
					allowed: false,
					retryAfterSeconds: Math.max(
						1,
						Math.ceil((oldestTimestamp + windowMs - nowMs) / 1000)
					)
				};
			}

			bucket.timestamps.push(nowMs);
			if (usesOverflowBucket) {
				overflowBucket = bucket;
			} else if (!buckets.has(normalizedKey)) {
				buckets.set(normalizedKey, bucket);
			}

			return {
				allowed: true,
				retryAfterSeconds: 0
			};
		},
		clear(): void {
			buckets.clear();
			overflowBucket = null;
			nextSweepAt = 0;
		}
	};
}
