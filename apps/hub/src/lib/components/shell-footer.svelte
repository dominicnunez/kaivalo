<script lang="ts">
	import { onMount } from 'svelte';

	const DAY_IN_MS = 24 * 60 * 60 * 1000;

	type Props = {
		currentYear: number;
	};

	let { currentYear }: Props = $props();
	let displayedYear = $derived(currentYear);

	onMount(() => {
		let yearRefreshTimeout: ReturnType<typeof setTimeout> | undefined;
		let yearRefreshInterval: ReturnType<typeof setInterval> | undefined;

		const syncCurrentYear = () => {
			displayedYear = new Date().getFullYear();
		};
		const scheduleYearRefresh = () => {
			const now = new Date();
			const nextMidnight = new Date(now);
			nextMidnight.setHours(24, 0, 0, 0);
			const delayUntilMidnight = Math.max(
				0,
				nextMidnight.getTime() - now.getTime()
			);

			yearRefreshTimeout = setTimeout(() => {
				syncCurrentYear();
				yearRefreshInterval = setInterval(syncCurrentYear, DAY_IN_MS);
			}, delayUntilMidnight);
		};

		syncCurrentYear();
		scheduleYearRefresh();

		return () => {
			if (yearRefreshTimeout) {
				clearTimeout(yearRefreshTimeout);
			}
			if (yearRefreshInterval) {
				clearInterval(yearRefreshInterval);
			}
		};
	});
</script>

<footer class="footer-shell mt-6 border-t py-2 sm:mt-8 sm:py-2.5">
	<div class="w-full text-center">
		<p class="text-xs text-muted">
			<span
				class="text-accent font-display text-sm font-semibold tracking-tight"
			>
				Kaivalo
			</span>
			<span class="ml-2 font-mono">© {displayedYear}</span>
		</p>
	</div>
</footer>
