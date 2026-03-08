import { describe, expect, it } from 'vitest';
import { Badge, Button, Card, Container } from '@kaivalo/ui';
import SourceBadge from '../../../packages/ui/Badge.svelte';
import SourceButton from '../../../packages/ui/Button.svelte';
import SourceCard from '../../../packages/ui/Card.svelte';
import SourceContainer from '../../../packages/ui/Container.svelte';

describe('ui public api exports', () => {
	it('re-exports the shipped UI components', () => {
		expect(Button).toBe(SourceButton);
		expect(Badge).toBe(SourceBadge);
		expect(Card).toBe(SourceCard);
		expect(Container).toBe(SourceContainer);
	});
});
