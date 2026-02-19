<script lang="ts">
	import { Container } from '@kaivalo/ui';
	import { Wrench, Sparkles, Github, Mail, ArrowRight, Terminal } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const services = [
		{
			icon: Wrench,
			title: 'Auto Repair Decoder',
			tagline: 'Decode repair speak',
			description: 'Turn mechanic jargon into plain English. Know what you\'re paying for before you pay for it.',
			status: 'coming-soon' as const,
			link: '#'
		},
		{
			icon: Sparkles,
			title: 'More Coming',
			tagline: 'In the workshop',
			description: 'Practical tools for everyday problems. Sign up once, use everything.',
			status: 'coming-soon' as const,
			link: '#'
		}
	];
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
<section class="relative flex items-center overflow-hidden pt-12 pb-6 sm:pt-16 sm:pb-8 md:min-h-[40vh] md:py-0">
	<!-- Aurora background -->
	<div class="aurora"></div>

	<Container size="lg" class="relative z-10">
		<div class="max-w-2xl">
			<!-- Origin tag -->
			<div class="animate-enter delay-1 mb-6 sm:mb-8">
				<span class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border font-mono text-xs tracking-wide"
					style="border-color: var(--border); color: var(--text-muted); background: var(--bg-secondary);">
					<Terminal class="w-3 h-3" style="color: var(--accent);" />
					Helsinki, Finland · 60.1699°N
				</span>
			</div>

			<!-- Headline -->
			<h1 class="font-display text-4xl sm:text-5xl md:text-7xl font-bold leading-[0.95] tracking-tight mb-4 sm:mb-6 animate-enter delay-2">
				Tools that<br/>
				<span style="color: var(--accent);">solve things.</span>
			</h1>

			<!-- Subheadline -->
			<p class="text-base sm:text-lg md:text-xl leading-relaxed max-w-xl mb-8 sm:mb-10 animate-enter delay-3"
				style="color: var(--text-secondary);">
				Simple tools for complicated problems. One account, every tool — sign up once and go.
			</p>

			<!-- CTA row -->
			<div class="flex flex-wrap items-center gap-3 sm:gap-4 animate-enter delay-4">
				<a href="#services"
					class="hover-fade inline-flex items-center gap-2 px-5 sm:px-6 py-3 rounded-lg font-semibold text-sm"
					style="background: var(--accent); color: var(--bg-primary);">
					See what's live
					<ArrowRight class="w-4 h-4" />
				</a>
				<a href="#about"
					class="hover-border inline-flex items-center gap-2 px-5 sm:px-6 py-3 rounded-lg font-medium text-sm border"
					style="border-color: var(--border); color: var(--text-secondary);">
					Learn more
				</a>
			</div>
		</div>
	</Container>
</section>

