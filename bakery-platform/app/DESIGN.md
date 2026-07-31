# App — "Daymaker System" (canonical assembly)

The final assembled app, adapted to daymaker.com's design language but tuned
systematic rather than playful. Load `./styles/theme.css` FIRST on every
page, then the page stylesheet.

## Relationship to daymaker.com

Taken from the Daymaker front ends (apps/*/styles in the host repo):
- Palette: white paper, ink #0A0A0A, hot pink #FF2D2D (+ #C81E1E strong,
  #FFC4C4 soft), muted #6B6358, hairline rgba(10,10,10,0.12).
- Type: Inter for UI/body, Bricolage Grotesque for page titles, Fraunces for
  prices and stat numerals. Loaded from Google Fonts like daymaker.com does.
- Patterns: uppercase 12px micro-labels (letter-spacing 0.06em), data tables
  with hairline rows and a faint pink row-hover tint, tabular numerals,
  pill badges.

Deliberately DROPPED from daymaker.com (the playful layer): Caveat script,
rotated elements, hard offset shadows (3px 3px 0), pulsing dots, drifting
background orbs, tape-yellow accents. Nothing rotates, nothing animates
except 120ms background/border transitions.

## Rules
- Flat surfaces: 1px hairline borders, radius 10px (cards) / 8px (inputs),
  pills 999px. No box shadows anywhere.
- Pink is a SIGNAL, not a wallpaper: primary buttons, active states, the cart
  badge, key status accents. Everything else is ink on white.
- Denser, tool-like layouts: tighter spacing than the variants, micro-labels
  over data, table patterns in admin.
- Prices and numerals use Fraunces (`.price`, `.stat`), tabular where
  columnar.
- Copy: Norwegian bokmål, plain and precise, no exclamation marks, no
  em-dashes. Code and comments in English.
- Mobile-first: single column below 640px, max content width 1100px.
