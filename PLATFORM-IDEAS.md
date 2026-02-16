# Kaivalo Platform — Architecture Ideas

*Not a PRD. Just thinking out loud.*

---

## The Vision

Kaivalo = a suite of niche B2B tools under one brand, one login, pay-per-tool. A chimney sweep signs up for scheduling, maybe later adds invoice explainer or booking page builder. One account, multiple subscriptions.

---

## Auth Layer — WorkOS

- Single sign-on across all kaivalo tools
- WorkOS handles identity: email/password, Google OAuth, magic links
- User logs in once → has access to their subscribed tools, gets "upgrade" prompts on the rest
- Shared user profile across tools (company name, contact info, etc.)

---

## Billing & Entitlements — Autumn (useautumn.com)

Aural found this. It's perfect:
- **Open-source** (github.com/useautumn/autumn)
- Sits between Stripe and the app
- 3 functions to integrate: check entitlement, track usage, manage subscriptions
- Handles: feature permissions, subscription states, usage limits, credits, add-ons
- We define products/tiers in Autumn dashboard, it manages Stripe underneath
- **Per-tool billing:** each kaivalo tool = a separate Autumn "product" with its own tiers

### Why Autumn over raw Stripe:
- Raw Stripe billing code is brutal (checkout sessions, subscription updates, proration, invoice creation, schedule management — their own homepage shows this complexity)
- Autumn abstracts all of that into `check()` / `track()` / `attach()`
- We don't build subscription middleware — Autumn IS the middleware

### How it'd work:
1. User hits a tool route (e.g., /sweep/dashboard)
2. App calls Autumn: `check(customerId, "sweep-pro")` 
3. Autumn returns entitled/not-entitled
4. If not entitled → show pricing/upgrade page
5. If entitled → load the tool
6. For usage-based features (SMS reminders): `track(customerId, "sms-sent")`

---

## Data Layer — Convex

- Shared Convex project for all tools (or separate projects per tool — TBD)
- User record stores: WorkOS user ID, Autumn customer ID, profile info
- Each tool has its own tables (chimney has customers, appointments, etc.)
- Convex real-time subscriptions = live dashboard updates without polling

### Shared vs Separate Convex projects:
- **Shared (leaning this way):** One database, tools can reference shared user data, simpler auth flow, one deployment
- **Separate:** Better isolation, independent scaling, but more complex auth handoff

---

## Routing

Two options:

### Option A: Subdomain per tool
- `kaivalo.com` — hub/landing
- `sweep.kaivalo.com` — chimney scheduler
- `mechai.kaivalo.com` — mechanic AI (already set up)
- Pro: clean separation, each app is independent SvelteKit instance
- Con: CORS for shared auth, more nginx config, SSL per subdomain (or wildcard cert)

### Option B: Path-based routing
- `kaivalo.com` — hub
- `kaivalo.com/sweep` — chimney scheduler  
- `kaivalo.com/mechai` — mechanic AI
- Pro: single domain, simpler auth (same origin), one SSL cert
- Con: monolith feel, harder to deploy independently

**Leaning toward subdomains** — cleaner, each tool can be its own SvelteKit app with independent deploys. Wildcard SSL cert solves the certificate issue.

---

## The Kaivalo Flywheel

1. User finds ONE tool that solves their problem (chimney scheduling)
2. Signs up, uses it, loves it
3. Sees other tools in the dashboard sidebar / hub page
4. Tries another one (maybe invoice explainer, booking page)
5. Now paying $29 + $19 + $9 = $57/mo instead of $29
6. Switching cost increases with each tool (all their data is here)
7. LTV compounds without forcing expensive bundles

---

## First Tool: Chimney Sweep Scheduler

(Full scope in `chimney-saas-scope.md`)

MVP features:
- Weather-aware calendar (Open-Meteo API, free)
- Customer database (chimney type, last service, contact)
- Auto annual reminders via SMS/email (Twilio) — the killer sticky feature
- Simple invoicing (Stripe via Autumn)
- Mobile-first (techs are on rooftops, not desks)

Pricing: Free (20 customers) → $29/mo Pro → $49/mo Team

---

## Repo Strategy

**Each tool = its own repo.** Kaivalo repo is platform only.

- `pets/kaivalo/` — hub, platform config, shared UI packages
- `pets/kaivalo-sweep/` — chimney scheduler
- `pets/mechanic-ai/` — mechanic AI (already exists)
- Future: `pets/kaivalo-<toolname>/`

Why: if a tool doesn't work out, delete the repo. Kaivalo stays clean. No surgery to remove a failed experiment from a monorepo.

Shared code (UI components, auth helpers, Autumn client wrapper) lives in `kaivalo/packages/` and gets consumed as npm workspace links during dev or published packages later.

---

## Open Questions

1. **Self-host Autumn or use their cloud?** Open-source means we could self-host, but their cloud is probably free/cheap for early stage
2. **Shared Convex project or per-tool?** Leaning shared but need to think about isolation
3. **Domain:** kaivalo.com still not registered — blocker for go-live
4. **WorkOS pricing:** Free tier covers how many users? Need to check
5. **Tool discovery:** How do users find other tools? Sidebar nav? Hub dashboard? Email cross-sell?
