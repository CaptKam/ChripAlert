# ChripAlert V2 — Technical Specification

**Version:** 1.0
**Date:** March 7, 2026
**Status:** Pre-build planning
**Repo:** https://github.com/CaptKam/ChripAlert

---

## 1. Architecture Overview

```
Next.js 14 App Router
├── /app                    ← Pages + API routes (SSR)
├── /lib
│   ├── /engines            ← Portable from V1
│   │   ├── mlb-prob-model.ts       (edge engine math)
│   │   ├── mlb-engine.ts           (alert orchestrator)
│   │   ├── mlb-performance-tracker.ts (batter/pitcher/momentum)
│   │   ├── base-engine.ts          (shared engine logic)
│   │   └── /alert-cylinders/mlb/   (29 detection modules)
│   ├── /services           ← Portable from V1 (with cleanup)
│   │   ├── mlb-api.ts              (MLB Stats API client)
│   │   ├── weather-service.ts      (OpenWeatherMap + stadiums)
│   │   └── odds-api-service.ts     (The Odds API client)
│   └── /db
│       └── schema.ts               (Drizzle schema — trimmed for V2)
├── /components             ← All new (designed in Stitch)
└── /public
```

---

## 2. Tech Stack

### Keep from V1 (proven, portable)
| Technology | Why Keep |
|-----------|---------|
| **TypeScript** | Type safety, same language front + back |
| **Drizzle ORM** | Modern, clean schema, Zod validation |
| **PostgreSQL** | Reliable, handles our scale |
| **TanStack React Query v5** | Industry standard for server state |
| **Zod** | Validation everywhere |
| **Pino** | Structured logging |

### New for V2
| Technology | Purpose | Why |
|-----------|---------|-----|
| **Next.js 14** | App router, SSR, API routes | SSR for landing page SEO, API routes replace Express |
| **React 19** | UI components | Latest stable |
| **Tailwind CSS 4** | Styling | New engine, faster builds |
| **shadcn/ui** | Component library base | Accessible, customizable |
| **Framer Motion** | Animation | HIG-compliant motion |
| **Web Push API** | Notifications | Free, works when tab closed |
| **Vitest** | Testing | Fast, Vite-native |
| **Biome** | Linting + formatting | Replaces ESLint + Prettier |
| **GitHub Actions** | CI/CD | Automated testing + deploy |

### Dropped from V1
| Technology | Why Drop |
|-----------|---------|
| Express 4 | Replaced by Next.js API routes |
| GPT-4o / unified-ai-processor | Math engine + raw data is the baseline. No AI enrichment for MVP. |
| gambling-insights-composer (58KB) | Tightly coupled, replaced by simpler odds fetch |
| Telegram Bot API | Cut — bypasses signups |
| Passport / OAuth | Simplified to JWT for MVP |
| Wouter | Next.js has built-in routing |
| Helmet / CSRF | Next.js handles security differently |

---

## 3. Portable Code from V1

These files carry over with minimal changes. They are self-contained logic with clean interfaces.

### Engine Core (4,447 lines total)
| File | Lines | What It Does | Changes Needed |
|------|-------|-------------|----------------|
| `mlb-prob-model.ts` | 406 | 6-factor multiplier-stack edge engine, logistic regression models, chirp classification | **Add OVER/UNDER direction output** |
| `mlb-engine.ts` | 309 | Alert orchestrator — runs cylinders, enriches with edge scores | Update imports for new directory structure |
| `base-engine.ts` | 572 | Shared engine logic — dedup, metrics, module loading | Remove V1 storage imports, make framework-agnostic |
| `mlb-performance-tracker.ts` | 1,353 | Batter, pitcher, and team momentum tracking | Clean portable — no changes needed |
| `mlb-api.ts` | 526 | MLB Stats API client (schedule, live, player stats) | Clean portable — no changes needed |
| `weather-service.ts` | 448 | OpenWeatherMap + inline stadium data | Extract stadium data to `stadiums.json` |
| `odds-api-service.ts` | 416 | The Odds API client for betting odds | Clean portable — no changes needed |
| `shared/schema.ts` | 417 | Drizzle DB schema | Trim to V2 tables, add waitlist + chirp_history |

