# Chimney Sweep SaaS — Product Scope

## Market Overview
- **~8,200 chimney sweep companies** in the US across 1,907 cities
- **$1.3-1.8B industry**, growing 4.5-5.5% CAGR
- 5 companies per 100K population — fragmented, mostly small operators
- **27.5% don't even have a website**, 6.9% unclaimed Google profiles
- Highly seasonal: peaks Sep-Nov (pre-heating season), dead in summer
- $15.65 average CPC — expensive to acquire customers via ads

## Current Software Landscape
What chimney companies actually use today (from Google Business Profile data):
- **Housecall Pro** (31.4%) — generic field service, $65-$199/mo
- **ServiceTitan** (28.6%) — enterprise field service, $300+/mo minimum
- **vcita** (25.7%) — generic small biz CRM, $29-$99/mo
- **Jobber** (2.9%) — generic field service, $49-$149/mo
- **Vev** — chimney-specific landing page but generic booking, $10-20/mo

**Key insight:** Nobody is chimney-*specific*. They all force chimney companies into generic field service tools that have features they don't need (HVAC workflows, plumbing parts tracking) and miss features they do need (weather scheduling, NFPA compliance, creosote level tracking).

## The Gap (What Ideabrowser Identified)
Weather-aware scheduling + crew dispatch + automated annual reminders. Specifically:
1. **Weather-aware scheduling** — Don't book inspections during rain/high wind. Auto-reschedule when weather changes. Chimney work is outdoor/rooftop.
2. **Crew dispatch** — Small teams (2-5 people), route optimization for daily jobs
3. **Automated annual reminders** — NFPA 211 says yearly inspection. Most customers forget. Auto-remind = recurring revenue for the sweep company.

## Our Angle: What We'd Build Different
**Price point:** $19-39/mo (undercut Housecall Pro at $65+, way under ServiceTitan)
**Target:** Solo operators and small teams (1-5 techs) — the 27.5% without websites, the ones using paper calendars and texts

### MVP Features (v1)
1. **Smart scheduling** — Calendar with weather overlay. Flags days with rain/wind/snow. Drag to reschedule.
2. **Customer database** — Name, address, chimney type (wood/gas/pellet), last service date, notes
3. **Annual reminder engine** — Auto-SMS/email customers when 11 months since last service. This is the killer feature — it generates repeat business on autopilot.
4. **Simple invoicing** — Generate invoice from completed job. Accept payment link (Stripe).
5. **Mobile-first** — These guys are on ladders, not desktops. Must work great on phone.

### v2 Features (post-validation)
- Route optimization for daily job list
- Weather-triggered auto-reschedule with customer notification
- CSIA certification tracking for techs
- Before/after photo documentation per job
- Customer-facing booking page (replace their need for a website)

## Revenue Model
- **Free tier:** Up to 20 customers, basic scheduling (gets them hooked)
- **Pro:** $29/mo — unlimited customers, annual reminders, invoicing
- **Team:** $49/mo — multi-tech, route optimization, booking page

**TAM math:** 8,200 companies × $29/mo avg = $2.85M ARR potential at full penetration. Realistic 5% capture = $142K ARR. Covers our costs many times over.

## Why We Can Build This
- SvelteKit + Tailwind + Convex = fast to ship
- Ralph can build the CRUD in a day
- Weather API is free (Open-Meteo)
- SMS reminders via Twilio (~$0.01/msg, pass cost to customer or absorb)
- Stripe for payments — standard integration
- No complex domain expertise needed — it's a scheduling app with weather data

## Risks
- **Sales/distribution** — Chimney sweeps aren't browsing Product Hunt. Need SEO ("chimney sweep software"), Google Ads, or CSIA/guild partnerships
- **Churn** — Seasonal business means some may cancel in summer
- **Generic competitors** — Housecall Pro works "good enough" for many

## Go-To-Market
1. Build MVP, dogfood with 3-5 local KC chimney companies (free)
2. SEO content: "chimney sweep scheduling software" (only 850 monthly searches for "chimney services" but very high intent)
3. List on CSIA (Chimney Safety Institute of America) resources
4. Chimney sweep Facebook groups and forums for organic awareness

## Decision Needed
- **Brand:** Under kaivalo.com or standalone domain?
- **Timeline:** MVP could be 1-2 weeks with Ralph
- **Priority vs other kaivalo tools**
