<script lang="ts">
	type Props = {
		currentYear: number;
	};

	let { currentYear }: Props = $props();
</script>

<footer class="footer-shell mt-6 border-t py-2 sm:mt-8 sm:py-2.5">
	<div class="w-full text-center">
		<p class="text-xs text-muted">
			<span
				class="text-accent font-display text-sm font-semibold tracking-tight"
			>
				Kaivalo
			</span>
			<span class="ml-2 font-mono">© {currentYear}</span>
		</p>
	</div>
</footer>
