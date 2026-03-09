export type ServiceIconKey = 'calendar' | 'mic';

export type ServiceLifecycle = 'planned' | 'active' | 'disabled' | 'retired';

export type ServiceRegistryEntry = {
	id: string;
	name: string;
	tagline: string;
	description: string;
	icon: ServiceIconKey;
	lifecycle: ServiceLifecycle;
	marketingVisible: boolean;
	launcherVisible: boolean;
	enabled: boolean;
	appUrl: string;
};

const TRUSTED_SERVICE_APP_HOST_SUFFIX = '.kaivalo.com';

function cloneService(
	service: Readonly<ServiceRegistryEntry>
): ServiceRegistryEntry {
	return { ...service };
}

function isTrustedServiceAppHostname(hostname: string): boolean {
	return hostname.toLowerCase().endsWith(TRUSTED_SERVICE_APP_HOST_SUFFIX);
}

function assertValidServiceAppUrl(
	service: Readonly<ServiceRegistryEntry>
): void {
	let parsed: URL;
	try {
		parsed = new URL(service.appUrl);
	} catch {
		throw new Error(`Service "${service.id}" must use a valid absolute appUrl`);
	}

	if (
		parsed.protocol !== 'https:' ||
		parsed.username ||
		parsed.password ||
		parsed.port ||
		parsed.search ||
		parsed.hash ||
		!isTrustedServiceAppHostname(parsed.hostname)
	) {
		throw new Error(
			`Service "${service.id}" must use an https appUrl on a trusted Kaivalo host`
		);
	}
}

const SERVICE_REGISTRY: ReadonlyArray<Readonly<ServiceRegistryEntry>> = [
	Object.freeze({
		id: 'sweep',
		name: 'Sweep',
		tagline: 'Stay on schedule',
		description: 'Smart scheduling for chimney professionals.',
		icon: 'calendar',
		lifecycle: 'active',
		marketingVisible: true,
		launcherVisible: true,
		enabled: true,
		appUrl: 'https://sweep.kaivalo.com'
	}),
	Object.freeze({
		id: 'podstudio',
		name: 'PodStudio',
		tagline: 'Podcast management',
		description:
			'Equipment tracking and session scheduling for podcast studios.',
		icon: 'mic',
		lifecycle: 'planned',
		marketingVisible: true,
		launcherVisible: true,
		enabled: false,
		appUrl: 'https://podcast.kaivalo.com'
	})
];

for (const service of SERVICE_REGISTRY) {
	assertValidServiceAppUrl(service);
}

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
