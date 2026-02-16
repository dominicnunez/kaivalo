# Chimney Maintenance Scheduler — Domain Research

## The Problem
Homeowners with fireplaces/wood stoves need annual chimney maintenance but:
- Most don't know NFPA 211 requires annual inspection
- They forget when they last had service done
- They don't know what "maintenance" actually means (inspection vs cleaning vs repair)
- They don't know what to look for between professional visits
- Chimney fires cause ~25,000 house fires/year in the US

## Market Gap
**Every existing chimney software is B2B** — built for chimney sweep companies:
- Field Promax, Kickserv, FieldServicely, ServiceFolder
- They handle dispatch, invoicing, route optimization, CRM
- $30-100+/mo SaaS pricing

**Zero consumer-facing tools exist.** No app helps a homeowner:
- Track when their chimney was last inspected
- Know what type of inspection they need
- Get seasonal reminders for maintenance tasks
- Understand what their chimney service report means
- Find and compare local chimney professionals

## Domain Knowledge

### NFPA 211 Inspection Levels
| Level | When Needed | What Happens | Cost |
|-------|-------------|-------------|------|
| **Level 1** | Annual (routine) | Visual check of accessible areas, creosote assessment, damper/cap check | $100-250 |
| **Level 2** | Home sale, fuel change, after chimney fire/storm, new liner | Everything in L1 + video camera scan of flue interior + attic/crawlspace check | $200-500 |
| **Level 3** | Suspected hidden hazard found in L1/L2 | Invasive — removing drywall/masonry to access concealed areas | $1,000-5,000+ |

### Seasonal Maintenance Cycle
**Fall (Sept-Oct)** — Pre-burning season
- Schedule annual inspection + cleaning (Level 1)
- Check chimney cap for damage/nesting
- Inspect flashing and crown for cracks
- Stock seasoned hardwood (oak, birch, beech — NOT softwood)
- Test smoke/CO detectors

**Winter (Nov-Mar)** — Active use
- Burn only dry, seasoned hardwood
- Clean ash when 1" deep
- Watch for smoke entering room (draft issues)
- Never burn treated/painted wood, cardboard, trash

**Spring (Apr-May)** — Post-winter checkup
- Clean flue to remove season's creosote
- Inspect exterior masonry for freeze/thaw damage
- Check for water intrusion signs
- Waterproof masonry if needed
- Close damper for off-season

**Summer (Jun-Aug)** — Off-season
- Cap should be on (prevent animal nesting, rain)
- Good time for repairs if issues found in spring
- Schedule fall inspection early (busy season)

### Key Homeowner Pain Points
1. **"When was the last time?"** — Can't remember if it was 1 or 3 years ago
2. **"Is this normal?"** — Don't know if creosote level, smoke behavior, or cracks are concerning
3. **"Who do I call?"** — Finding a CSIA-certified sweep vs random handyman
4. **"What should this cost?"** — No price transparency, easy to get overcharged
5. **"What did they find?"** — Service reports are technical jargon

## MVP Feature Set

### Must Have (v1)
- **Chimney profile** — fuel type (wood/gas/pellet), chimney type (masonry/prefab/metal), last inspection date, installation year
- **Smart reminders** — seasonal task notifications based on profile and location (climate zone affects timing)
- **Maintenance timeline** — visual history of inspections, cleanings, repairs with dates and notes
- **Inspection level guide** — interactive "which level do I need?" based on simple questions
- **Photo log** — snap photos during self-checks (cap, crown, flashing, firebox) to track condition over time

### Nice to Have (v2)
- **Service report decoder** — upload/photograph your inspection report, AI explains it in plain English
- **Local pro finder** — CSIA-certified sweep directory with reviews and pricing
- **Cost estimator** — "is this quote reasonable?" based on your area and service type
- **Multi-chimney support** — homes with multiple fireplaces
- **Sharing** — share maintenance history with home buyer/seller/insurance

### NOT in MVP
- Booking/scheduling with actual chimney companies (that's B2B territory)
- Payment processing
- IoT/smart home integration (chimney sensors exist but niche)

## Revenue Model Ideas
1. **Freemium** — free profile + reminders, paid for AI report decoder + photo log history
2. **Affiliate** — chimney supply products (caps, cleaners, moisture sealant) via Amazon
3. **Lead gen** — connect homeowners to local CSIA sweeps (referral fee)
4. **Premium tier** — $3-5/mo or $30/yr for full features

## Competitive Advantages
- **No competition in consumer space** — literally nobody is doing this
- **Trust through education** — teach homeowners what they need, they'll use the tool
- **Low maintenance cost** — no real-time data, no complex backend, mostly scheduling + content
- **Natural monetization** — people WILL pay for peace of mind about fire safety
- **kaivalo brand fit** — "information asymmetry is a solvable problem" — chimney maintenance is a perfect example

## Tech Considerations
- SvelteKit + Tailwind (matches kaivalo stack)
- WorkOS for auth (shared across kaivalo tools)
- Database: Convex or simple SQLite for MVP?
- Push notifications for reminders (needs service worker or email)
- Location-based climate data for smart scheduling (free weather APIs)
- Mobile-first — homeowners will use this on their phones

## Open Questions
- [ ] How many US homes have fireplaces? (market size)
- [ ] CSIA certification database — is there a public API?
- [ ] What climate zone data is freely available?
- [ ] Should we target a specific region first (KC metro) or go national?
- [ ] Name: "ChimneySafe"? "FlueKeeper"? Or just "Chimney" under kaivalo brand?
