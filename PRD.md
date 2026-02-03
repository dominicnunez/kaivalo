# Kaivalo.com - Full Implementation PRD

Build the kaivalo.com services hub and connect MechanicAI. This PRD is designed for Ralph to execute end-to-end.

## Context

**What exists:**
- `/home/kai/pets/mechanic-ai/` — Working SvelteKit app (built, ready to deploy)
- `/home/kai/pets/kaivalo/PLAN.md` — Architecture decisions documented

**What we're building:**
1. Hub landing page at kaivalo.com
2. Monorepo structure with shared packages
3. Infrastructure (nginx, PM2, SSL)

**Blocker:** Domain registration (kaivalo.com) — Aural is handling this. Build everything else first.

---

## Phase 1: Monorepo Setup

### 1.1 Initialize workspace structure

Create the monorepo structure in `/home/kai/pets/kaivalo/`:

```
/home/kai/pets/kaivalo/
├── apps/
│   ├── hub/                 # Main kaivalo.com landing page (NEW)
│   └── mechai/              # Symlink to mechanic-ai
├── packages/
│   ├── ui/                  # Shared Tailwind components
│   └── config/              # Shared configs
├── package.json             # Workspace root
├── pnpm-workspace.yaml
├── .gitignore
├── PLAN.md
└── PRD.md
```

### Tasks

- [x] Create `/home/kai/pets/kaivalo/package.json` with npm workspaces config pointing to `apps/*` and `packages/*`
- [x] Create `/home/kai/pets/kaivalo/pnpm-workspace.yaml` with packages: `apps/*`, `packages/*`
- [x] Create `/home/kai/pets/kaivalo/.gitignore` with node_modules, .env, build, .svelte-kit
- [x] Create `/home/kai/pets/kaivalo/apps/` directory
- [x] Create `/home/kai/pets/kaivalo/packages/` directory
- [x] Create symlink: `ln -s /home/kai/pets/mechanic-ai /home/kai/pets/kaivalo/apps/mechai`
- [x] Initialize git repo: `cd /home/kai/pets/kaivalo && git init`

---

## Phase 2: Shared Packages

### 2.1 UI Package

Create `/home/kai/pets/kaivalo/packages/ui/` with reusable Svelte components.

### Tasks

- [x] Create `packages/ui/package.json` with name `@kaivalo/ui`, type module, svelte + tailwind peer deps
- [x] Create `packages/ui/index.js` exporting all components
- [x] Create `packages/ui/Button.svelte` — primary/secondary/ghost variants, size prop (sm/md/lg), disabled state
- [x] Create `packages/ui/Card.svelte` — container with optional header, hover effect, link variant
- [x] Create `packages/ui/Badge.svelte` — status badges (Live/Beta/Coming Soon) with color variants
- [x] Create `packages/ui/Container.svelte` — max-width wrapper with responsive padding

### 2.2 Config Package

Create `/home/kai/pets/kaivalo/packages/config/` with shared Tailwind preset.

### Tasks

- [x] Create `packages/config/package.json` with name `@kaivalo/config`
- [x] Create `packages/config/tailwind.preset.js` with:
  - Brand colors: primary (blue-600), accent (emerald-500), neutral grays
  - Font family: Inter (with system fallbacks)
  - Custom spacing/sizing if needed
  - Animation utilities for subtle hover effects

---

## Phase 3: Hub Application

### 3.1 Scaffold Hub

Create the main landing page application at `/home/kai/pets/kaivalo/apps/hub/`.

### Tasks

- [x] Initialize SvelteKit project: `cd /home/kai/pets/kaivalo/apps && npm create svelte@latest hub` (skeleton, TypeScript, no extras)
- [x] Install dependencies: `cd hub && npm install`
- [x] Install Tailwind: `npm install -D tailwindcss postcss autoprefixer && npx tailwindcss init -p`
- [x] Install shared packages: `npm install @kaivalo/ui @kaivalo/config` (workspace link)
- [x] Install icons: `npm install lucide-svelte`
- [x] Configure `tailwind.config.js` to extend `@kaivalo/config/tailwind.preset.js`
- [x] Add adapter-node: `npm install -D @sveltejs/adapter-node` and update `svelte.config.js`
- [x] Create `apps/hub/.env.example` (empty for now, no secrets needed)

### 3.2 Build Landing Page

#### Layout & Styles

- [x] Create `src/app.css` with Tailwind directives, Inter font import, base styles
- [x] Create `src/routes/+layout.svelte` importing app.css, with minimal shell (no nav needed for MVP)

#### Hero Section (`src/routes/+page.svelte`)

- [x] Hero with gradient background (subtle blue to white)
- [x] Headline: "AI Tools That Actually Help"
- [x] Subheadline: "Practical tools built by Kai Valo. No hype, just utility."
- [x] Smooth scroll CTA button to services section

#### Services Grid

- [x] Section with id="services" for scroll target
- [x] Grid layout: 1 col mobile, 2 col tablet, 3 col desktop
- [x] ServiceCard component or inline cards with:
  - Icon (from lucide-svelte)
  - Title
  - Description (1-2 sentences)
  - Status badge (Live/Coming Soon)
  - Link to subdomain (external)

**Services to display:**

| Service | Icon | Status | Link | Description |
|---------|------|--------|------|-------------|
| MechanicAI | Wrench | Live | mechai.kaivalo.com | Turn repair jargon into plain English. Know what you're paying for. |
| (Placeholder) | Sparkles | Coming Soon | # | More tools on the way. |

