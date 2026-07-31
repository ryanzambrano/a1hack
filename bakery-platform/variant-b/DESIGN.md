# Variant B — "Stram" (stark minimal)

Team B design direction. All four pages must feel like one shop. Load
`./styles/theme.css` FIRST on every page, then your page stylesheet.

## Mood
Ruthlessly reduced. White space is the design. Black text on white, hairline
borders, square corners, ONE signal color used sparingly (primary buttons and
active states only). Typography does all the work: uppercase micro-labels with
letter-spacing, big clean numerals for prices.

## Tokens (defined in styles/theme.css — use the variables, never raw hex)
- Background `--bg` #FFFFFF, text `--ink` #111111, muted `--ink-soft` #767676
- Accent `--accent` #E63312 (signal red), borders `--line` #E5E5E5
- Radius `--radius` 0. System sans everywhere. No shadows at all.

## Rules
- No decoration: no shadows, no gradients, no rounded corners, no icons
  except plain text symbols (+, minus sign, x).
- Hairline 1px borders separate sections; tables and lists over cards.
- Uppercase `.label` micro-headers (11px, letter-spacing 0.08em) above data.
- One `.btn-primary` (red) per view; all else `.btn` (white, black border).
- Microcopy tone: short, factual Norwegian bokmål ("Legg i kurv", "Hent
  torsdag 24. juli"). No exclamation marks, no em-dashes.
- Mobile-first: single column below 640px, max content width 960px.