### Alert Cylinder Modules (29 files)
All MLB alert cylinders carry over. Each is a self-contained module that implements `isTriggered()` and `generateAlert()`.

```
bases-loaded-no-outs-module.ts      runner-on-third-no-outs-module.ts
bases-loaded-one-out-module.ts      runner-on-third-one-out-module.ts
bases-loaded-two-outs-module.ts     runner-on-third-two-outs-module.ts
batter-due-module.ts                runner-on-second-no-outs-module.ts
clutch-situation-module.ts          scoring-opportunity-module.ts
first-and-second-module.ts          second-and-third-no-outs-module.ts
first-and-third-no-outs-module.ts   second-and-third-one-out-module.ts
first-and-third-one-out-module.ts   seventh-inning-stretch-module.ts
first-and-third-two-outs-module.ts  steal-likelihood-module.ts
game-start-module.ts                strikeout-module.ts
high-scoring-situation-module.ts    wind-change-module.ts
late-inning-close-module.ts         mlb-prob-integration.ts
momentum-shift-module.ts            risp-prob-enhanced-module.ts
on-deck-prediction-module.ts        ai-scanner-module.ts
pitching-change-module.ts
```

---

## 4. New Code to Build

### 4.1 OVER/UNDER Direction Engine
Add to `mlb-prob-model.ts`:

```typescript
export type EdgeDirection = 'OVER' | 'UNDER';

function computeDirection(edge: EdgeFactors, pitcher?: MLBState['pitcher']): EdgeDirection {
  // Factors that push OVER: wind out, high park factor, batter power, heat, pitcher tired
  const overSignal =
    edge.wind * 0.40 +
    edge.parkFactor * 0.30 +
    edge.batterPower * 0.35 +
    edge.temperature * 0.20 +
    edge.pitcherFatigue * 0.35;

  // Factors that push UNDER: wind in, low park factor, weak batter, cold, fresh pitcher
  const underSignal =
    (1 - edge.wind) * 0.40 +
    (1 - edge.parkFactor) * 0.30 +
    (1 - edge.batterPower) * 0.35 +
    (1 - edge.temperature) * 0.20 +
    (1 - edge.pitcherFatigue) * 0.35;

  return overSignal >= underSignal ? 'OVER' : 'UNDER';
}
```

### 4.2 API Routes (Next.js App Router)

```
/app/api/
├── games/
│   ├── route.ts              GET /api/games — today's schedule
│   └── [gameId]/
│       └── route.ts          GET /api/games/:gameId — live game state
├── edges/
│   └── route.ts              GET /api/edges — all live edges sorted by strength
│                              GET /api/edges?gameId=X — specific game
├── weather/
│   └── route.ts              GET /api/weather?team=BOS
├── auth/
│   ├── login/route.ts        POST /api/auth/login
│   ├── signup/route.ts       POST /api/auth/signup
│   └── logout/route.ts       POST /api/auth/logout
├── user/
│   ├── preferences/route.ts  GET/POST alert preferences
│   └── sportsbooks/route.ts  GET/POST user's linked sportsbooks
├── odds/
│   └── route.ts              GET /api/odds?gameId=X&books=fanduel,draftkings
└── waitlist/
    └── route.ts              POST /api/waitlist — email capture
```

### 4.3 Database Schema (V2)

```typescript
// Core tables
users           // id, email, password_hash, name, tier, created_at
user_teams      // user_id, team_abbr, sport
user_sportsbooks // user_id, book_name, affiliate_code

// Alert system
alerts          // id, user_id, game_id, sport, type, message, edge_pct, direction, chirp_level, created_at, expires_at
chirp_history   // id, user_id, game_id, edge_pct, direction, line, result, pnl, created_at

// Game state
game_states     // id, game_id, sport, state_json, updated_at

// Growth
waitlist        // id, email, created_at

// Settings
user_preferences // user_id, alert_levels (json), push_enabled, email_digest
global_settings  // sport, key, value
```

### 4.4 Web Push Notification System

