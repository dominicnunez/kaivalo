<script lang="ts">
	import { Container } from '@kaivalo/ui';
	import { ArrowRight, Calendar, Mic } from 'lucide-svelte';
	import type { PageData } from './$types';
	import {
		isLauncherServiceAvailable,
		type ServiceIconKey
	} from '$lib/services/registry.ts';
	import ShellHeader from '$lib/components/shell-header.svelte';
	import ShellFooter from '$lib/components/shell-footer.svelte';
	import { onMount } from 'svelte';

	let { data }: { data: PageData } = $props();
	const serviceIcons: Record<ServiceIconKey, typeof Calendar> = {
		calendar: Calendar,
		mic: Mic
	};

	const phrases = ['chimney cleaning', 'podcast equipment rentals'];
	const TYPEWRITER_TYPING_DELAY_MS = 100;
	const TYPEWRITER_DELETE_DELAY_MS = 50;
	const TYPEWRITER_PAUSE_FULL_MS = 2000;
	const TYPEWRITER_PAUSE_EMPTY_MS = 500;
	const TYPEWRITER_MAX_CYCLES = 2;
	const DAY_IN_MS = 24 * 60 * 60 * 1000;
	let currentText = $state('');
	let mounted = $state(false);
	let pageVisible = $state(true);
	let reducedMotion = $state(false);
	let currentYear = $derived(data.currentYear);

	onMount(() => {
		mounted = true;
		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const updateReducedMotion = () => {
			reducedMotion = mediaQuery.matches;
		};
		const updateVisibility = () => {
			pageVisible = document.visibilityState === 'visible';
		};

		updateReducedMotion();
		updateVisibility();

		let yearRefreshTimeout: ReturnType<typeof setTimeout> | undefined;
		let yearRefreshInterval: ReturnType<typeof setInterval> | undefined;
		const scheduleYearRefresh = () => {
			const now = new Date();
			const nextMidnight = new Date(now);
			nextMidnight.setHours(24, 0, 0, 0);
			const delayUntilMidnight = Math.max(
				0,
				nextMidnight.getTime() - now.getTime()
			);
			yearRefreshTimeout = setTimeout(() => {
				currentYear = new Date().getFullYear();
				yearRefreshInterval = setInterval(() => {
					currentYear = new Date().getFullYear();
				}, DAY_IN_MS);
			}, delayUntilMidnight);
		};
		scheduleYearRefresh();

		mediaQuery.addEventListener('change', updateReducedMotion);
		document.addEventListener('visibilitychange', updateVisibility);

		return () => {
			if (yearRefreshTimeout) {
				clearTimeout(yearRefreshTimeout);
			}
			if (yearRefreshInterval) {
				clearInterval(yearRefreshInterval);
			}
			mediaQuery.removeEventListener('change', updateReducedMotion);
			document.removeEventListener('visibilitychange', updateVisibility);
		};
	});

	$effect(() => {
		if (!mounted) return;
		if (reducedMotion) {
			currentText = phrases[0];
			return;
		}
		if (!pageVisible) return;

		let timeout: ReturnType<typeof setTimeout>;
		let idx = 0;
		let deleting = false;
		let text = '';
		let active = true;
		let completedCycles = 0;

		function tick() {
			if (!active) return;
			const phrase = phrases[idx];

			if (!deleting) {
				if (text.length < phrase.length) {
					text = phrase.slice(0, text.length + 1);
					currentText = text;
					timeout = setTimeout(tick, TYPEWRITER_TYPING_DELAY_MS);
				} else {
					timeout = setTimeout(() => {
						deleting = true;
						tick();
					}, TYPEWRITER_PAUSE_FULL_MS);
				}
			} else {
				if (text.length > 0) {
					text = text.slice(0, -1);
					currentText = text;
					timeout = setTimeout(tick, TYPEWRITER_DELETE_DELAY_MS);
				} else {
					deleting = false;
					idx = (idx + 1) % phrases.length;
					if (idx === 0) {
						completedCycles += 1;
						if (completedCycles >= TYPEWRITER_MAX_CYCLES) {
							currentText = phrases[0];
							active = false;
							return;
						}
					}
					timeout = setTimeout(tick, TYPEWRITER_PAUSE_EMPTY_MS);
				}
			}
		}

		tick();

		return () => {
			active = false;
			clearTimeout(timeout);
		};
	});
</script>

