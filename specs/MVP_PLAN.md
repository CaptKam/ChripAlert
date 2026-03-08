# ChripAlert V2 — MVP Plan

**Version:** 1.0
**Date:** March 8, 2026
**Status:** Pre-build planning

---

## Phase 0: New Repo Setup (Day 1)

| Step | Task | Details |
|------|------|---------|
| 0.1 | **Create ChripAlert repo** | New Next.js 14 App Router project at `github.com/CaptKam/ChripAlert` |
| 0.2 | **Install stack** | React 19, Tailwind CSS 4, shadcn/ui, Framer Motion, Drizzle ORM, Zod, TanStack Query v5, Pino, web-push, Vitest, Biome |
| 0.3 | **Set up directory structure** | `lib/engines/`, `lib/services/`, `lib/db/`, `data/`, `components/`, `app/api/` |
| 0.4 | **Set up Neon DB** | Create PostgreSQL instance, store `DATABASE_URL` |
| 0.5 | **Set up env vars** | `DATABASE_URL`, `JWT_SECRET`, `OPENWEATHERMAP_API_KEY`, `ODDS_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_APP_URL` |
| 0.6 | **CI/CD** | GitHub Actions for lint (Biome) + test (Vitest) on push |

---

## Phase 1: Port Engine Code (Day 2-3)

| Step | Task | Source -> Dest |
|------|------|----------------|
| 1.1 | **Copy engine core (4 files)** | `mlb-prob-model.ts`, `mlb-engine.ts`, `base-engine.ts`, `mlb-performance-tracker.ts` -> `lib/engines/` |
| 1.2 | **Copy 29 MLB alert cylinders** | `server/services/engines/alert-cylinders/mlb/*.ts` -> `lib/engines/alert-cylinders/mlb/` |
| 1.3 | **Copy API services (3 files)** | `mlb-api.ts`, `weather-service.ts`, `odds-api-service.ts` -> `lib/services/` |
| 1.4 | **Add OVER/UNDER direction** | New `computeDirection()` function in `mlb-prob-model.ts` -- the core V2 feature |
| 1.5 | **Clean base-engine.ts** | Remove V1 storage imports, make framework-agnostic |
| 1.6 | **Extract stadium data** | Pull inline stadium coords from `weather-service.ts` -> `data/stadiums.json` |
| 1.7 | **Create data files** | `data/park_factors.json`, `data/sportsbook_links.json` |
| 1.8 | **Write unit tests** | Tests for `computeEdgeFactors()`, `computeDirection()`, chirp classification |

---

## Phase 2: Database & Auth (Day 4-5)

| Step | Task | Details |
|------|------|---------|
| 2.1 | **Trim V1 schema** | Copy `shared/schema.ts` -> `lib/db/schema.ts`, remove multi-sport tables |
| 2.2 | **Add V2 tables** | `waitlist`, `chirp_history`, `user_sportsbooks`, `user_preferences` |
| 2.3 | **Run Drizzle migrations** | Push schema to Neon |
| 2.4 | **Auth API routes** | `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout` (email + password, JWT) |
| 2.5 | **Auth middleware** | JWT verification for protected routes |

---

## Phase 3: API Routes (Day 5-7)

| Step | Task | Endpoint |
|------|------|----------|
| 3.1 | **Games endpoint** | `GET /api/games` -- today's schedule (live first, scheduled, final) |
| 3.2 | **Game detail endpoint** | `GET /api/games/:gameId` -- live game state |
| 3.3 | **Edges endpoint** | `GET /api/edges` -- all live edges with O/U direction, sorted by strength |
| 3.4 | **Weather endpoint** | `GET /api/weather?team=BOS` |
| 3.5 | **Odds endpoint** | `GET /api/odds?gameId=X&books=fanduel,draftkings` |
| 3.6 | **User preferences** | `GET/POST /api/user/preferences`, `GET/POST /api/user/sportsbooks` |
| 3.7 | **Waitlist endpoint** | `POST /api/waitlist` -- email capture |

---

## Phase 4: Design in Stitch (Day 5-8, parallel with Phase 3)

