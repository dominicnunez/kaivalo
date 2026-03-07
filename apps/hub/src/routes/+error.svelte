<script lang="ts">
	import { page } from '$app/state';
	import { Container } from '@kaivalo/ui';
</script>

<div class="min-h-[60vh] flex items-center justify-center">
	<Container size="sm">
		<div class="text-center">
			<p class="font-mono text-sm mb-3 text-muted">
				{page.status}
			</p>
			<h1 class="font-display text-2xl sm:text-3xl font-bold mb-4">
				Something went wrong
			</h1>
			<p class="text-sm mb-8 text-secondary">
				{#if page.status === 404}
					The page you're looking for doesn't exist.
				{:else}
					An unexpected error occurred. Please try again.
				{/if}
			</p>
			{#if page.error?.incidentId}
				<p class="font-mono text-xs mb-8 text-muted">
					Reference: {page.error.incidentId}
				</p>
			{/if}
			<a href="/"
				class="hover-fade inline-flex items-center gap-2 px-5 py-3 rounded-lg font-semibold text-sm bg-accent text-bg-primary">
				Back to home
			</a>
		</div>
	</Container>
</div>
