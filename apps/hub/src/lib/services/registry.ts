export type ServiceIconKey = 'calendar' | 'mic';

export type ServiceLifecycle = 'planned' | 'active' | 'disabled' | 'retired';

export type ServiceRegistryEntry = {
	id: string;
	name: string;
	tagline: string;
	description: string;
	icon: ServiceIconKey;
	category: 'operations' | 'media';
	lifecycle: ServiceLifecycle;
	marketingVisible: boolean;
	launcherVisible: boolean;
	requiresAuth: boolean;
	enabled: boolean;
	publicUrl: string;
	appUrl: string;
};

function cloneService(
	service: Readonly<ServiceRegistryEntry>
): ServiceRegistryEntry {
	return { ...service };
}

const SERVICE_REGISTRY: ReadonlyArray<Readonly<ServiceRegistryEntry>> = [
	Object.freeze({
		id: 'sweep',
		name: 'Sweep',
		tagline: 'Stay on schedule',
		description: 'Smart scheduling for chimney professionals.',
		icon: 'calendar',
		category: 'operations',
		lifecycle: 'active',
		marketingVisible: true,
		launcherVisible: true,
		requiresAuth: true,
		enabled: true,
		publicUrl: 'https://sweep.kaivalo.com',
		appUrl: 'https://sweep.kaivalo.com'
	}),
	Object.freeze({
		id: 'podstudio',
		name: 'PodStudio',
		tagline: 'Podcast management',
		description:
			'Equipment tracking and session scheduling for podcast studios.',
		icon: 'mic',
		category: 'media',
		lifecycle: 'planned',
		marketingVisible: true,
		launcherVisible: true,
		requiresAuth: true,
		enabled: false,
		publicUrl: 'https://podcast.kaivalo.com',
		appUrl: 'https://podcast.kaivalo.com'
	})
];

export function getMarketingServices(): ServiceRegistryEntry[] {
	return SERVICE_REGISTRY.filter(
		(service) => service.marketingVisible && service.lifecycle !== 'retired'
	).map(cloneService);
}

export function getLauncherServices(): {
	activeServices: ServiceRegistryEntry[];
	plannedServices: ServiceRegistryEntry[];
} {
	const visibleServices = SERVICE_REGISTRY.filter(
		(service) =>
			service.launcherVisible &&
			service.lifecycle !== 'disabled' &&
			service.lifecycle !== 'retired'
	);

	return {
		activeServices: visibleServices
			.filter((service) => service.lifecycle === 'active' && service.enabled)
			.map(cloneService),
		plannedServices: visibleServices
			.filter((service) => service.lifecycle === 'planned')
			.map(cloneService)
	};
}
