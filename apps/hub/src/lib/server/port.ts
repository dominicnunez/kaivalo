export const DEFAULT_PORT = 3100;
export const MIN_PORT = 1;
export const MAX_PORT = 65_535;

export function parsePort(portValue: string | undefined): number {
	if (portValue === undefined || portValue.trim() === '') {
		return DEFAULT_PORT;
	}

	const normalized = portValue.trim();
	if (!/^\d+$/.test(normalized)) {
		throw new Error(
			`PORT must be an integer between ${MIN_PORT} and ${MAX_PORT}`
		);
	}

	const parsed = Number(normalized);
	if (!Number.isInteger(parsed) || parsed < MIN_PORT || parsed > MAX_PORT) {
		throw new Error(`PORT must be between ${MIN_PORT} and ${MAX_PORT}`);
	}

	return parsed;
}
