import assert from 'node:assert/strict';

type DockerCopyInstruction = {
	stage: string | null;
	flags: Record<string, string>;
	sources: string[];
	destination: string;
};

export const REQUIRED_DOCKER_BUILD_ROOT_SCRIPT_PATHS = [
	'scripts/check-node-version.ts',
	'scripts/is-executed-directly.ts'
] as const;

function normalizeDockerInstruction(line: string): string {
	return line
		.trim()
		.replace(/\\\s*$/, '')
		.trim();
}

function getDockerInstructions(dockerfile: string): string[] {
	const instructions: string[] = [];
	let currentInstruction = '';

	for (const rawLine of dockerfile.split('\n')) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) {
			continue;
		}

		currentInstruction = currentInstruction
			? `${currentInstruction} ${normalizeDockerInstruction(line)}`
			: normalizeDockerInstruction(line);

		if (rawLine.trimEnd().endsWith('\\')) {
			continue;
		}

		instructions.push(currentInstruction);
		currentInstruction = '';
	}

	if (currentInstruction) {
		instructions.push(currentInstruction);
	}

	return instructions;
}

function unquoteDockerToken(token: string): string {
	const firstCharacter = token[0];
	const lastCharacter = token.at(-1);
	if (
		(firstCharacter === '"' && lastCharacter === '"') ||
		(firstCharacter === "'" && lastCharacter === "'")
	) {
		return token.slice(1, -1);
	}

	return token;
}

function tokenizeDockerArguments(argumentList: string): string[] {
	const tokens = argumentList.match(/"[^"]*"|'[^']*'|[^\s]+/g) ?? [];
	assert.ok(tokens.length > 0, 'COPY instructions should include arguments');
	return tokens.map(unquoteDockerToken);
}

function parseDockerCopyInstruction(instruction: string) {
	const copyMatch = instruction.match(/^COPY\s+(.+)$/i);
	if (!copyMatch) {
		return null;
	}

	let remaining = copyMatch[1].trim();
	const flags: Record<string, string> = {};

	while (remaining.startsWith('--')) {
		const [rawFlag, ...rest] = tokenizeDockerArguments(remaining);
		assert.ok(rawFlag, 'COPY options should contain a flag token');
		assert.ok(rawFlag.startsWith('--'), 'COPY options should start with --');

		const optionTokenLength = remaining.indexOf(rawFlag) + rawFlag.length;
		remaining = remaining.slice(optionTokenLength).trimStart();

		const [flagName, flagValue = ''] = rawFlag.slice(2).split('=');
		flags[flagName] = flagValue;
		assert.ok(
			rest.length > 0 || remaining.length > 0,
			'COPY options should be followed by arguments'
		);
	}

	const args = remaining.startsWith('[')
		? (() => {
				const parsed = JSON.parse(remaining) as unknown;
				assert.ok(
					Array.isArray(parsed),
					'JSON-form COPY arguments should be an array'
				);
				assert.ok(
					parsed.every((value) => typeof value === 'string'),
					'JSON-form COPY arguments should contain only strings'
				);
				return parsed;
			})()
		: tokenizeDockerArguments(remaining);
	const destination = args.at(-1);
	const sources = args.slice(0, -1);

	assert.ok(destination, 'COPY instructions should include a destination');
	assert.ok(
		sources.length > 0,
		'COPY instructions should include at least one source'
	);

	return {
		flags,
		sources,
		destination
	};
}

export function getDockerCopyInstructions(
	dockerfile: string
): DockerCopyInstruction[] {
	const instructions: DockerCopyInstruction[] = [];
	let currentStage: string | null = null;

	for (const instruction of getDockerInstructions(dockerfile)) {
		const fromMatch = instruction.match(
			/^FROM\b.+(?:\bAS\s+([a-z0-9_-]+))\s*$/i
		);
		if (fromMatch) {
			currentStage = fromMatch[1]?.toLowerCase() ?? null;
			continue;
		}

		const parsedCopyInstruction = parseDockerCopyInstruction(instruction);
		if (!parsedCopyInstruction) {
			continue;
		}

		instructions.push({
			stage: currentStage,
			flags: parsedCopyInstruction.flags,
			sources: parsedCopyInstruction.sources,
			destination: parsedCopyInstruction.destination
		});
	}

	return instructions;
}

export function getLocalBuildContextCopySources(dockerfile: string): string[] {
	return Array.from(
		new Set(
			getDockerCopyInstructions(dockerfile)
				.filter(({ flags }) => !flags.from)
				.flatMap(({ sources }) => sources)
		)
	);
}
