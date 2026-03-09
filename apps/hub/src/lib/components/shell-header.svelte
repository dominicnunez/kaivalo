<script lang="ts">
	import { Container } from '@kaivalo/ui';
	import AccountControls from '$lib/components/account-controls.svelte';

	type ShellUser = {
		firstName: string | null;
		email: string;
		profilePictureUrl: string | null;
	};

	type Props = {
		user: ShellUser | null;
		signInUrl?: string | null;
		linkHref?: string | null;
		linkLabel?: string | null;
	};

	let {
		user,
		signInUrl = null,
		linkHref = null,
		linkLabel = null
	}: Props = $props();
</script>

<header class="shell-header relative z-20 border-b">
	<div class="sm:hidden">
		<Container size="lg">
			<div class="flex min-h-14 items-center justify-between gap-4 py-2.5">
				<a
					href="/"
					class="font-display text-sm font-semibold tracking-tight text-accent"
				>
					Kaivalo
				</a>
				<div class="flex items-center justify-end">
					<AccountControls {user} {signInUrl} {linkHref} {linkLabel} />
				</div>
			</div>
		</Container>
	</div>

	<Container size="lg" class="hidden sm:block">
		<div class="flex min-h-14 items-center py-2.5">
			<a
				href="/"
				class="font-display text-sm font-semibold tracking-tight text-accent"
			>
				Kaivalo
			</a>
		</div>
	</Container>

	<div
		class="absolute inset-y-0 right-4 hidden items-center sm:flex lg:right-8"
	>
		<AccountControls {user} {signInUrl} {linkHref} {linkLabel} />
	</div>
</header>
