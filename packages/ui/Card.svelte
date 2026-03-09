<script>
	/** @type {import('./props.ts').CardProps} */
	let {
		variant = 'default',
		href = '',
		header = '',
		hover = true,
		allowExternal = false,
		allowedExternalHosts = [],
		class: className = '',
		children
	} = $props();

	/** @param {string} value */
	function normalizeHost(value) {
		return value.trim().toLowerCase();
	}

	/** @type {Record<string, string>} */
	const DEFAULT_PORTS = {
		'http:': '80',
		'https:': '443'
	};
	const INTERNAL_URL_BASE = new URL('https://internal.kaivalo.local');
	const ENCODED_CONTROL_OR_SEPARATOR_PATTERN =
		/%(?:0[0-9a-f]|1[0-9a-f]|7f|2f|5c)/i;

	/** @param {string} value */
	function hasControlCharacter(value) {
		for (const char of value) {
			const code = char.charCodeAt(0);
			if ((code >= 0 && code <= 31) || code === 127) {
				return true;
			}
		}

		return false;
	}

	/** @param {URL} parsedUrl */
	function hasDisallowedPort(parsedUrl) {
		if (!parsedUrl.port) {
			return false;
		}

		return DEFAULT_PORTS[parsedUrl.protocol] !== parsedUrl.port;
	}

	/** @param {string} value */
	function isUnsafeRawHref(value) {
		return (
			value !== value.trim() ||
			value.includes('\\') ||
			hasControlCharacter(value)
		);
	}

	/** @param {string} value */
	function normalizeRelativeHref(value) {
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
			return parsed.hash;
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

	/** @param {string} value */
	function resolveSafeHref(value) {
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

	let safeHref = $derived(resolveSafeHref(href));
	let isLink = $derived(variant === 'link' && safeHref);
</script>

{#if isLink}
	<a
		href={safeHref}
		class="card {hover ? 'card-hover' : ''} {className}"
		data-ui="card"
	>
		{#if header}
			<div class="card-header">{header}</div>
		{/if}
		<div class="card-body">
			{@render children?.()}
		</div>
	</a>
{:else}
	<div class="card {hover ? 'card-hover' : ''} {className}" data-ui="card">
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
