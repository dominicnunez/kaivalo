# Kaivalo.com - Services Hub Plan

## Overview

Kaivalo.com is the landing page and services hub for Kai Valo's AI-powered tools. Each tool lives on its own subdomain (e.g., mechai.kaivalo.com), with the main domain serving as the directory and brand home.

---

## 1. Landing Page Content

### Hero Section
- **Headline:** "AI Tools That Actually Help"
- **Subheadline:** Brief intro to Kai Valo as an AI assistant building useful tools
- **CTA:** Jump to services grid

### Services Grid
Each service gets a card with:
- Icon/illustration
- Name + tagline
- Brief description (1-2 sentences)
- Status badge (Live / Coming Soon / Beta)
- Link to subdomain

**Initial services:**
| Service | Subdomain | Status | Description |
|---------|-----------|--------|-------------|
| MechanicAI | mechai.kaivalo.com | Live | Get repair estimates before visiting the shop |
| (placeholder) | ??? | Coming Soon | Reserved for future tools |

### About Section
- Who is Kai Valo? (AI assistant who builds tools)
- Philosophy: practical tools > flashy demos
- Keep it brief, personality-forward

### Footer
- Contact/feedback link (mailto or simple form)
- GitHub link (if open source)
- "Built with ❤️ by Kai Valo"

---

## 2. Codebase Structure: **Hybrid Approach**

### Recommendation: Monorepo for hub + shared packages, separate deploys

```
/home/kai/pets/kaivalo/
├── apps/
│   ├── hub/                 # Main kaivalo.com landing page
│   │   ├── src/
│   │   ├── package.json
│   │   └── svelte.config.js
│   └── mechai/              # MechanicAI (move or symlink)
│       └── ...
├── packages/
│   ├── ui/                  # Shared Tailwind components
│   │   ├── Button.svelte
│   │   ├── Card.svelte
│   │   └── package.json
│   └── config/              # Shared Tailwind/TS configs
│       ├── tailwind.preset.js
│       └── tsconfig.base.json
├── package.json             # Workspace root (npm workspaces)
├── pnpm-workspace.yaml      # If using pnpm
└── PLAN.md
```

### Why hybrid?
| Approach | Pros | Cons |
|----------|------|------|
| **Full monorepo** | Shared code, atomic changes | Heavy CI, coupled deploys |
| **Separate repos** | Isolation, simple per-project | Duplication, drift |
| **Hybrid (recommended)** | Share UI/config, independent deploys | Slightly more setup |

### Migration path
1. Keep mechanic-ai where it is for now
2. Build hub as new project in kaivalo/apps/hub
3. Extract shared UI components as we find duplication
4. Eventually move/symlink mechanic-ai into monorepo if it makes sense

---

## 3. Auth Strategy: **Independent (No Auth MVP)**

### MVP: No auth at all
- MechanicAI doesn't need accounts—it's a free tool
- Hub is just a landing page
- Avoid auth complexity until there's a real need

### Future (if needed):
- **Option A:** Shared auth via subdomain cookies (kaivalo.com sets cookie, *.kaivalo.com reads it)
- **Option B:** OAuth provider (Clerk, Auth.js, Supabase Auth)
- **Option C:** Each service manages its own auth

### Decision tree:
```
Need accounts? 
├─ No → Skip auth entirely (MVP)
└─ Yes → Is cross-service login valuable?
         ├─ Yes → Shared auth (subdomain cookies or OAuth)
         └─ No → Per-service auth
```

**Recommendation:** Skip for MVP. Revisit when a service needs user accounts.

---

## 4. Tech Stack

### Confirmed (matches MechanicAI):
- **Framework:** SvelteKit 2.x (Svelte 5)
- **Styling:** Tailwind CSS 4.x
- **Runtime:** Node.js via adapter-node
- **Process manager:** PM2

### Additions for hub:
- **Icons:** lucide-svelte or heroicons
- **Animations:** Tailwind + CSS (keep it light)
- **Fonts:** Inter or system fonts (fast loading)

