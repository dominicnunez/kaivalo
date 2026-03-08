<script lang="ts">
	import { Container } from '@kaivalo/ui';
	import { Calendar, ExternalLink, LogOut, Mic } from 'lucide-svelte';
	import type { PageData } from './$types';
	import type { ServiceIconKey } from '$lib/services/registry.ts';

	let { data }: { data: PageData } = $props();

	const serviceIcons: Record<ServiceIconKey, typeof Calendar> = {
		calendar: Calendar,
		mic: Mic
	};
</script>

<svelte:head>
	<title>{data.meta.title}</title>
	<meta name="description" content={data.meta.description} />
</svelte:head>

<section class="relative overflow-hidden pt-12 pb-8 sm:pt-16 sm:pb-10">
	<div class="aurora"></div>

	<Container size="lg" class="relative z-10">
		<div
			class="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between"
		>
			<div class="max-w-2xl">
				<p class="text-muted font-mono text-xs uppercase tracking-[0.24em]">
					Service launcher
				</p>
				<h1
					class="font-display text-4xl sm:text-5xl md:text-6xl font-bold leading-[0.95] tracking-tight mt-3"
				>
					Launch the tools
					<span class="text-accent">ready for your work.</span>
				</h1>
				<p
					class="text-secondary text-sm sm:text-base leading-relaxed mt-4 max-w-xl"
				>
					Signed in as {data.user?.firstName ?? data.user?.email}. Open Sweep
					now, and keep an eye on what is coming next.
				</p>
			</div>

			<form method="POST" action="/auth/sign-out">
				<button
					type="submit"
					class="signout-btn hover-border inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer"
				>
					<LogOut class="w-3.5 h-3.5" />
					Sign out
				</button>
			</form>
		</div>
	</Container>
</section>

<section class="relative py-6 sm:py-8" data-testid="active-services">
	<Container size="lg">
		<div class="mb-8 sm:mb-10 max-w-xl">
			<h2
				class="font-display text-lg sm:text-xl md:text-2xl font-bold tracking-tight"
			>
				Available now
			</h2>
			<p class="text-secondary text-sm sm:text-base leading-relaxed mt-2">
				Active services available from your Kaivalo account.
			</p>
		</div>

		<div class="grid grid-cols-1 gap-4 sm:gap-6">
			{#each data.activeServices as service}
				{@const Icon = serviceIcons[service.icon]}
				<article
					class="service-card-shell service-card rounded-xl border p-6 sm:p-8"
				>
					<div
						class="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"
					>
						<div class="max-w-2xl">
							<div class="flex items-center gap-3 mb-4">
								<div
									class="icon-shell-soon w-10 h-10 rounded-lg flex items-center justify-center"
								>
									<Icon class="text-muted w-5 h-5 icon-muted" />
								</div>
								<span
									class="badge-soon inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
								>
									Active
								</span>
							</div>
							<h3 class="font-display text-xl font-semibold mb-1">
								{service.name}
							</h3>
							<p class="text-muted font-mono text-xs mb-3">{service.tagline}</p>
							<p class="text-secondary text-sm leading-relaxed">
								{service.description}
							</p>
						</div>

						<a
							href={service.appUrl}
							class="chasing-border signin-btn inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium whitespace-nowrap"
						>
							<ExternalLink class="w-3.5 h-3.5" />
							Open {service.name}
						</a>
					</div>
				</article>
			{/each}
		</div>
	</Container>
</section>

<section class="relative py-6 sm:py-8" data-testid="planned-services">
	<Container size="lg">
		<div class="mb-8 sm:mb-10 max-w-xl">
			<h2
				class="font-display text-lg sm:text-xl md:text-2xl font-bold tracking-tight"
			>
				Planned
			</h2>
			<p class="text-secondary text-sm sm:text-base leading-relaxed mt-2">
				Services that are on the roadmap but not launchable yet.
			</p>
		</div>

		<div class="grid grid-cols-1 gap-4 sm:gap-6">
			{#each data.plannedServices as service}
				{@const Icon = serviceIcons[service.icon]}
				<article
					class="service-card-shell service-card rounded-xl border p-6 sm:p-8"
				>
					<div
						class="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"
					>
						<div class="max-w-2xl">
							<div class="flex items-center gap-3 mb-4">
								<div
									class="icon-shell-soon w-10 h-10 rounded-lg flex items-center justify-center"
								>
									<Icon class="text-muted w-5 h-5 icon-muted" />
								</div>
								<span
									class="badge-soon inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
								>
									Planned
								</span>
							</div>
							<h3 class="font-display text-xl font-semibold mb-1">
								{service.name}
							</h3>
							<p class="text-muted font-mono text-xs mb-3">{service.tagline}</p>
							<p class="text-secondary text-sm leading-relaxed">
								{service.description}
							</p>
						</div>

						<span
							class="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium opacity-60 cursor-not-allowed"
							aria-disabled="true"
						>
							Coming soon
						</span>
					</div>
				</article>
			{/each}
		</div>
	</Container>
</section>
