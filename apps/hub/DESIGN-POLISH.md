# kaivalo.com Design Polish — Notes

## Issues Found (2026-02-16)

### 1. Meta tags are wrong
`+page.ts` says "No accounts, no tracking" — we're adding WorkOS auth. Update to:
- description: "Simple tools for complicated problems. One account, every tool."
- Remove "no accounts" language

### 2. Services section is all "coming soon"
Both cards show at 0.6 opacity as "Soon". This makes the whole section feel dead.
- **Sweep** should be listed as a service (it's built!)
- "Auto Repair Decoder" (mechanic-ai) — is this still a thing? It was archived on kanban.
- Need at least ONE live service card to make the page feel real

### 3. Dead space between hero and services
- Hero has `pb-8 sm:pb-12` and services has `py-10 sm:py-16`
- Combined that's 18-28 units of padding. Tighten it.
- Consider: reduce hero bottom padding, or add content in between (email waitlist?)

### 4. About section references "Kai Valo" not Aural/Dominic
- The site is presented as Kai's (the AI) but Aural is the actual creator
- Decision needed: is kaivalo.com Kai's brand or Dominic's?
- Current: "I build tools that cut through complexity" — who is "I"?

### 5. No actual CTA
- "See what's live" links to #services which has nothing live
- Need: email signup, waitlist, or at minimum a live tool link

### 6. Missing og-image
- References `https://kaivalo.com/og-image.png` which doesn't exist yet
- Need to create or remove

## Recommendations
1. Add Sweep as a live service card
2. Fix meta tags (remove "no accounts")
3. Tighten hero→services spacing
4. Add email waitlist or at least a "coming soon, follow along" CTA
5. Decide on brand identity (Kai vs Dominic)
6. Create or stub og-image
