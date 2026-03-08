<script lang="ts">
	import { Container } from '@kaivalo/ui';
	import { Calendar, Mail, Mic, LogIn, LogOut } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { onMount } from 'svelte';

	let { data }: { data: PageData } = $props();

	type Service = {
		icon: typeof Calendar;
		title: string;
		tagline: string;
		description: string;
	};

	const services: Service[] = [
		{
			icon: Calendar,
			title: 'Sweep',
			tagline: 'Stay on schedule',
			description: 'Smart scheduling for chimney professionals.'
		},
		{
			icon: Mic,
			title: 'PodStudio',
			tagline: 'Podcast management',
			description:
				'Equipment tracking and session scheduling for podcast studios.'
		}
	];

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

<!-- ════════ HERO ════════ -->
<section
	class="relative flex items-center overflow-hidden pt-12 pb-2 sm:pt-16 sm:pb-4 md:min-h-[30vh] md:py-0"
>
	<!-- Aurora background -->
	<div class="aurora"></div>

	<!-- Sign In — top right of section -->
	<div
		class="absolute top-4 right-4 sm:top-6 sm:right-8 z-20 animate-enter delay-1"
	>
		{#if data.user}
			<div class="flex items-center gap-3">
				{#if data.user.profilePictureUrl}
					<img
						src={data.user.profilePictureUrl}
						alt={data.user.firstName ?? 'User'}
						referrerpolicy="no-referrer"
						crossorigin="anonymous"
						class="avatar-border w-7 h-7 rounded-full object-cover"
					/>
				{:else}
					<div
						class="avatar-fallback w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium"
					>
						{(
							data.user.firstName?.[0] ??
							data.user.email?.[0] ??
							'?'
						).toUpperCase()}
					</div>
				{/if}
				<span class="text-secondary text-xs hidden sm:inline">
					{data.user.firstName ?? data.user.email}
				</span>
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
		{:else if data.signInUrl}
			<a
				href={data.signInUrl}
				class="chasing-border signin-btn inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium"
			>
				<LogIn class="w-3.5 h-3.5" />
				Sign in
			</a>
		{:else}
			<button
				type="button"
				class="signin-btn inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium opacity-60 cursor-not-allowed"
				disabled
				aria-disabled="true"
				title="Sign-in is temporarily unavailable"
			>
				<LogIn class="w-3.5 h-3.5" />
				Sign in unavailable
			</button>
		{/if}
	</div>

	<Container size="lg" class="relative z-10">
		<div class="max-w-2xl">
			<!-- Headline -->
			<h1
				class="font-display text-4xl sm:text-5xl md:text-7xl font-bold leading-[0.95] tracking-tight mb-4 sm:mb-6 animate-enter delay-2"
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
			{#each services as service}
				{@const Icon = service.icon}
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
						<span
							class="badge-soon inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium transition-colors duration-300 soon-badge"
						>
							Soon
						</span>
					</div>

					<h3 class="font-display text-lg sm:text-xl font-semibold mb-1">
						{service.title}
					</h3>
					<p class="text-muted font-mono text-xs mb-3 sm:mb-4">
						{service.tagline}
					</p>
					<p class="text-muted text-sm leading-relaxed">
						{service.description}
					</p>
				</div>
			{/each}
		</div>
	</Container>
</section>

<!-- ════════ ABOUT ════════ -->
<section id="about" class="relative py-8 sm:py-12">
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

<!-- ════════ FOOTER ════════ -->
<footer class="footer-shell py-8 sm:py-10 border-t">
	<Container size="lg">
		<div
			class="flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6"
		>
			<!-- Left: mark -->
			<div class="flex items-center gap-3">
				<span
					class="text-accent font-display text-sm font-semibold tracking-tight"
					>Kaivalo</span
				>
				<span class="text-muted font-mono text-xs">© {currentYear}</span>
			</div>

			<!-- Right: links -->
			<div class="flex items-center gap-6">
				<a
					href="mailto:kaivalo@proton.me"
					class="text-muted hover-text flex items-center gap-2 text-xs"
				>
					<Mail class="w-3.5 h-3.5" />
					Contact
				</a>
			</div>
		</div>
	</Container>
</footer>
