# PRD: Design Polish — kaivalo.com Hub

## Context
Landing page at `src/routes/+page.svelte`. Issues: desktop dead space between hero and services, meta tag inconsistency, spacing too generous on larger screens.

## Tasks

### 1. Fix meta tag contradiction
- [x] In `src/routes/+page.ts`, change description from "No accounts, no tracking — just open it and use it." to "Simple tools for complicated problems. One account, every tool — sign up once and go."

### 2. Tighten hero vertical spacing
- [x] Hero section: reduce `md:min-h-[50vh]` to `md:min-h-[40vh]` or remove min-height entirely — let content determine height
- [x] Reduce bottom padding: `pb-8 sm:pb-12` → `pb-6 sm:pb-8`
- [x] Keep top padding as-is (needs breathing room from top of page)

### 3. Tighten services section spacing
- [x] Reduce top padding: `py-10 sm:py-16` → `py-8 sm:py-12`
- [x] Reduce section header margin: `mb-10 sm:mb-16` → `mb-8 sm:mb-10`

### 4. Tighten about section spacing
- [x] Reduce padding: `py-10 sm:py-16` → `py-8 sm:py-12`

### 5. Verify build
- [ ] Run `npm run build` from `apps/hub/` — must succeed with zero errors

## Constraints
- SvelteKit + Svelte 5 runes
- Don't change colors, fonts, or design language — just spacing
- Don't touch anything outside `apps/hub/src/`
- Don't add dependencies