| Step | Task | Priority |
|------|------|----------|
| 4.1 | **Set up design tokens** | 5 accent colors, surface system, 6 typography roles |
| 4.2 | **Alert Card** | All states: default, expanded, swiped -- follow `ALERT_CARD_WIREFRAME.md` exactly |
| 4.3 | **Game Card** | Teams, scores, diamond SVG, chirp badge |
| 4.4 | **Tab Bar** | 4 tabs: Games, Chirps, History, Settings |
| 4.5 | **Screen layouts** | Chirps, Games, Game Detail, Settings, History |
| 4.6 | **Landing page** | Hero + email capture + how it works |

---

## Phase 5: Build Frontend (Day 8-12)

| Step | Task | Screen |
|------|------|--------|
| 5.1 | **Landing page** | Hero, 3-step visual, email capture CTA, disclaimer |
| 5.2 | **Tab bar + nav shell** | Bottom tabs (mobile), sidebar (desktop) |
| 5.3 | **Chirps screen** | Alert card list + filter chips (All/Strong/Chirp/Soft) + empty state |
| 5.4 | **Alert Card component** | Chirp badge, scoreboard, O/U direction, factor badges, expandable "Why This Chirp", swipe-to-sportsbook |
| 5.5 | **Games screen** | Game cards sorted live -> scheduled -> final |
| 5.6 | **Game Detail screen** | Large scoreboard, edge card, weather/park info, odds comparison |
| 5.7 | **Sportsbook quick-action** | Swipe layer with book logos + live odds + deep links |
| 5.8 | **History screen** | Past chirps with hit/miss color coding, filters |
| 5.9 | **Settings screen** | My Sportsbooks, alert toggles, push toggle |
| 5.10 | **Onboarding flow** | 3 steps: pick teams -> select sportsbooks -> alert preferences |
| 5.11 | **Dark mode** | Primary design, with light mode secondary |

---

## Phase 6: Notifications (Day 12-13)

| Step | Task | Details |
|------|------|---------|
| 6.1 | **Service worker** | Register on app load, subscribe to push |
| 6.2 | **Push server** | VAPID keys, store subscriptions per user |
| 6.3 | **Trigger flow** | Edge engine fires -> push notification -> tap opens game detail |
| 6.4 | **In-app notifications** | Toast + badge count on Chirps tab |

---

## Phase 7: Deploy & Polish (Day 14-16)

| Step | Task | Details |
|------|------|---------|
| 7.1 | **Deploy to Vercel** | Connect repo, set env vars, custom domain |
| 7.2 | **Accessibility pass** | VoiceOver labels, 44pt targets, WCAG AA contrast |
| 7.3 | **Reduce Motion support** | Simpler crossfade fallbacks for all animations |
| 7.4 | **Responsive testing** | Mobile (390px+), tablet, desktop breakpoints |
| 7.5 | **Performance** | SSR landing page for SEO, code splitting, image optimization |

---

## Phase 8: Beta Launch (Day 17-21)

| Step | Task | Details |
|------|------|---------|
| 8.1 | **Send to 10 baseball bettors** | Real users testing during live MLB games |
| 8.2 | **Fix top 3 issues** | Based on feedback |
| 8.3 | **Sportsbook affiliate outreach** | FanDuel, DraftKings, BetMGM partnerships |
| 8.4 | **Track chirp hit rates** | Populate `chirp_history`, validate edge model |

---

## Existing Files to Port (Don't Rebuild)

### Engine Core (4 files)

| File | Path |
|------|------|
| Base Engine | `server/services/engines/base-engine.ts` |
| MLB Engine | `server/services/engines/mlb-engine.ts` |
| MLB Prob Model | `server/services/engines/mlb-prob-model.ts` |
| MLB Performance Tracker | `server/services/engines/mlb-performance-tracker.ts` |

### MLB Alert Cylinders (29 files)

All in `server/services/engines/alert-cylinders/mlb/`:

