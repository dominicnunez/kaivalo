# Home Maintenance Scheduler — MVP PRD

## Overview
Generalized home maintenance scheduling tool with chimney sweeping as the first vertical. Weather-aware scheduling, customer database, automated annual reminders. Lives under kaivalo.com.

## Stack
- **Frontend:** SvelteKit + Tailwind + shadcn-svelte
- **Backend:** Convex
- **Weather:** Open-Meteo API (free, no key needed)
- **Auth:** Anonymous/demo for MVP (WorkOS integration comes later as separate card)

## Data Model

### serviceTypes
- `id`, `name` (e.g. "Chimney Inspection", "Gutter Cleaning", "HVAC Tune-Up")
- `category` (chimney | hvac | gutter | roof | general)
- `defaultIntervalMonths` (e.g. 12 for annual chimney inspection)
- `weatherSensitive` (boolean — outdoor work affected by weather)
- `estimatedDurationMin` (default job duration)

### customers
- `name`, `email`, `phone`, `address`, `city`, `state`, `zip`
- `latitude`, `longitude` (geocoded from address via Open-Meteo)
- `notes`
- `createdAt`

### jobs
- `customerId` (ref)
- `serviceTypeId` (ref)
- `scheduledDate`, `scheduledTime`
- `status` (scheduled | completed | cancelled | rescheduled)
- `notes`
- `completedAt`
- `createdAt`

### reminders
- `customerId` (ref)
- `serviceTypeId` (ref)
- `lastServiceDate`
- `nextReminderDate` (computed: lastServiceDate + defaultIntervalMonths)
- `status` (pending | sent | snoozed | dismissed)
- `sentAt`

## Pages/Views

### 1. Dashboard (`/`)
- Today's jobs with weather conditions for each job location
- Upcoming reminders due this week
- Quick stats: total customers, jobs this month, reminders pending

### 2. Calendar (`/calendar`)
- Monthly/weekly calendar view showing scheduled jobs
- Weather overlay: color-code days by weather (green=clear, yellow=rain possible, red=high wind/storm)
- Click day to add job
- Drag job to reschedule

### 3. Customers (`/customers`)
- List view with search/filter
- Add/edit customer modal
- Customer detail: history of jobs, upcoming reminders, address on map

### 4. Customer Detail (`/customers/[id]`)
- Customer info + edit
- Job history table
- Active reminders
- "Schedule Job" button

### 5. Jobs (`/jobs`)
- List of all jobs with filters (status, date range, service type)
- Add job: pick customer, service type, date/time
- Complete job: mark done, auto-update reminder for next service

### 6. Service Types (`/settings/services`)
- CRUD for service types
- Pre-seeded with chimney defaults: Inspection, Cleaning, Cap/Crown Repair, Liner Inspection

## MVP Tasks

### Phase 1: Foundation
- [ ] 1. Scaffold SvelteKit project in `/home/kai/pets/kaivalo/apps/scheduler`
- [ ] 2. Install deps: tailwind, shadcn-svelte, convex
- [ ] 3. Convex schema (serviceTypes, customers, jobs, reminders)
- [ ] 4. Seed default chimney service types
- [ ] 5. App layout: sidebar nav (Dashboard, Calendar, Customers, Jobs, Settings)

### Phase 2: Core CRUD
- [ ] 6. Customers: list, add, edit, delete
- [ ] 7. Customer detail page with job history
- [ ] 8. Jobs: list, add (pick customer + service type + date), edit, complete, cancel
- [ ] 9. Service types: list, add, edit, delete
- [ ] 10. Address geocoding on customer create/edit (Open-Meteo geocoding API)

### Phase 3: Weather Integration
- [ ] 11. Weather service: fetch 7-day forecast for a lat/lon (Open-Meteo)
- [ ] 12. Dashboard: show today's weather per job location
- [ ] 13. Calendar: weather overlay on days (color-coded)
- [ ] 14. Weather warning badge on jobs scheduled during bad weather

### Phase 4: Reminders
- [ ] 15. Auto-create reminder when job completed (nextReminderDate = completedAt + intervalMonths)
- [ ] 16. Reminders list view: pending reminders sorted by date
- [ ] 17. Dashboard: upcoming reminders widget
- [ ] 18. Mark reminder as sent/snoozed/dismissed

### Phase 5: Polish
- [ ] 19. Mobile responsive (these users are on phones)
- [ ] 20. Empty states for all views
- [ ] 21. Loading skeletons
- [ ] 22. Error handling and validation on all forms

## Verification
- Create a chimney service type, add a customer with KC address, schedule a job
- Complete the job → verify reminder auto-created for next year
- Check calendar shows weather overlay for KC
- Dashboard shows today's jobs with weather
- All views work on mobile viewport

## Out of Scope (separate cards)
- Auth (WorkOS — separate card)
- SMS/email sending for reminders (just track status for now)
- Stripe invoicing
- Route optimization
- Customer-facing booking page
