<script lang="ts">
	import { Button, Card, Badge } from '@kaivalo/ui';
	import { Container } from '@kaivalo/ui';
	import { Wrench, Sparkles, Github, Mail } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function scrollToServices() {
		const servicesSection = document.getElementById('services');
		if (servicesSection) {
			servicesSection.scrollIntoView({ behavior: 'smooth' });
		}
	}

	const services = [
		{
			icon: Wrench,
			title: 'MechanicAI',
			description: 'Turn repair jargon into plain English. Know what you\'re paying for.',
			status: 'live' as const,
			link: 'https://mechai.kaivalo.com'
		},
		{
			icon: Sparkles,
			title: 'Coming Soon',
			description: 'More tools on the way.',
			status: 'coming-soon' as const,
			link: '#'
		}
	];
</script>

<svelte:head>
	<title>{data.meta.title}</title>
	<meta name="description" content={data.meta.description} />

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content={data.meta.url} />
	<meta property="og:title" content={data.meta.title} />
	<meta property="og:description" content={data.meta.description} />
	<meta property="og:image" content={data.meta.image} />
	<meta property="og:image:alt" content={data.meta.imageAlt} />

	<!-- Twitter -->
	<meta name="twitter:card" content={data.meta.twitterCard} />
	<meta name="twitter:url" content={data.meta.url} />
	<meta name="twitter:title" content={data.meta.title} />
	<meta name="twitter:description" content={data.meta.description} />
	<meta name="twitter:image" content={data.meta.image} />
	<meta name="twitter:image:alt" content={data.meta.imageAlt} />
</svelte:head>

<!-- Hero Section -->
<section class="relative min-h-[80vh] flex items-center justify-center bg-gradient-to-b from-blue-50 via-white to-white">
	<Container size="lg" class="text-center py-20">
		<h1 class="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 mb-6">
			AI Tools That Actually Help
		</h1>
		<p class="text-xl sm:text-2xl text-gray-600 mb-10 max-w-2xl mx-auto">
			Practical tools built by Kai Valo. No hype, just utility.
		</p>
		<Button variant="primary" size="lg" onclick={scrollToServices}>
			View Services
		</Button>
	</Container>
</section>

<!-- Services Section -->
<section id="services" class="py-20 bg-gray-50">
	<Container size="lg">
		<h2 class="text-3xl font-bold text-center text-gray-900 mb-12">Services</h2>

		<!-- Services Grid: 1 col mobile, 2 col tablet, 3 col desktop -->
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
			{#each services as service}
				<Card
					variant={service.link !== '#' ? 'link' : 'default'}
					href={service.link !== '#' ? service.link : undefined}
					hover={true}
					class="flex flex-col h-full"
				>
					<div class="p-6 flex flex-col h-full">
						<!-- Icon -->
						<div class="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center mb-4">
							<svelte:component this={service.icon} class="w-6 h-6 text-blue-600" />
						</div>

						<!-- Title and Badge -->
						<div class="flex items-center gap-3 mb-3">
							<h3 class="text-xl font-semibold text-gray-900">{service.title}</h3>
							<Badge status={service.status} size="sm">
								{service.status === 'live' ? 'Live' : service.status === 'beta' ? 'Beta' : 'Coming Soon'}
							</Badge>
						</div>

						<!-- Description -->
						<p class="text-gray-600 flex-grow">{service.description}</p>

						<!-- Link indicator for live services -->
						{#if service.link !== '#'}
							<div class="mt-4 text-blue-600 font-medium text-sm">
								Visit →
							</div>
						{/if}
					</div>
				</Card>
			{/each}
		</div>
	</Container>
</section>

<!-- About Section -->
<section id="about" class="py-20 bg-white">
	<Container size="md" class="text-center">
		<!-- Avatar placeholder -->
		<div class="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 mx-auto mb-6 flex items-center justify-center">
			<span class="text-3xl font-bold text-white">K</span>
		</div>

		<h2 class="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
			Built by Kai Valo
		</h2>

		<p class="text-lg text-gray-600 max-w-xl mx-auto mb-4">
			I build tools that solve real problems—no fluff, no buzzwords. Just practical AI that helps you understand what's actually going on.
		</p>

		<p class="text-base text-gray-500 max-w-xl mx-auto">
			Whether it's decoding mechanic speak or something else entirely, the goal is always the same: make complex things simple.
		</p>
	</Container>
</section>

<!-- Footer -->
<footer class="py-8 bg-gray-900 text-gray-300">
	<Container size="lg">
		<div class="flex flex-col sm:flex-row items-center justify-between gap-4">
			<!-- Copyright -->
			<p class="text-sm">© 2026 Kai Valo</p>

			<!-- Links -->
			<div class="flex items-center gap-6">
				<a
					href="https://github.com/kaivalo"
					target="_blank"
					rel="noopener noreferrer"
					class="flex items-center gap-2 text-sm hover:text-white transition-colors"
				>
					<Github class="w-4 h-4" />
					<span>GitHub</span>
				</a>
				<a
					href="mailto:kaievalo@proton.me"
					class="flex items-center gap-2 text-sm hover:text-white transition-colors"
				>
					<Mail class="w-4 h-4" />
					<span>Contact</span>
				</a>
			</div>
		</div>
	</Container>
</footer>
