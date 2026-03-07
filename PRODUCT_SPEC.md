# ChripAlert V2 — Product Specification

**Version:** 1.0
**Date:** March 7, 2026
**Status:** Pre-build planning

---

## 1. Product Definition

### What ChripAlert Is
A real-time sports edge detection platform. It monitors live games, combines player performance, environmental factors, and situational data into a multiplier-stack probability model, and surfaces actionable over/under edges ranked by conviction level.

### The One-Line Pitch
See the edge before the line moves.

### What It Is NOT
- Not a sportsbook
- Not a picks service
- Not a social platform
- It is a data tool that surfaces statistical edges for entertainment purposes

### MVP Scope
**MLB first.** The math engine, alert cylinders, and data pipeline are proven across 3,600+ commits in V1. MLB ships first. Additional sports (NFL, NBA, NCAAF, WNBA, CFL) follow — the engine architecture already supports all six.

### Target User
Sports bettors aged 25-45 who already bet over/unders and want a data edge. They use FanDuel/DraftKings/BetMGM, follow their sport, and are comfortable with stats. They check their phone during games.

---

## 2. Chirp Level System

The edge engine scores every live situation and classifies it into a conviction tier:

| Level | Edge Score | Color | Meaning |
|-------|-----------|-------|---------|
| **STRONG CHIRP** | 12%+ | Red (#EF4444) | Highest conviction — multiple factors stacking |
| **CHIRP** | 7-12% | Amber (#F59E0B) | Solid edge — worth acting on |
| **SOFT CHIRP** | 4-7% | Blue (#3B82F6) | Worth watching — conditions developing |

Classification uses a blended score: 50% edge composite + 30% event probability + 20% leverage.

---

## 3. Core Feature: Edge Alerts

### How It Works
1. **Scan** — Engine polls live game data every 10-15 seconds
2. **Detect** — 29 MLB alert cylinder modules evaluate every game state change
3. **Score** — 6-factor multiplier-stack model calculates edge strength and direction
4. **Alert** — Users receive real-time notifications with edge details

### The 6 Edge Factors (MLB)
| Factor | Weight | What It Measures |
|--------|--------|------------------|
| Batter Power | 0.35 | ISO z-score normalized against league average |
| Pitcher Fatigue | 0.35 | Pitch count curve + innings pitched |
| Wind | 0.40 | Speed and direction relative to stadium |
| Park Factor | 0.30 | Stadium run environment |
| Runner Situation | 0.25 | Base-runner positions weighted by outs |
| Temperature | 0.20 | Ball carry adjustment (neutral at 72F) |

### Edge Direction (NEW for V2)
Every alert outputs a direction: **OVER** or **UNDER**.
- Wind out + high park factor + power batter + pitcher fatigued = **OVER**
- Pitcher dominant + low park factor + cold + wind in = **UNDER**

This is the core product thesis. V1 scored edge strength but not direction. V2 fixes this.

### Alert Content
Each alert includes:
- Chirp level badge + edge percentage
- Game scoreboard (teams, scores, inning, outs, diamond)
- Which factors are firing and how strong
- OVER/UNDER direction with confidence
- Live odds from user's linked sportsbooks

---

## 4. Core Feature: Sportsbook Quick-Action

When a user receives an alert card, they can **swipe/slide the card** to reveal their linked sportsbook buttons. Each button shows:
- Sportsbook logo (FanDuel, DraftKings, BetMGM, etc.)
- Live odds for that specific game/line from that book
- Deep link that opens the sportsbook app/site to the relevant bet slip

### User Setup
In settings, users select "My Sportsbooks" from a list. The app pulls odds per book via the Odds API and maps deep links.

### Monetization Angle
Sportsbook affiliate links pay $50-200 per new depositor. This is the primary revenue path before subscriptions.

---

## 5. Alert Delivery System

### MVP: Web Push Notifications + In-App
| Channel | How It Works | Cost |
|---------|-------------|------|
| **Web push** | Browser notification when edge fires, works even when tab is closed | Free |
| **In-app** | Toast notification + badge count + alert feed in app | Free |

### Phase 2: Email Digests
Daily/weekly summary of chirps and hit rates. Low priority — real-time alerts are the product.

### Dropped from V1
Telegram delivery is cut. It lets users redistribute alerts to groups, bypassing signups and giving away the product for free.

---

## 6. Screens

### Landing Page
- Hero: "See the edge before the line moves"
- How it works: 3-step visual (Scan, Detect, Alert)
- Email capture CTA
- Disclaimer: "For entertainment purposes only"

### Games Screen
- Today's games sorted: Live first, then scheduled, then final
- Game cards with teams, scores, diamond (if live), venue
- Chirp badge on games with active edges
- Tap card -> Game Detail

### Chirps Screen (Core)
- Active edge count + live game count
- Filter: All / Strong / Chirp / Soft
- Chirp cards with full edge breakdown
- Swipe card -> Sportsbook quick-action buttons
- "Why This Chirp" expandable factor breakdown
- Empty state when no edges active

### Game Detail Screen
- Large scoreboard
- Edge card with factor breakdown + O/U direction
- Weather + park factor info
- Sportsbook odds comparison

### History Screen
- Past chirp performance: hit rate, record, P&L
- Filter: All / Hits / Misses
- Color-coded cards (green = hit, red = miss)
- Requires chirp_history table (new for V2)

### Settings Screen
- Account info
- "My Sportsbooks" selection
- Chirp alert toggles (Strong/Regular/Soft)
- Push notification toggle
- Edge engine info (read-only)

### Onboarding (3 steps)
1. Pick your teams
2. Select your sportsbooks
3. Alert preferences

---

## 7. User Accounts

### MVP Auth
Email + password. JWT tokens. No OAuth to start.

### Tiers
| Tier | Price | Features |
|------|-------|----------|
| **Free Beta** | $0 | All chirps, 3-game history, basic alerts |
| **Pro** (Phase 2) | $9.99/mo | Unlimited history, custom thresholds, priority alerts |

---

## 8. Monetization Strategy

| Phase | Timeline | Revenue |
|-------|----------|---------|
| **1. Free Beta** | Launch | Email capture, build user base, sportsbook affiliate links |
| **2. Freemium** | Month 2-3 | Pro tier at $9.99/mo, affiliate revenue growing |
| **3. Scale** | Month 4+ | Affiliate partnerships, premium tiers, API access |

**Validation target:** 100 paying users at $9.99/mo = ~$1,000 MRR.
**Affiliate target:** Sportsbook referrals at $50-200/depositor.

---

## 9. Multi-Sport Roadmap

| Priority | Sport | Status |
|----------|-------|--------|
| **MVP** | MLB | Engine complete, 29 alert cylinders, prob model done |
| **Phase 2** | NFL | Engine exists in V1, needs O/U direction |
| **Phase 2** | NBA | Engine exists in V1, needs O/U direction |
| **Phase 3** | NCAAF | Engine exists in V1 |
| **Phase 3** | WNBA | Engine exists in V1 |
| **Phase 3** | CFL | Engine exists in V1 |

All 6 sport engines and 94 alert cylinder modules exist in V1. The architecture is sport-agnostic — adding a sport means adding its engine + cylinders + API service.

---

## 10. Build Priorities

Everything is prioritized by: does this get us closer to a real user seeing the product?

### Week 1: Ship Foundation
1. Deploy Next.js project with landing page
2. Wire /api/edges endpoint with O/U direction
3. Wire /api/games and /api/weather
4. Web push notification setup

### Week 2: Core App
5. Build Chirps screen with live data
6. Build Games screen
7. Build Game Detail screen
8. Sportsbook quick-action cards

### Week 3: Polish & Auth
9. Auth (email/password, JWT)
10. Onboarding flow
11. Settings (including My Sportsbooks)
12. History screen + chirp_history tracking

### Week 4: Feedback
13. Send to 10 people who bet baseball
14. Fix top 3 issues
15. Evaluate affiliate partnership outreach