### Infrastructure:
- **Hosting:** Same VPS (ubuntu-4gb-hel1-1)
- **Reverse proxy:** nginx with wildcard SSL
- **SSL:** Let's Encrypt wildcard cert (*.kaivalo.com + kaivalo.com)

---

## 5. MVP Scope for Hub

### Must have (v0.1):
- [ ] Landing page with hero + services grid
- [ ] MechanicAI card linking to mechai.kaivalo.com
- [ ] Responsive design (mobile-first)
- [ ] Basic SEO (meta tags, OG image)
- [ ] Deployed and live

### Nice to have (v0.2):
- [ ] About section with Kai Valo personality
- [ ] Contact form or feedback link
- [ ] Dark mode toggle
- [ ] Subtle animations

### Not in MVP:
- User accounts
- Service status API
- Usage analytics
- Blog/changelog

---

## 6. Subdomain Routing: **nginx (Recommended)**

### Why nginx over app-level?
| Approach | Pros | Cons |
|----------|------|------|
| **nginx routing** | Clean separation, independent scaling, standard pattern | Config per subdomain |
| **App-level (single SvelteKit)** | One deploy, shared session | Coupled, harder to scale |

### nginx config structure:

```nginx
# /etc/nginx/sites-available/kaivalo.com

# Main hub
server {
    listen 443 ssl http2;
    server_name kaivalo.com www.kaivalo.com;
    
    ssl_certificate /etc/letsencrypt/live/kaivalo.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kaivalo.com/privkey.pem;
    
    location / {
        proxy_pass http://127.0.0.1:3100;  # hub app
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# MechanicAI
server {
    listen 443 ssl http2;
    server_name mechai.kaivalo.com;
    
    ssl_certificate /etc/letsencrypt/live/kaivalo.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kaivalo.com/privkey.pem;
    
    location / {
        proxy_pass http://127.0.0.1:3101;  # mechai app
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# Catch-all for undefined subdomains (optional: 404 page or redirect)
server {
    listen 443 ssl http2 default_server;
    server_name *.kaivalo.com;
    
    ssl_certificate /etc/letsencrypt/live/kaivalo.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kaivalo.com/privkey.pem;
    
    return 302 https://kaivalo.com;
}
```

### SSL: Wildcard certificate
```bash
# Using certbot with DNS challenge (Cloudflare example)
certbot certonly --dns-cloudflare \
  --dns-cloudflare-credentials ~/.secrets/cloudflare.ini \
  -d kaivalo.com -d "*.kaivalo.com"
```

### Port allocation:
| Service | Port |
|---------|------|
| Hub | 3100 |
| MechanicAI | 3101 |
| (future) | 3102+ |

---

## 7. Implementation Roadmap

### Phase 1: Infrastructure (Day 1)
1. Register kaivalo.com domain (if not done)
2. Point DNS to VPS (A record + wildcard)
3. Set up wildcard SSL certificate
4. Configure nginx with initial routing

### Phase 2: Hub MVP (Days 2-3)
1. Create hub project in /home/kai/pets/kaivalo/apps/hub
2. Build landing page (hero + services grid)
3. Deploy via PM2
4. Test at kaivalo.com

### Phase 3: Connect MechanicAI (Day 3)
1. Configure mechai.kaivalo.com in nginx
2. Update MechanicAI to run on port 3101
3. Test subdomain routing

### Phase 4: Polish (Day 4+)
1. Add about section
2. SEO optimization
3. Performance tuning
4. Monitor and iterate

---

## 8. Open Questions

- [ ] **Domain:** Is kaivalo.com available? Alternatives?
- [ ] **DNS provider:** Cloudflare recommended for easy wildcard SSL
- [ ] **MechanicAI branding:** Keep current design or align with hub style?
- [ ] **Future services:** Any ideas for the next tool?

---

## Summary

**Architecture:** Monorepo-style structure, nginx subdomain routing, no auth for MVP.

**MVP deliverable:** Landing page at kaivalo.com with a service card linking to mechai.kaivalo.com.

**Tech:** SvelteKit + Tailwind (consistent with MechanicAI), nginx reverse proxy, PM2 process management.

**Timeline:** ~4 days to functional MVP.
