<script lang="ts">
	import type { CardElementProps } from './props.ts';

	let {
		variant = 'default',
		href = '',
		header = '',
		hover = true,
		allowExternal = false,
		allowedExternalHosts = [],
		class: className = '',
		children,
		...restProps
	}: CardElementProps = $props();

	function normalizeHost(value: string) {
		return value.trim().toLowerCase();
	}

	const DEFAULT_PORTS: Record<'http:' | 'https:', string> = {
		'http:': '80',
		'https:': '443'
	};
	const INTERNAL_URL_BASE = new URL('https://internal.kaivalo.local');
	const ENCODED_CONTROL_OR_SEPARATOR_PATTERN =
		/%(?:0[0-9a-f]|1[0-9a-f]|7f|2f|5c)/i;

	function hasControlCharacter(value: string) {
		for (const char of value) {
			const code = char.charCodeAt(0);
			if ((code >= 0 && code <= 31) || code === 127) {
				return true;
			}
		}

		return false;
	}

	function hasDisallowedPort(parsedUrl: URL) {
		if (!parsedUrl.port) {
			return false;
		}

		return (
			DEFAULT_PORTS[parsedUrl.protocol as keyof typeof DEFAULT_PORTS] !==
			parsedUrl.port
		);
	}

	function isUnsafeRawHref(value: string) {
		return (
			value !== value.trim() ||
			value.includes('\\') ||
			hasControlCharacter(value)
		);
	}

	function normalizeRelativeHref(value: string) {
		if (ENCODED_CONTROL_OR_SEPARATOR_PATTERN.test(value)) {
			return '';
		}

		let parsed;
		try {
			parsed = new URL(value, INTERNAL_URL_BASE);
		} catch {
			return '';
		}

		if (parsed.origin !== INTERNAL_URL_BASE.origin) {
			return '';
		}

		if (value.startsWith('#')) {
			return value === '#' ? '#' : parsed.hash;
		}

		return `${parsed.pathname}${parsed.search}${parsed.hash}`;
	}

	let normalizedAllowedExternalHosts = $derived.by(() => {
		const hosts = new Set();
		for (const host of allowedExternalHosts) {
			const normalized = normalizeHost(host);
			if (normalized) {
				hosts.add(normalized);
			}
		}
		return hosts;
	});

	function resolveSafeHref(value: string) {
		if (!value) {
			return '';
		}

		if (isUnsafeRawHref(value)) {
			return '';
		}

		if (/^(\/|#)/.test(value)) {
			return normalizeRelativeHref(value);
		}

		if (!allowExternal) {
			return '';
		}

		let parsed;
		try {
			parsed = new URL(value);
		} catch {
			return '';
		}

		if (parsed.protocol !== 'https:') {
			return '';
		}
		if (parsed.username || parsed.password) {
			return '';
		}
		if (hasDisallowedPort(parsed)) {
			return '';
		}

		return normalizedAllowedExternalHosts.has(normalizeHost(parsed.hostname))
			? parsed.toString()
			: '';
	}

	function isExternalHref(value: string) {
		return value.startsWith('https://');
	}

	function getHardenedExternalRel(
		href: string,
		target: unknown,
		rel: unknown
	): string | undefined {
		if (target !== '_blank' || !isExternalHref(href)) {
			return typeof rel === 'string' ? rel : undefined;
		}

		const tokens =
			typeof rel === 'string' ? rel.split(/\s+/).filter(Boolean) : [];
		const seenTokens = new Set(tokens.map((token) => token.toLowerCase()));

		for (const requiredToken of ['noopener', 'noreferrer']) {
			if (!seenTokens.has(requiredToken)) {
				tokens.push(requiredToken);
			}
		}

		return tokens.join(' ');
	}

	let safeHref = $derived(resolveSafeHref(href));
	let isActiveLink = $derived(variant === 'link' && safeHref !== '');
	let isDisabledLink = $derived(variant === 'link' && safeHref === '');
	let safeRel = $derived(
		getHardenedExternalRel(safeHref, restProps.target, restProps.rel)
	);
	let rootClass = $derived(
		[
			'card',
			hover && !isDisabledLink ? 'card-hover' : '',
			isDisabledLink ? 'card-disabled' : '',
			className
		]
			.filter(Boolean)
			.join(' ')
	);
</script>

{#if isActiveLink}
	<a
		{...restProps}
		href={safeHref}
		rel={safeRel}
		class={rootClass}
		data-ui="card"
		data-card-state="link"
	>
		{#if header}
			<div class="card-header">{header}</div>
		{/if}
		<div class="card-body">
			{@render children?.()}
		</div>
	</a>
{:else if isDisabledLink}
	<a
		{...restProps}
		aria-disabled="true"
		class={rootClass}
		data-ui="card"
		data-card-state="disabled"
		tabindex="-1"
	>
		{#if header}
			<div class="card-header">{header}</div>
		{/if}
		<div class="card-body">
			{@render children?.()}
		</div>
	</a>
{:else}
	<div
		{...restProps}
		class={rootClass}
		data-ui="card"
		data-card-state="default"
	>
		{#if header}
			<div class="card-header">{header}</div>
		{/if}
		<div class="card-body">
			{@render children?.()}
		</div>
	</div>
{/if}

<style>
	.card {
		background: var(--bg-card);
		border-radius: 0.75rem;
		border: 1px solid var(--border);
		overflow: hidden;
		display: block;
		text-decoration: none;
		color: inherit;
	}

	.card-hover {
		transition:
			border-color 0.3s ease,
			box-shadow 0.3s ease;
	}
	.card-hover:hover {
		border-color: var(--border-hover);
		box-shadow:
			0 0 40px var(--accent-glow),
			0 8px 32px rgba(0, 0, 0, 0.4);
	}

	.card-disabled {
		cursor: not-allowed;
		opacity: 0.72;
		pointer-events: none;
	}

	.card-header {
		padding: 1rem 1.5rem;
		border-bottom: 1px solid var(--border);
		font-weight: 600;
		color: var(--text-primary);
	}

	.card-body {
		padding: 1.5rem;
	}
</style>
