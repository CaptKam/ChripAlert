# ALERT CARD — Wireframe Specification
# Copy sections into Stitch. Edit values freely before pasting.

---

## CARD CONTAINER
- Width: 100% of parent (max 420px)
- Padding: 16px
- Corner radius: 12px
- Background: Card Surface (elevated, subtle border)
- Border: 1px solid white at 6% opacity
- Shadow: 0 2px 8px black at 10% opacity
- Overflow: hidden (for swipe action)

---

## ROW 1: STATUS BAR
Layout: horizontal, space-between, vertically centered
Height: 24px
Margin bottom: 12px

  ### Left group (horizontal, 8px gap)

  CHIRP LEVEL BADGE
  - Shape: pill (rounded full)
  - Padding: 4px horizontal, 12px vertical
  - Font: caption, weight 700, 11px
  - Text: "STRONG CHIRP" or "CHIRP" or "SOFT CHIRP"
  - Colors by level:
    - STRONG: background red #EF4444, text white
    - CHIRP: background amber #F59E0B, text black
    - SOFT: background blue #3B82F6, text white
  - Optional: pulse animation on STRONG (subtle scale 1.0 to 1.02, 2s loop)

  EDGE PERCENTAGE
  - Font: monospace, weight 800, 16px
  - Text: "+14.2%"
  - Color: white at 95% opacity

  ### Right group

  TIMESTAMP
  - Font: caption, weight 500, 11px
  - Text: "2m ago" or "Live"
  - Color: white at 40% opacity
  - If live: prefix with green dot (6px circle, #22C55E, pulse)

---

## ROW 2: SCOREBOARD
Layout: horizontal, space-between, vertically centered
Height: 56px
Padding: 12px
Background: white at 3% opacity (subtle inset)
Corner radius: 8px
Margin bottom: 12px

  ### Left: AWAY TEAM
  Layout: horizontal, 8px gap, vertically centered

  TEAM LOGO
  - Shape: circle
  - Size: 32px
  - Source: ESPN CDN or local asset
  - Fallback: first 2 letters of team name, centered in circle

  TEAM INFO
  - Layout: vertical, 2px gap
  - Abbreviation: font weight 700, 14px, white at 82% opacity. Text: "NYY"
  - Full name: font weight 500, 11px, white at 40% opacity. Text: "Yankees"

  ### Center: SCORE + GAME STATE
  Layout: vertical, centered, 4px gap

  SCORE
  - Font: monospace, weight 800, 22px
  - Text: "4 - 3"
  - Color: white at 95% opacity

  INNING + OUTS
  - Layout: horizontal, 6px gap, centered
  - Inning: font weight 600, 11px, white at 60% opacity. Text: "Top 7"
  - Outs: 3 dots in a row, 6px each, 4px gap
    - Filled dot: white at 60% opacity
    - Empty dot: white at 15% opacity
    - Example 1 out: [filled] [empty] [empty]

  ### Right: HOME TEAM
  Layout: horizontal, 8px gap, vertically centered (mirrored from away)

  TEAM LOGO
  - Same specs as away

  TEAM INFO
  - Same specs as away, right-aligned
  - Abbreviation: "BOS"
  - Full name: "Red Sox"

  ### DIAMOND (optional, between center and home)
  - Size: 28px square
  - Shape: rotated square (45 degrees) with 4 diamond points
  - Base dots: 6px circles at 1B, 2B, 3B positions
    - Occupied: amber #F59E0B (filled)
    - Empty: white at 15% opacity (outline only)
  - Home plate: small triangle at bottom, white at 20% opacity

---

## ROW 3: DIRECTION BADGE
Layout: horizontal, centered
Height: 32px
Margin bottom: 12px

  OVER/UNDER BADGE
  - Shape: pill (rounded full)
  - Padding: 8px vertical, 16px horizontal
  - Font: weight 800, 14px, monospace
  - If OVER:
    - Text: "OVER"
    - Background: green #22C55E at 15% opacity
    - Text color: green #22C55E
    - Left icon: arrow-up (12px)
  - If UNDER:
    - Text: "UNDER"
    - Background: red #EF4444 at 15% opacity
    - Text color: red #EF4444
    - Left icon: arrow-down (12px)

---

## ROW 4: FACTOR BADGES
Layout: horizontal, wrapping, 6px gap
Margin bottom: 12px

  Each FACTOR BADGE (only show factors that are active/significant):
  - Shape: pill (rounded 4px)
  - Padding: 4px vertical, 8px horizontal
  - Font: weight 600, 11px
  - Background: white at 5% opacity
  - Border: 1px solid white at 8% opacity
  - Text color: white at 60% opacity
  - Left icon: 12px, matching text color

  Possible badges:
  - Wind icon + "Wind 15mph Out"
  - Thermometer icon + "82F"
  - Stadium icon + "PF 1.12"
  - Flame icon + "98 Pitches"
  - Runner icon + "Bases Loaded"
  - Bat icon + "ISO .245"

---

## ROW 5: WHY THIS CHIRP (expandable)
Layout: vertical
Default state: collapsed (only trigger visible)

  ### Trigger (always visible)
  Layout: horizontal, space-between, vertically centered
  Height: 36px
  Tap target: full width, 44px tall (accessibility)

  LABEL
  - Font: weight 600, 12px
  - Text: "WHY THIS CHIRP"
  - Color: white at 40% opacity
  - Letter spacing: 0.5px

  CHEVRON
  - Icon: chevron-down (12px)
  - Color: white at 40% opacity
  - Rotates 180 degrees when expanded (spring animation, 300ms)

  ### Expanded content (hidden by default)
  Layout: vertical, 8px gap
  Padding top: 8px
  Animation: height 0 to auto, 250ms ease-out

  Each FACTOR ROW:
  Layout: horizontal, space-between, vertically centered
  Height: 28px

    FACTOR LABEL
    - Font: weight 500, 12px
    - Color: white at 60% opacity
    - Text: "Wind" or "Batter Power" or "Pitcher Fatigue" etc.

    PROGRESS BAR + VALUE
    - Layout: horizontal, 8px gap, vertically centered

    PROGRESS BAR
    - Width: 120px
    - Height: 4px
    - Corner radius: 2px
    - Background track: white at 8% opacity
    - Fill: color based on value
      - 0-30%: blue #3B82F6
      - 30-70%: amber #F59E0B
      - 70-100%: red #EF4444
    - Fill width: proportional to factor value (0 to 100%)

    VALUE
    - Font: monospace, weight 700, 11px
    - Color: white at 60% opacity
    - Text: "0.85" or "72%"

  Factor rows (in order):
  1. Wind (weight 0.40)
  2. Batter Power (weight 0.35)
  3. Pitcher Fatigue (weight 0.35)
  4. Park Factor (weight 0.30)
  5. Runner Situation (weight 0.25)
  6. Temperature (weight 0.20)

  COMPOSITE SCORE (bottom of expanded section)
  - Divider line: 1px solid white at 6% opacity
  - Padding top: 8px
  - Layout: horizontal, space-between
  - Label: "Edge Composite", weight 600, 12px, white at 82% opacity
  - Value: monospace, weight 800, 14px, white at 95% opacity

---

## SWIPE ACTION LAYER (hidden, revealed on swipe)
Position: absolute, right side of card
Layout: horizontal, 0px gap
Height: 100% of card

  The card content slides LEFT to reveal these buttons underneath.
  Swipe threshold: 30% of card width to lock open.
  Below threshold: spring back to closed.

  Each SPORTSBOOK BUTTON:
  - Width: 72px
  - Height: 100% of card
  - Layout: vertical, centered, 6px gap
  - Tap target: full button area (exceeds 44x44 minimum)

  BOOK LOGO
  - Size: 28px
  - Shape: rounded square (4px radius)
  - Source: sportsbook brand asset

  ODDS
  - Font: monospace, weight 700, 13px
  - Color: white at 95% opacity
  - Text: "+150" or "-110"
  - If positive (value bet): green #22C55E
  - If negative: white at 82% opacity

  Button colors (background):
  - FanDuel: #1493FF (blue)
  - DraftKings: #53D337 (green)
  - BetMGM: #C4A962 (gold)
  - Caesars: #1B3C34 (dark green)

  ADD SPORTSBOOK button (last position, if user has < 4 books):
  - Same dimensions
  - Plus icon: 20px, white at 40% opacity
  - Text: "Add", weight 500, 11px, white at 40% opacity
  - Background: white at 5% opacity
  - Dashed border: 1px dashed white at 15% opacity

---

## CARD STATES SUMMARY

### Default (collapsed)
- Rows 1-4 visible
- Row 5 shows trigger only (collapsed)
- Swipe layer hidden

### Expanded
- All rows visible
- Row 5 expanded with factor breakdown
- Card height increases with animation
- Swipe layer still hidden

### Swiped
- Card content shifts left
- Sportsbook buttons revealed on right
- Can be swiped from any state (collapsed or expanded)
- Tapping anywhere on card content closes swipe

### Loading (skeleton)
- Same dimensions as default
- All content replaced with shimmer placeholders
- Shimmer: gradient sweep left-to-right, 1.5s loop
- Placeholder shapes match content layout

---

## SAMPLE DATA FOR DESIGN

Use this to fill the card while designing:

Level: STRONG CHIRP
Edge: +14.2%
Time: 2m ago (Live)
Away: NYY Yankees, Score: 4
Home: BOS Red Sox, Score: 3
Inning: Top 7, 1 out
Runners: 2nd and 3rd occupied
Direction: OVER
Factors firing: Wind 15mph Out, 82F, PF 1.12, 98 Pitches
Factor values: Wind 0.85, Batter Power 0.72, Pitcher Fatigue 0.80, Park Factor 0.44, Runner Situation 0.68, Temperature 0.54
Composite: 0.67
Sportsbooks: FanDuel +150, DraftKings +145, BetMGM +155

---

## SPACING CHEAT SHEET (8pt grid)

4px  — between tightly related elements (icon to label)
6px  — between badges, dots
8px  — between elements in a group
12px — between sections within the card
16px — card padding (all sides)