#### About Section

- [x] Brief section below services
- [x] "Built by Kai Valo" with short personality-forward copy
- [x] Optional: small avatar/illustration placeholder

#### Footer

- [x] Simple footer with:
  - "© 2026 Kai Valo"
  - GitHub link (if repo is public)
  - Contact link (mailto:kaievalo@proton.me or feedback form later)

### 3.3 SEO & Meta

- [x] Create `src/routes/+layout.server.ts` or `+page.ts` with meta tags
- [ ] Add to `<svelte:head>`:
  - Title: "Kai Valo | AI Tools That Actually Help"
  - Description meta tag
  - OG tags (title, description, image placeholder, url)
  - Twitter card meta
- [ ] Create `static/favicon.ico` placeholder (can be simple K logo)
- [ ] Create `static/og-image.png` placeholder (1200x630, can be simple branded image)

### 3.4 Build & Test

- [ ] Run `npm run build` and verify no errors
- [ ] Test with `npm run preview`
- [ ] Verify responsive design (mobile, tablet, desktop)
- [ ] Create `apps/hub/ecosystem.config.cjs` for PM2:
  ```js
  module.exports = {
    apps: [{
      name: 'kaivalo-hub',
      script: 'build/index.js',
      env: { PORT: 3100, NODE_ENV: 'production' }
    }]
  };
  ```

---

## Phase 4: MechanicAI Integration

### Tasks

- [ ] Update `/home/kai/pets/mechanic-ai/ecosystem.config.cjs` to use port 3101:
  ```js
  module.exports = {
    apps: [{
      name: 'mechai',
      script: 'build/index.js',
      env: { PORT: 3101, NODE_ENV: 'production' }
    }]
  };
  ```
- [ ] Verify MechanicAI builds: `cd /home/kai/pets/mechanic-ai && npm run build`
- [ ] Test locally: `node build/index.js` (should serve on 3101)

---

## Phase 5: Infrastructure

### 5.1 nginx Configuration

Create nginx config for kaivalo.com with subdomain routing.

**File:** `/etc/nginx/sites-available/kaivalo.com`

### Tasks

- [ ] Create nginx config file with:
  - Main server block for kaivalo.com + www.kaivalo.com → proxy to 127.0.0.1:3100
  - Server block for mechai.kaivalo.com → proxy to 127.0.0.1:3101
  - Catch-all for *.kaivalo.com → redirect to kaivalo.com
  - SSL placeholders (will be filled after certbot)
  - Standard proxy headers (Host, X-Real-IP, X-Forwarded-For, X-Forwarded-Proto)
  - HTTP to HTTPS redirect block

- [ ] Create symlink: `ln -s /etc/nginx/sites-available/kaivalo.com /etc/nginx/sites-enabled/`
- [ ] Test config: `nginx -t`

**Note:** SSL certs will be added after domain is registered and DNS is pointed.

### 5.2 PM2 Setup

- [ ] Start hub: `cd /home/kai/pets/kaivalo/apps/hub && pm2 start ecosystem.config.cjs`
- [ ] Start mechai: `cd /home/kai/pets/mechanic-ai && pm2 start ecosystem.config.cjs`
- [ ] Save PM2 config: `pm2 save`
- [ ] Verify both running: `pm2 status`

### 5.3 SSL (After Domain Registration)

Once Aural registers kaivalo.com and points DNS:

- [ ] Install certbot cloudflare plugin if using Cloudflare: `apt install python3-certbot-dns-cloudflare`
- [ ] Or use HTTP challenge: `certbot --nginx -d kaivalo.com -d www.kaivalo.com -d mechai.kaivalo.com`
- [ ] For wildcard (requires DNS challenge): `certbot certonly --dns-cloudflare -d kaivalo.com -d "*.kaivalo.com"`
- [ ] Update nginx config with cert paths
- [ ] Reload nginx: `systemctl reload nginx`
- [ ] Test HTTPS access

---

## Phase 6: Polish & Launch Prep

### Tasks

- [ ] Add proper favicon (simple K or tool icon)
- [ ] Create OG image (1200x630 branded graphic)
- [ ] Test all links work
- [ ] Mobile responsiveness check
- [ ] Lighthouse audit (aim for 90+ performance)
- [ ] Add to TOOLS.md project locations

---

## Port Allocation

| Service | Port | PM2 Name |
|---------|------|----------|
| Hub (kaivalo.com) | 3100 | kaivalo-hub |
| MechanicAI | 3101 | mechai |
| (future services) | 3102+ | — |

---

## Success Criteria

1. ✅ Hub landing page loads at localhost:3100
2. ✅ MechanicAI loads at localhost:3101
3. ✅ nginx config is valid and ready for domain
4. ✅ PM2 manages both services
5. ✅ Responsive design works on mobile/tablet/desktop
6. ✅ Services grid shows MechanicAI as "Live" with working link structure

---

## Blockers

| Item | Owner | Status |
|------|-------|--------|
| kaivalo.com domain registration | Aural | Pending |
| DNS configuration | Aural | After registration |
| SSL certificates | Kai | After DNS propagation |

---

## Notes for Ralph

- Use SvelteKit 2.x with Svelte 5 syntax (runes: $state, $derived, etc.)
- Use Tailwind CSS 4.x (new config format if applicable, or 3.x is fine)
- Keep it minimal — this is an MVP landing page, not a complex app
- Inter font via Google Fonts CDN is fine
- No auth, no database, no API routes needed for hub
- MechanicAI already works — just need port change and PM2 config
