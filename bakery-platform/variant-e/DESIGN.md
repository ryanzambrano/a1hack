# Variant E — "Nordisk" (classic Nordic)

Team E design direction. All four pages must feel like one shop. Load
`./styles/theme.css` FIRST on every page, then your page stylesheet.

## Mood
Scandinavian functionalism: cool light gray surfaces, crisp white cards,
fjord-blue accent, clear hierarchy, zero ornament. It should feel like a
well-run public service: calm, trustworthy, effortless. Vipps-era Norwegian
digital design.

## Tokens (defined in styles/theme.css — use the variables, never raw hex)
- Background `--bg` #F4F6F8 (cool gray), cards `--surface` #FFFFFF
- Text `--ink` #22272B, muted `--ink-soft` #5E6A72
- Accent `--accent` #1D5D9B (fjord blue), borders `--line` #DDE3E8
- Radius `--radius` 8px, subtle shadow, system sans everywhere.

## Rules
- Clear vertical rhythm: sections separated by whitespace, not lines.
- White cards on the gray background carry all content; 8px corners.
- Blue for primary buttons, links and selected states; gray for the rest.
- Status uses the semantic tones (`--ok`, `--warn`) as quiet pill badges.
- Buttons are rectangular with 8px radius, medium weight, no uppercase.
- Microcopy tone: plain, helpful Norwegian bokmål ("Velg hentedag",
  "Bestillingen er bekreftet"). Sober, no exclamation marks, no em-dashes.
- Mobile-first: single column below 640px, max content width 1080px.