<!-- ════════ SERVICES ════════ -->
<section id="services" class="relative py-8 sm:py-12 dots-bg">
	<Container size="lg">
		<!-- Section header — left aligned -->
		<div class="mb-8 sm:mb-10 max-w-lg">
			<span class="font-mono text-xs tracking-widest uppercase mb-3 block"
				style="color: var(--accent);">Services</span>
			<h2 class="font-display text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight">
				What's coming
			</h2>
		</div>

		<!-- Service cards -->
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
			{#each services as service}
				{@const isLive = service.status === 'live'}
				{@const Icon = service.icon}
				{#if isLive}
					<a href={service.link}
						class="group block rounded-xl border p-6 sm:p-8 card-glow"
						style="border-color: var(--border); background: var(--bg-card);">
						<div class="flex items-start justify-between mb-5 sm:mb-6">
							<div class="w-10 sm:w-11 h-10 sm:h-11 rounded-lg flex items-center justify-center"
								style="background: var(--accent-dim);">
								<Icon class="w-5 h-5" style="color: var(--accent);" />
							</div>
							<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
								style="background: var(--accent-dim); color: var(--accent);">
								<span class="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
								Live
							</span>
						</div>

						<h3 class="font-display text-lg sm:text-xl font-semibold mb-1">{service.title}</h3>
						<p class="font-mono text-xs mb-3 sm:mb-4" style="color: var(--text-muted);">{service.tagline}</p>
						<p style="color: var(--text-secondary);" class="text-sm leading-relaxed mb-5 sm:mb-6">
							{service.description}
						</p>

						<span class="inline-flex items-center gap-2 text-sm font-medium transition-all duration-200"
							style="color: var(--accent);">
							Launch
							<ArrowRight class="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
						</span>
					</a>
				{:else}
					<div class="rounded-xl border p-6 sm:p-8"
						style="border-color: var(--border); background: var(--bg-card);">
						<div class="flex items-start justify-between mb-5 sm:mb-6">
							<div class="w-10 sm:w-11 h-10 sm:h-11 rounded-lg flex items-center justify-center"
								style="background: var(--bg-tertiary);">
								<Icon class="w-5 h-5" style="color: var(--text-muted);" />
							</div>
							<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
								style="background: var(--bg-tertiary); color: var(--text-muted);">
								Soon
							</span>
						</div>

						<h3 class="font-display text-lg sm:text-xl font-semibold mb-1">{service.title}</h3>
						<p class="font-mono text-xs mb-3 sm:mb-4" style="color: var(--text-muted);">{service.tagline}</p>
						<p style="color: var(--text-muted);" class="text-sm leading-relaxed">
							{service.description}
						</p>
					</div>
				{/if}
			{/each}
		</div>
	</Container>
</section>

<!-- ════════ ABOUT ════════ -->
<section id="about" class="relative py-8 sm:py-12">
	<Container size="lg">
		<div class="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-16 items-start">
			<!-- Left column: identity -->
			<div class="md:col-span-4">
				<!-- Avatar -->
				<div class="w-16 sm:w-20 h-16 sm:h-20 rounded-2xl flex items-center justify-center mb-5 sm:mb-6 relative"
					style="background: linear-gradient(135deg, var(--accent-dim), var(--bg-tertiary));">
					<span class="font-display text-xl sm:text-2xl font-bold" style="color: var(--accent);">K</span>
					<div class="absolute -inset-px rounded-2xl border" style="border-color: var(--border);"></div>
				</div>

				<h2 class="font-display text-xl sm:text-2xl font-bold mb-2">Kai Valo</h2>
				<p class="font-mono text-xs tracking-wide" style="color: var(--text-muted);">
					Helsinki, Finland
				</p>
			</div>

			<!-- Right column: about text -->
			<div class="md:col-span-8">
				<div class="max-w-lg">
					<p class="text-sm sm:text-base leading-relaxed mb-4 sm:mb-5" style="color: var(--text-secondary);">
						I build tools that cut through complexity. If something is confusing,
						there should be a tool that makes it clear. Mechanic quotes shouldn't
						require a dictionary. Medical bills shouldn't need a translator.
					</p>
					<p class="text-sm sm:text-base leading-relaxed mb-4 sm:mb-5" style="color: var(--text-secondary);">
						Information asymmetry is a solvable problem — and solving it
						is what I spend my time on.
					</p>
					<p class="text-xs sm:text-sm" style="color: var(--text-muted);">
						One account, all tools. Sign up once and everything
						just works — no juggling logins across services.
					</p>
				</div>
			</div>
		</div>
	</Container>
</section>

<!-- ════════ FOOTER ════════ -->
<footer class="py-8 sm:py-10 border-t" style="border-color: var(--border);">
	<Container size="lg">
		<div class="flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6">
			<!-- Left: mark -->
			<div class="flex items-center gap-3">
				<span class="font-display text-sm font-semibold tracking-tight">kaivalo</span>
				<span class="font-mono text-xs" style="color: var(--text-muted);">© 2026</span>
			</div>

			<!-- Right: links -->
			<div class="flex items-center gap-6">
				<a href="https://github.com/dominicnunez"
					target="_blank"
					rel="noopener noreferrer"
					class="hover-text flex items-center gap-2 text-xs"
					style="color: var(--text-muted);">
					<Github class="w-3.5 h-3.5" />
					GitHub
				</a>
				<a href="mailto:kaievalo@proton.me"
					class="hover-text flex items-center gap-2 text-xs"
					style="color: var(--text-muted);">
					<Mail class="w-3.5 h-3.5" />
					Contact
				</a>
			</div>
		</div>
	</Container>
</footer>