```
Service Worker (client)
  ├── Registers on app load
  ├── Subscribes to push notifications
  └── Displays notification when received

Push Server (Next.js API route)
  ├── Stores push subscriptions per user
  ├── Triggered by edge engine when chirp fires
  └── Uses web-push library (VAPID keys)

Notification Content:
  Title: "[STRONG CHIRP] NYY vs BOS"
  Body: "OVER edge 14.2% — bases loaded, pitcher tired, wind out"
  Action: Opens game detail screen
```

---

## 5. External APIs

| API | Base URL | Auth | Cost | Cache |
|-----|----------|------|------|-------|
| MLB Stats API | statsapi.mlb.com | None | Free | 10-60s |
| OpenWeatherMap | api.openweathermap.org | API key | Free tier | 5min |
| The Odds API | api.the-odds-api.com/v4 | API key | Free tier (500 req/mo) | 30s |

### Sportsbook Deep Links
| Book | Link Format | Affiliate |
|------|-------------|-----------|
| FanDuel | `https://sportsbook.fanduel.com/...` | Yes |
| DraftKings | `https://sportsbook.draftkings.com/...` | Yes |
| BetMGM | `https://sports.betmgm.com/...` | Yes |
| Caesars | `https://sportsbook.caesars.com/...` | Yes |

Deep link formats will need research per book — most support linking to a specific game/event.

---

## 6. Data Flow

```
Every 10-15 seconds:
  1. mlb-api.ts polls MLB Stats API for live game state
  2. weather-service.ts fetches weather for active stadiums (5min cache)
  3. mlb-engine.ts feeds game state to all 29 alert cylinders
  4. Each triggered cylinder generates an alert
  5. mlb-prob-model.ts scores each alert:
     - Computes 6-factor edge (batterPower, pitcherFatigue, wind, park, runners, temp)
     - Runs logistic regression for event probability
     - Calculates leverage (late/close game)
     - Determines OVER/UNDER direction (NEW)
     - Classifies chirp level (STRONG/CHIRP/SOFT)
  6. Deduplication prevents alert flooding
  7. New alerts → database + web push notification
  8. Client receives via SSE stream or polling fallback
```

---

## 7. Infrastructure

### MVP Deployment
| Service | Purpose | Cost |
|---------|---------|------|
| Vercel | Next.js hosting, edge functions | Free tier to start |
| Neon | Serverless PostgreSQL | Free tier (0.5GB) |
| GitHub Actions | CI/CD | Free |
| Domain (chripalert.com or similar) | Custom domain | ~$12/yr |

**Alternative:** Replit Core ($25/mo) if you want the same hosting as V1.

### Environment Variables
```
DATABASE_URL=           # Neon PostgreSQL connection string
JWT_SECRET=             # JWT signing key
OPENWEATHERMAP_API_KEY= # Weather data
ODDS_API_KEY=           # Default odds API key (users can add their own)
VAPID_PUBLIC_KEY=       # Web push public key
VAPID_PRIVATE_KEY=      # Web push private key
NEXT_PUBLIC_APP_URL=    # App URL for push notification links
```

---

## 8. Testing Strategy

| Layer | Tool | What to Test |
|-------|------|-------------|
| Unit | Vitest | Edge engine math, alert cylinder triggers, probability models |
| Integration | Vitest | API routes, database queries, push notification flow |
| E2E | Playwright | User flows (signup, view chirps, swipe to sportsbook) |
| Lint | Biome | Code quality, formatting |

**Priority tests:** Edge engine math must have tests. If `computeEdgeFactors()` or `computeDirection()` regress, the whole product breaks.

---

## 9. iOS Transition Plan

The webapp is built with iOS in mind from day one:
- **Design system** follows Apple HIG (see DESIGN_SPEC.md)
- **Touch targets** are 44x44pt minimum everywhere
- **Navigation** uses tab bar pattern (bottom) — maps directly to UITabBarController
- **Gestures** — swipe on alert cards maps to iOS swipe actions
- **Math engine** — pure TypeScript logic ports cleanly to Swift (same algorithms, same weights)

When ready for iOS:
1. Swift + SwiftUI native app
2. Port math engine TypeScript -> Swift (logic is framework-agnostic)
3. Reuse the same API routes (Next.js backend serves both web and iOS)
4. Push notifications transition from Web Push to APNs