<svelte:head>
	<title>{data.meta.title}</title>
	<meta name="description" content={data.meta.description} />
	<meta property="og:type" content="website" />
	<meta property="og:url" content={data.meta.url} />
	<meta property="og:title" content={data.meta.title} />
	<meta property="og:description" content={data.meta.description} />
	<meta property="og:image" content={data.meta.image} />
	<meta property="og:image:alt" content={data.meta.imageAlt} />
	<meta name="twitter:card" content={data.meta.twitterCard} />
	<meta name="twitter:title" content={data.meta.title} />
	<meta name="twitter:description" content={data.meta.description} />
	<meta name="twitter:image" content={data.meta.image} />
</svelte:head>

<ShellHeader
	user={data.user}
	signInUrl={data.signInUrl}
	linkHref={data.user ? '/services' : null}
	linkLabel={data.user ? 'Open services' : null}
/>

<!-- ════════ HERO ════════ -->
<section
	class="relative overflow-hidden pt-4 pb-2 sm:pt-5 sm:pb-4 md:min-h-[30vh]"
>
	<!-- Aurora background -->
	<div class="aurora"></div>

	<Container size="lg" class="relative z-10">
		<div class="max-w-3xl">
			<!-- Headline -->
			<h1
				class="font-display text-4xl sm:text-5xl md:text-6xl font-bold leading-[0.95] tracking-tight mb-4 sm:mb-6 animate-enter delay-2"
			>
				Tools that<br />
				<span class="text-accent">solve things.</span>
			</h1>

			<!-- Subheadline with typewriter effect -->
			<div
				class="text-secondary text-base sm:text-lg md:text-xl leading-relaxed max-w-xl animate-enter delay-3 font-mono"
			>
				Making {currentText}<span
					class="typewriter-cursor typewriter-cursor-spacing">|</span
				>simple.
			</div>
		</div>
	</Container>
</section>

<!-- ════════ SERVICES ════════ -->
<section id="services" class="relative py-6 sm:py-8">
	<Container size="lg">
		<!-- Section header — left aligned -->
		<div class="mb-8 sm:mb-10 max-w-lg">
			<h2
				class="font-display text-lg sm:text-xl md:text-2xl font-bold tracking-tight"
			>
				Coming soon...
			</h2>
		</div>

		<!-- Service cards -->
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
			{#each data.marketingServices as service}
				{@const Icon = serviceIcons[service.icon]}
				{@const isAvailable = isLauncherServiceAvailable(service)}
				<div
					class="service-card-shell group rounded-xl border p-6 sm:p-8 service-card"
				>
					<div class="flex items-start justify-between mb-5 sm:mb-6">
						<div
							class="icon-shell-soon w-10 sm:w-11 h-10 sm:h-11 rounded-lg flex items-center justify-center transition-colors duration-300"
						>
							<Icon
								class="text-muted w-5 h-5 transition-colors duration-300 icon-muted"
							/>
						</div>
						{#if isAvailable}
							<span
								class="badge-soon inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium transition-colors duration-300 soon-badge"
							>
								Active
							</span>
						{:else}
							<span
								class="badge-soon inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium transition-colors duration-300 soon-badge"
							>
								Soon
							</span>
						{/if}
					</div>

					<h3 class="font-display text-lg sm:text-xl font-semibold mb-1">
						{service.name}
					</h3>
					<p class="text-muted font-mono text-xs mb-3 sm:mb-4">
						{service.tagline}
					</p>
					<p class="text-muted text-sm leading-relaxed">
						{service.description}
					</p>
					{#if isAvailable}
						<div class="mt-5">
							<a
								href="/services"
								class="text-secondary hover-text inline-flex items-center gap-1.5 text-xs font-medium"
							>
								Open from your services
								<ArrowRight class="w-3.5 h-3.5" />
							</a>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</Container>
</section>

<!-- ════════ ABOUT ════════ -->
<section id="about" class="relative pt-6 pb-2 sm:pt-8 sm:pb-3">
	<Container size="lg">
		<h2
			class="font-display text-lg sm:text-xl md:text-2xl font-bold tracking-tight mb-6 sm:mb-8"
		>
			Philosophy
		</h2>
		<div class="max-w-2xl">
			<p
				class="text-secondary text-sm sm:text-base leading-relaxed mb-4 sm:mb-5"
			>
				Information asymmetry is a solvable problem.
			</p>
			<p
				class="text-secondary text-sm sm:text-base leading-relaxed mb-4 sm:mb-5"
			>
				Chimney cleaning shouldn't mean sticky notes and weather guessing.
				Podcast studios shouldn't track equipment on spreadsheets. If something
				is confusing, there should be a tool that makes it clear.
			</p>
			<p class="text-muted text-xs sm:text-sm">
				One account, all tools. Sign up once and everything just works.
			</p>
		</div>
	</Container>
</section>

<ShellFooter {currentYear} />