| # | File |
|---|------|
| 1 | `ai-scanner-module.ts` |
| 2 | `bases-loaded-no-outs-module.ts` |
| 3 | `bases-loaded-one-out-module.ts` |
| 4 | `bases-loaded-two-outs-module.ts` |
| 5 | `batter-due-module.ts` |
| 6 | `clutch-situation-module.ts` |
| 7 | `first-and-second-module.ts` |
| 8 | `first-and-third-no-outs-module.ts` |
| 9 | `first-and-third-one-out-module.ts` |
| 10 | `first-and-third-two-outs-module.ts` |
| 11 | `game-start-module.ts` |
| 12 | `high-scoring-situation-module.ts` |
| 13 | `late-inning-close-module.ts` |
| 14 | `mlb-prob-integration.ts` |
| 15 | `momentum-shift-module.ts` |
| 16 | `on-deck-prediction-module.ts` |
| 17 | `pitching-change-module.ts` |
| 18 | `risp-prob-enhanced-module.ts` |
| 19 | `runner-on-second-no-outs-module.ts` |
| 20 | `runner-on-third-no-outs-module.ts` |
| 21 | `runner-on-third-one-out-module.ts` |
| 22 | `runner-on-third-two-outs-module.ts` |
| 23 | `scoring-opportunity-module.ts` |
| 24 | `second-and-third-no-outs-module.ts` |
| 25 | `second-and-third-one-out-module.ts` |
| 26 | `seventh-inning-stretch-module.ts` |
| 27 | `steal-likelihood-module.ts` |
| 28 | `strikeout-module.ts` |
| 29 | `wind-change-module.ts` |

Plus shared scanner: `server/services/engines/alert-cylinders/ai-opportunity-scanner.ts`

### API Services (Port These)

| Service | Path | MVP? |
|---------|------|------|
| MLB Stats API | `server/services/mlb-api.ts` | Yes |
| Weather Service | `server/services/weather-service.ts` | Yes |
| Weather (Live) | `server/services/weather-on-live-service.ts` | Yes |
| Odds API | `server/services/odds-api-service.ts` | Yes |
| Base Sport API | `server/services/base-sport-api.ts` | Yes (shared parent) |
| HTTP Client | `server/services/http.ts` | Yes (used by all) |
| Game State Manager | `server/services/game-state-manager.ts` | Yes |
| Season Manager | `shared/season-manager.ts` | Yes |

### Schema (Trim, Don't Rewrite)

| File | Path |
|------|------|
| Drizzle Schema | `shared/schema.ts` |

### Support Files (Port If Needed)

| Service | Path | Notes |
|---------|------|-------|
| Quality Validator | `server/services/quality-validator.ts` | Keep -- validates alert quality |
| Text Utils | `server/services/text-utils.ts` | Keep -- formatting helpers |
| Unified Deduplicator | `server/services/unified-deduplicator.ts` | Keep -- prevents duplicate alerts |
| Engine Lifecycle Manager | `server/services/engine-lifecycle-manager.ts` | Keep -- manages engine start/stop |
| Alert Cleanup | `server/services/alert-cleanup.ts` | Keep -- cleans stale alerts |

---

## Drop for V2 (Don't Port)

| File | Why |
|------|-----|
| `telegram.ts` | Cut per product spec |
| `gambling-insights-composer.ts` | V1 AI feature, not needed for MVP |
| `ai-situation-parser.ts` | V1 AI feature |
| `unified-ai-processor.ts` | V1 AI feature |
| `advanced-player-stats.ts` | Nice-to-have, not MVP |
| `calendar-sync-service.ts` | Not in V2 scope |
| `migration-adapter.ts` | V1 migration tooling |
| `sportsdata-api.ts` | Replaced by direct sport APIs |
| `cfl-*.ts`, `nba-*.ts`, `nfl-*.ts`, `ncaaf-*.ts`, `wnba-*.ts` | Phase 2/3 sports |

---

## Key Decisions Before Building

1. **Vercel** for hosting (recommended over Replit for production stability)
2. **Domain** -- check availability for `chripalert.com`
3. **Odds API budget** -- Free tier = 500 req/mo. Enough for beta, paid plan needed at scale
4. **Sportsbook affiliate sign-ups** -- start early, applications can take weeks

## What's New to Build

- `computeDirection()` -- OVER/UNDER output (the V2 thesis)
- Next.js API routes (replace Express monolith)
- Entire frontend (fresh design from Stitch)
- Web Push notification system
- Auth (email/password + JWT)
- `chirp_history` tracking

## Critical Path

**Port engine -> API routes -> Alert Card UI -> Notifications -> Deploy**

Everything else can be parallelized or deferred.

## Validation Targets

- **100 paying users** at $9.99/mo = ~$1,000 MRR
- **Sportsbook referrals** at $50-200/depositor
- **10 beta testers** using during live MLB games before public launch
