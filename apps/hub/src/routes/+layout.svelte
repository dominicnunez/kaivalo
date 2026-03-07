<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	function getAuthErrorSignature(
		authError: LayoutData['authError']
	): string | null {
		if (!authError) {
			return null;
		}

		return `${authError.message}:${authError.incidentId ?? ''}`;
	}

	let { children, data }: { children: Snippet; data: LayoutData } = $props();
	let dismissedAuthErrorSignature = $state<string | null>(null);
	let authErrorSignature = $derived(getAuthErrorSignature(data.authError));
	let authError = $derived(
		authErrorSignature && dismissedAuthErrorSignature === authErrorSignature
			? null
			: data.authError
	);

	function dismissError() {
		dismissedAuthErrorSignature = authErrorSignature;
		const url = new URL(page.url);
		url.searchParams.delete('error');
		url.searchParams.delete('incident');
		url.searchParams.delete('ts');
		url.searchParams.delete('sig');
		const nextLocation = url.pathname + url.search + url.hash;
		const currentLocation = page.url.pathname + page.url.search + page.url.hash;
		if (nextLocation === currentLocation) {
			return;
		}
		goto(nextLocation, { replaceState: true });
	}
</script>

<div class="min-h-screen grain">
	{#if authError}
		<div class="auth-error-banner relative z-30 px-4 py-3 text-center text-sm">
			{authError.message}
			{#if authError.incidentId}
				<span class="ml-2 font-mono text-xs">(ref {authError.incidentId})</span>
			{/if}
			<button
				onclick={dismissError}
				class="auth-error-dismiss ml-3 text-xs font-medium cursor-pointer"
				aria-label="Dismiss">✕</button
			>
		</div>
	{/if}

	<!-- Nav removed — sign in lives in hero -->

	<main>
		{@render children()}
	</main>
</div>
