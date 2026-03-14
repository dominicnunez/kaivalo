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

function getNewestBucketTimestamp(bucket: SlidingWindowBucket): number | null {
	return bucket.timestamps[bucket.timestamps.length - 1] ?? null;
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

function getRetryAfterSeconds(
	oldestTimestamp: number,
	now: number,
	windowMs: number
): number {
	return Math.max(1, Math.ceil((oldestTimestamp + windowMs - now) / 1000));
}

function getOverflowRetryAfterSeconds(
	buckets: ReadonlyMap<string, SlidingWindowBucket>,
	now: number,
	windowMs: number
): number {
	let earliestBucketEvictionTimestamp: number | null = null;

	for (const bucket of buckets.values()) {
		const newestBucketTimestamp = getNewestBucketTimestamp(bucket);
		if (newestBucketTimestamp === null) {
			continue;
		}
		if (
			earliestBucketEvictionTimestamp === null ||
			newestBucketTimestamp < earliestBucketEvictionTimestamp
		) {
			earliestBucketEvictionTimestamp = newestBucketTimestamp;
		}
	}

	return earliestBucketEvictionTimestamp === null
		? 1
		: getRetryAfterSeconds(earliestBucketEvictionTimestamp, now, windowMs);
}

function getLeastRecentlyActiveBucketKey(
	buckets: ReadonlyMap<string, SlidingWindowBucket>
): string | null {
	let candidateKey: string | null = null;
	let candidateTimestamp: number | null = null;

	for (const [key, bucket] of buckets.entries()) {
		const newestBucketTimestamp = getNewestBucketTimestamp(bucket);
		if (newestBucketTimestamp === null) {
			continue;
		}
		if (
			candidateTimestamp === null ||
			newestBucketTimestamp < candidateTimestamp
		) {
			candidateKey = key;
			candidateTimestamp = newestBucketTimestamp;
		}
	}

	return candidateKey;
}

function evictLeastRecentlyActiveBucket(
	buckets: Map<string, SlidingWindowBucket>
): boolean {
	const key = getLeastRecentlyActiveBucketKey(buckets);
	if (key === null) {
		return false;
	}

	buckets.delete(key);
	return true;
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
			let bucket = buckets.get(normalizedKey);

			if (!bucket) {
				if (buckets.size >= maxEntries) {
					deleteBuckets(buckets, sweepStaleBuckets(buckets, nowMs, windowMs));
				}

				if (
					buckets.size >= maxEntries &&
					!evictLeastRecentlyActiveBucket(buckets)
				) {
					return {
						allowed: false,
						retryAfterSeconds: getOverflowRetryAfterSeconds(
							buckets,
							nowMs,
							windowMs
						)
					};
				}

				bucket = {
					timestamps: [],
					headIndex: 0
				};
				buckets.set(normalizedKey, bucket);
			} else {
				pruneBucket(bucket, nowMs, windowMs);
			}

			if (getBucketSize(bucket) >= limit) {
				const oldestTimestamp = getOldestBucketTimestamp(bucket) ?? nowMs;
				return {
					allowed: false,
					retryAfterSeconds: getRetryAfterSeconds(
						oldestTimestamp,
						nowMs,
						windowMs
					)
				};
			}

			bucket.timestamps.push(nowMs);

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
