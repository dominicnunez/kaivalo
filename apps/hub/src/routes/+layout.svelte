<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	const INCIDENT_ID_PATTERN =
		/^(auth(?:cb|so|layout)|hook)_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

	function sanitizeIncidentId(value: string | null | undefined): string | null {
		if (!value || !INCIDENT_ID_PATTERN.test(value)) {
			return null;
		}

		return value;
	}

	function resolveAuthError(
		source: LayoutData['authError'],
		queryAuthError: boolean,
		queryIncidentId: string | null
	): LayoutData['authError'] {
		const candidate =
			source ??
			(queryAuthError
				? {
						message: 'Sign-in failed. Please try again.',
						incidentId: queryIncidentId
					}
				: null);

		if (!candidate) {
			return null;
		}

		return {
			...candidate,
			incidentId: sanitizeIncidentId(candidate.incidentId)
		};
	}

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

	let queryAuthError = $derived(page.url.searchParams.get('error') === 'auth');
	let queryIncidentId = $derived(
		sanitizeIncidentId(page.url.searchParams.get('incident'))
	);
	let authError = $derived(
		resolveAuthError(data.authError, queryAuthError, queryIncidentId)
	);

	function dismissError() {
		const url = new URL(page.url);
		url.searchParams.delete('error');
		url.searchParams.delete('incident');
		goto(url.pathname + url.search + url.hash, { replaceState: true });
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
