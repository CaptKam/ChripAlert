# ChripAlert V2 — Design Specification

**Version:** 1.0
**Date:** March 7, 2026
**Design Tool:** Stitch
**Status:** Pre-build planning — start fresh, no V1 design references

---

## 1. Design Philosophy — Our Laws

This section is non-negotiable. Every design decision must pass through these principles. They come from Apple's Human Interface Guidelines and are our foundation for both the webapp and the eventual iOS app.

### The Four Pillars

| Principle | What It Means for ChripAlert |
|-----------|------------------------------|
| **Clarity** | Every element must be immediately understandable. An edge alert should communicate its meaning in under 2 seconds. If a user has to think about what a badge means, we failed. |
| **Deference** | The UI steps back. The game data, the edge percentage, the sportsbook odds — that's the content. Chrome, toolbars, and decoration are minimized. The interface disappears. |
| **Depth** | Layers communicate hierarchy. Alert cards float above the game list. The sportsbook drawer slides from beneath the card. Modal sheets slide up. Depth replaces decoration with meaning. |
| **Consistency** | Standard patterns everywhere. Back button top-left. Tab bar at bottom. Swipe gestures behave as expected. A user who knows iOS already knows how to use our app. |

### The Ultimate Test
> The most successful apps are the ones where the interface disappears entirely. The user is not thinking about buttons, navigation, or animations. They are thinking about their content, their task, their goal.

For ChripAlert: when a user gets an alert, they should go from notification to sportsbook in under 5 seconds without thinking about the UI.

### The iOS 26 Evolution: Hierarchy, Harmony, Consistency

| Evolved Principle | Application |
|-------------------|-------------|
| **Hierarchy** | Dynamic prioritization — Strong Chirps are visually dominant, Soft Chirps recede. The interface adapts to what matters right now. |
| **Harmony** | Software meets hardware. Our design should feel like it belongs on the device. Glass effects, rounded corners matching device corners, haptic-ready interactions. |
| **Consistency** | Adaptive, not uniform. Same behavior on iPhone vs iPad vs desktop browser, but appearance adapts to each context. |

---

## 2. Design Laws (Non-Negotiable Rules)

These rules apply to every screen, every component, every interaction. No exceptions.

### Layout
- **44x44pt minimum** for all tap targets. Research shows smaller targets cause 25%+ error rates.
- **11pt minimum** for all visible text. Absolute floor per Apple HIG.
- **8pt grid** for all spacing. Values: 4, 8, 12, 16, 20, 24, 32, 48px.
- **Safe areas respected** — no content behind status bar, home indicator, notch, or Dynamic Island.
- **Design for smallest screen first** (390pt width). Scale up, never down.

### Typography
- **Use semantic text styles** (Title, Headline, Body, Caption) — never hardcoded sizes.
- **Support Dynamic Type** — all text must scale with user preferences.
- **Hierarchy through weight and size**, not just color. A colorblind user must still see the hierarchy.

### Color
- **Never use the same color for different meanings.** Red = destructive/Strong Chirp. Blue = interactive/Soft Chirp. Don't mix.
- **Don't rely on color alone.** Always pair with icons, labels, or shape.
- **Sufficient contrast** between text and backgrounds. Test in both light and dark mode.
- **Dark mode is mandatory**, not optional.

### Motion
- **Animation is functional**, not decorative. It guides attention and provides spatial context.
- **Respect Reduce Motion** accessibility setting — provide simpler crossfade alternatives.
- **Motion should be quick and natural.** Spring physics, not linear easing.

### Navigation
- **Tab bar at bottom** for primary navigation. Never a hamburger menu.
- **Back button top-left.** Always shows previous screen's title.
- **Swipe-from-left-edge** navigates back. Never override this gesture.
- **Modals slide up from bottom.** Always have a clear dismiss action.

### Accessibility
- **VoiceOver support** — every interactive element has a descriptive accessibility label.
- **Dynamic Type** — all text scales.
- **Touch targets** — 44x44pt minimum.
- **Color contrast** — meets WCAG AA minimum.

---

## 3. Surface System

### Layers
| Layer | Usage | Web Implementation |
|-------|-------|--------------------|
| **Background** | Page canvas, root | Solid dark base |
| **Card Surface** | Alert cards, game cards, panels | Slightly elevated, subtle border |
| **Elevated Surface** | Modals, dropdowns, sportsbook drawer | Highest elevation, backdrop blur |

### Depth Cues
- Cards cast subtle shadows proportional to their elevation
- The sportsbook quick-action drawer sits visually beneath the alert card (revealed on swipe)
- Modal sheets have backdrop blur showing the content beneath

