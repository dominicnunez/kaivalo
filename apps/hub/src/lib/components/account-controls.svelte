<script lang="ts">
	import { LayoutDashboard, LogIn, LogOut } from 'lucide-svelte';

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
		className?: string;
	};

	let {
		user,
		signInUrl = null,
		linkHref = null,
		linkLabel = null,
		className = ''
	}: Props = $props();

	const fallbackInitial = $derived(
		(user?.firstName?.[0] ?? user?.email?.[0] ?? '?').toUpperCase()
	);
	const displayName = $derived(user?.firstName ?? user?.email ?? 'User');
</script>

<div class={`flex items-center gap-2.5 ${className}`.trim()}>
	{#if user}
		{#if user.profilePictureUrl}
			<img
				src={user.profilePictureUrl}
				alt={displayName}
				referrerpolicy="no-referrer"
				crossorigin="anonymous"
				class="avatar-border h-7 w-7 rounded-full object-cover"
			/>
		{:else}
			<div
				class="avatar-fallback flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium"
			>
				{fallbackInitial}
			</div>
		{/if}
		<span class="text-secondary hidden text-xs sm:inline">{displayName}</span>
		{#if linkHref && linkLabel}
			<a
				href={linkHref}
				class="chasing-border signin-btn inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium"
			>
				<LayoutDashboard class="h-3.5 w-3.5" />
				{linkLabel}
			</a>
		{/if}
		<form method="POST" action="/auth/sign-out">
			<button
				type="submit"
				class="signout-btn hover-border inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium"
			>
				<LogOut class="h-3.5 w-3.5" />
				Sign out
			</button>
		</form>
	{:else if signInUrl}
		<a
			href={signInUrl}
			class="chasing-border signin-btn inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium"
		>
			<LogIn class="h-3.5 w-3.5" />
			Sign in
		</a>
	{:else}
		<button
			type="button"
			class="signin-btn inline-flex cursor-not-allowed items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium opacity-60"
			disabled
			aria-disabled="true"
			title="Sign-in is temporarily unavailable"
		>
			<LogIn class="h-3.5 w-3.5" />
			Sign in unavailable
		</button>
	{/if}
</div>
