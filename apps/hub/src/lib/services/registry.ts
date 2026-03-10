import { isValidHostname } from '../server/hostname.ts';

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

function hasExplicitUrlPort(value: string): boolean {
	const authority = value.split('://')[1]?.split(/[/?#]/, 1)[0];
	const hostWithOptionalCredentials = authority ?? '';
	const hostnamePortSegment =
		hostWithOptionalCredentials.split('@').at(-1) ?? '';

	return hostnamePortSegment.includes(':');
}

export function isTrustedServiceAppHostname(hostname: string): boolean {
	return (
		isValidHostname(hostname) &&
		hostname.toLowerCase().endsWith(TRUSTED_SERVICE_APP_HOST_SUFFIX)
	);
}

export function isTrustedServiceAppUrl(appUrl: string): boolean {
	try {
		const parsed = new URL(appUrl);

		return (
			parsed.protocol === 'https:' &&
			!parsed.username &&
			!parsed.password &&
			!hasExplicitUrlPort(appUrl) &&
			parsed.pathname === '/' &&
			!parsed.search &&
			!parsed.hash &&
			isTrustedServiceAppHostname(parsed.hostname)
		);
	} catch {
		return false;
	}
}

function assertValidServiceAppUrl(
	service: Readonly<ServiceRegistryEntry>
): void {
	try {
		new URL(service.appUrl);
	} catch {
		throw new Error(`Service "${service.id}" must use a valid absolute appUrl`);
	}

	if (!isTrustedServiceAppUrl(service.appUrl)) {
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