### Liquid Glass Readiness
When transitioning to iOS 26:
- Navigation layer elements (tab bar, nav bar) adopt Liquid Glass material
- Content (cards, lists, data) stays clear and legible — glass is never on content
- Elements respond to device motion with specular highlights

---

## 4. Typography System

| Role | Font | Weight | Size | Usage |
|------|------|--------|------|-------|
| Page headings | System sans-serif* | 800 | 22px | Screen titles |
| Card titles | System sans-serif | 700 | 14-16px | Team names, alert type |
| Body text | System sans-serif | 500-600 | 13-15px | Descriptions, context |
| Captions | System sans-serif | 600 | 11-12px | Timestamps, metadata |
| Edge numbers | System monospace* | 800 | 22-28px | Edge %, scores, odds |
| Data values | System monospace | 700 | 11-13px | Stats, percentages |

*On web: Inter for sans-serif, JetBrains Mono for monospace.
*On iOS: San Francisco (SF Pro) and SF Mono — the system will handle this automatically.

**Key rule:** All sizes are starting points. They must scale with Dynamic Type / user preference. Design layouts that don't break at 2x text size.

---

## 5. Color System

### Accent Colors (Functional)
| Color | Hex | Meaning | Never Use For |
|-------|-----|---------|---------------|
| **Red** | #EF4444 | Strong Chirp, destructive actions | Success states, navigation |
| **Amber** | #F59E0B | Regular Chirp, warnings | Errors, navigation |
| **Blue** | #3B82F6 | Soft Chirp, interactive elements, links | Errors, warnings |
| **Green** | #22C55E | Success, OVER direction, positive edge, live indicator | Errors, destructive |
| **Cyan** | #06B6D4 | Park factor badges, data accents | Alerts, actions |

### Semantic Usage
| Intent | Color | Example |
|--------|-------|---------|
| Tappable/interactive | Blue | Links, buttons, toggles |
| OVER direction | Green | Direction badge, positive edge |
| UNDER direction | Red | Direction badge, negative trend |
| Live game indicator | Green | Pulsing dot |
| Destructive action | Red | Delete, remove |

### Dark Mode
Dark mode is the primary design. Light mode is secondary.
- Use semantic system colors that adapt automatically
- Accent colors need lower brightness + higher saturation on dark backgrounds
- Card surfaces use subtle borders (1px, low-opacity white) instead of shadows

---

## 6. Component Design Guidelines

These are guidelines for designing components in Stitch. Build from HIG principles, not from V1 designs.

### Alert Card (Core Component)
The most important component. Design it first.

**Content hierarchy (top to bottom):**
1. Chirp level badge + edge percentage + timestamp (glanceable header)
2. Game scoreboard — teams, scores, inning indicator, diamond
3. OVER/UNDER direction badge (the key insight)
4. Factor badges — which factors are firing (wind, temp, park, etc.)
5. Expandable "Why This Chirp" section with factor progress bars

**Swipe behavior:**
- Swipe left reveals sportsbook quick-action buttons
- Each button shows: book logo + live odds for that game
- Tapping a button opens the sportsbook via deep link

**States:**
- Default (collapsed)
- Expanded (showing factor breakdown)
- Swiped (showing sportsbook buttons)

### Game Card
- Teams (logos + abbreviations + full names)
- Scores (monospace, large)
- Baseball diamond SVG showing runners
- Inning + outs indicator
- Chirp badge if active edge exists (pulsing if Strong)
- Status: Scheduled / Live / Final

### Tab Bar
- 4 tabs: Games, Chirps, History, Settings
- Chirps tab has badge count for active edges
- Use filled icon variant for selected tab
- No labels needed if icons are clear (test with users)

### Sportsbook Button
- Book logo (small, 24-32px)
- Odds display (monospace: "+150", "-110")
- Tappable area is the full button (44x44pt minimum)
- Visual distinction between available books and "Add Sportsbook"

### Diamond Component
- SVG baseball diamond
- Filled dots for occupied bases
- Color matches team or neutral
- Compact (fits in card) and large (fits in game detail) variants

### Empty State
- Simple illustration or icon
- Short message: "No active edges right now"
- Secondary text: "We're scanning X live games"

---

## 7. Screen Layout Guidelines

### Navigation Structure
```
Tab Bar (bottom, persistent)
├── Games Tab
│   ├── Games List
│   └── Game Detail (push)
├── Chirps Tab
│   ├── Chirps List (with filters)
│   └── Edge Detail Modal (sheet)
├── History Tab
│   └── History List (with filters)
└── Settings Tab
    ├── Account
    ├── My Sportsbooks
    ├── Alert Preferences
    └── About
```

