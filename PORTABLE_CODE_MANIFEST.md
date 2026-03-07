# ChripAlert V2 — Portable Code Manifest

**Purpose:** Files from Chirpbot V1 that carry over to https://github.com/CaptKam/ChripAlert

---

## Copy These Files (4,447+ lines of proven logic)

### Engine Core
| Source Path | Destination | Lines | Changes Needed |
|------------|-------------|-------|----------------|
| `server/services/engines/mlb-prob-model.ts` | `lib/engines/mlb-prob-model.ts` | 406 | Add `computeDirection()` for OVER/UNDER output |
| `server/services/engines/mlb-engine.ts` | `lib/engines/mlb-engine.ts` | 309 | Update imports |
| `server/services/engines/base-engine.ts` | `lib/engines/base-engine.ts` | 572 | Remove V1 storage imports, make framework-agnostic |
| `server/services/engines/mlb-performance-tracker.ts` | `lib/engines/mlb-performance-tracker.ts` | 1,353 | No changes |

### API Services
| Source Path | Destination | Lines | Changes Needed |
|------------|-------------|-------|----------------|
| `server/services/mlb-api.ts` | `lib/services/mlb-api.ts` | 526 | No changes |
| `server/services/weather-service.ts` | `lib/services/weather-service.ts` | 448 | Extract STADIUMS to `data/stadiums.json` |
| `server/services/odds-api-service.ts` | `lib/services/odds-api-service.ts` | 416 | No changes |

### Alert Cylinder Modules (29 files)
| Source Path | Destination |
|------------|-------------|
| `server/services/engines/alert-cylinders/mlb/*.ts` | `lib/engines/alert-cylinders/mlb/*.ts` |

All 29 modules copy over. Each implements `isTriggered()` and `generateAlert()` with no external dependencies beyond `base-engine.ts`.

### Schema (needs trimming)
| Source Path | Destination | Lines | Changes Needed |
|------------|-------------|-------|----------------|
| `shared/schema.ts` | `lib/db/schema.ts` | 417 | Remove multi-sport tables not needed for MVP, add waitlist + chirp_history |

---

## Do NOT Copy These Files

| File | Lines | Why Not |
|------|-------|---------|
| `server/routes.ts` | 5,213 | Monolith — all 147 routes in one file. Replace with Next.js API routes. |
| `server/services/gambling-insights-composer.ts` | ~1,700 | Tightly coupled to V1 pipeline. V2 uses simpler odds fetch. |
| `server/services/unified-ai-processor.ts` | ~2,000 | GPT-4o enrichment — cut from MVP. Math engine is the baseline. |
| `server/index.ts` | 528 | Express bootstrap — replaced by Next.js. |
| `server/storage.ts` | ? | V1 storage layer — replaced by Drizzle direct queries. |
| `client/*` | ? | Entire V1 frontend — fresh design in Stitch. |
| All non-MLB engines | ? | NFL, NBA, NCAAF, WNBA, CFL engines wait for Phase 2. |

---

## Data Files to Create (not in V1 as separate files)

| File | Source | Notes |
|------|--------|-------|
| `data/stadiums.json` | Extract from `weather-service.ts` lines 29-95 | All 30 MLB stadiums with lat/lon, roof status |
| `data/park_factors.json` | Needs to be created or sourced | HR, 2B, 3B park factors per stadium |
| `data/sportsbook_links.json` | New | Deep link templates per sportsbook |

---

## Quick Start for New Repo

```bash
# In the new ChripAlert repo:
mkdir -p lib/engines/alert-cylinders/mlb
mkdir -p lib/services
mkdir -p lib/db
mkdir -p data

# Copy engine core
cp server/services/engines/mlb-prob-model.ts lib/engines/
cp server/services/engines/mlb-engine.ts lib/engines/
cp server/services/engines/base-engine.ts lib/engines/
cp server/services/engines/mlb-performance-tracker.ts lib/engines/

# Copy alert cylinders
cp server/services/engines/alert-cylinders/mlb/*.ts lib/engines/alert-cylinders/mlb/

# Copy services
cp server/services/mlb-api.ts lib/services/
cp server/services/weather-service.ts lib/services/
cp server/services/odds-api-service.ts lib/services/

# Copy and modify schema
cp shared/schema.ts lib/db/
```
