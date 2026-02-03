<script lang="ts">
	import { Button } from '@kaivalo/ui';
	import { Container } from '@kaivalo/ui';

	function scrollToServices() {
		const servicesSection = document.getElementById('services');
		if (servicesSection) {
			servicesSection.scrollIntoView({ behavior: 'smooth' });
		}
	}
</script>

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

<!-- Services Section Placeholder -->
<section id="services" class="py-20">
	<Container size="lg">
		<h2 class="text-3xl font-bold text-center text-gray-900 mb-12">Services</h2>
		<p class="text-center text-gray-600">Coming in the next iteration...</p>
	</Container>
</section>