### Responsive Breakpoints
| Breakpoint | Layout | Notes |
|-----------|--------|-------|
| Mobile (<768px) | Single column, bottom tab bar, full-width cards | Primary design target |
| Tablet (768-1024px) | 2-column card grid, bottom tab bar | Cards should not stretch too wide |
| Desktop (1024px+) | Left sidebar nav (220px) + 2-3 column grid | Sidebar replaces tab bar |

### Landing Page (Public)
This is the only screen designed for marketing, not for the app experience.
- Hero section with headline + email capture
- How it works (3 steps)
- No navigation chrome — single CTA focus
- Disclaimer footer

---

## 8. Interaction Patterns

### Swipe to Act (Alert Cards)
The signature interaction. User sees alert -> swipes -> sees sportsbook odds -> taps to bet.
- Swipe threshold: 30% of card width reveals buttons
- Snap back with spring animation if released before threshold
- Haptic feedback at threshold point (on iOS)

### Pull to Refresh
- Standard iOS pull-to-refresh on all list screens
- Shows last-updated timestamp after refresh

### Filter Bar
- Horizontal scrollable chips: All / Strong / Chirp / Soft
- Selected chip has filled background, unselected has outline
- Filtering is instant (client-side)

### Factor Breakdown (Expandable)
- Tap "Why This Chirp" to expand
- Each factor shows: label + progress bar + value
- Progress bar color matches factor strength
- Smooth height animation on expand/collapse

### Notifications
- Web push: title + body + action button
- Tap opens app to the relevant game/alert
- Badge count updates on Chirps tab

---

## 9. Stitch Design Inputs

When starting the design in Stitch, here are the key inputs:

### Start With
1. **Alert Card component** — this is the product. Get this right first.
2. **Color tokens** — set up the 5 accent colors + surface system
3. **Typography scale** — set up the 6 text roles
4. **Tab bar** — establishes the navigation skeleton

### Design Sequence
1. Alert Card (all states: default, expanded, swiped)
2. Chirps Screen (list of alert cards + filter bar)
3. Game Card
4. Games Screen (list of game cards)
5. Game Detail Screen
6. Tab Bar + Navigation shell
7. Settings Screen
8. History Screen
9. Onboarding Flow
10. Landing Page

### Questions to Answer in Stitch
- How much info fits on an alert card without feeling cramped?
- Does the swipe-to-sportsbook feel natural or forced?
- Can a user scan the chirps list and find the strongest edge in under 3 seconds?
- Does the OVER/UNDER direction badge read clearly at glance?
- Does the design feel like it belongs on iOS even though it's web?

---

## 10. iOS Transition Design Notes

The webapp design should map 1:1 to iOS with minimal redesign:

| Web Component | iOS Equivalent |
|--------------|----------------|
| Bottom tab bar | UITabBarController |
| Card stack | UICollectionView with custom cells |
| Swipe action on card | UISwipeActionsConfiguration |
| Pull to refresh | UIRefreshControl |
| Modal sheet | UISheetPresentationController |
| Filter chips | UISegmentedControl or custom |
| Progress bars | UIProgressView |
| Toggle switches | UISwitch |

### What Changes on iOS
- Typography automatically becomes San Francisco
- Tab bar adopts Liquid Glass material
- Haptic feedback uses Taptic Engine natively
- Push notifications use APNs instead of Web Push
- Swipe-back gesture is native
- Dynamic Type scales automatically with system settings

### What Stays the Same
- Every layout, hierarchy, and spacing decision
- Color system and semantic usage
- Touch target sizes (44x44pt)
- Information architecture and navigation flow
- Card content hierarchy and factor breakdowns

---

## 11. Anti-Patterns (Never Do These)

| Don't | Why |
|-------|-----|
| Hamburger menu | Hides navigation. iOS users expect tab bar. |
| Custom scroll physics | Users expect native scroll behavior. |
| Overriding swipe-back | Disorienting. The left-edge swipe is sacred. |
| Text below 11pt | Illegible. Apple HIG absolute floor. |
| Tap targets below 44pt | 25%+ error rate. Accessibility violation. |
| Color-only meaning | Colorblind users can't distinguish. Pair with icons/shape. |
| Gratuitous animation | Motion should inform, not decorate. |
| Blocking modals without exit | Never trap users. Always show dismiss. |
| Inconsistent icon style | Use one icon set (SF Symbols / Lucide) throughout. |
| Ignoring dark mode | Users expect it. Broken dark mode = 1-star reviews. |
