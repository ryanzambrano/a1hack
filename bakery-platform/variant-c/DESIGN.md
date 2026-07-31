# Variant C — "Tidsskrift" (editorial)

Team C design direction. All four pages must feel like one shop. Load
`./styles/theme.css` FIRST on every page, then your page stylesheet.

## Mood
A food magazine spread: big confident serif headlines, thin horizontal rules,
numbered sections, plenty of air. Paper-white background, near-black text,
deep bordeaux accent. The product list reads like a menu, not a grid of boxes.

## Tokens (defined in styles/theme.css — use the variables, never raw hex)
- Background `--bg` #FCFBF8 (paper), text `--ink` #1A1A1A
- Accent `--accent` #7A1F2B (bordeaux), muted `--ink-soft` #6E6A63
- Rules `--line` #D8D4CC, radius `--radius` 2px
- Display serif for headlines (`--font-head`, Georgia stack), sans for UI.

## Rules
- Headlines are LARGE (h1 up to 2.6rem desktop) and serif; body copy sans.
- Thin 1px rules (`.rule`) structure the page like magazine columns.
- Use dotted leader lines or right-aligned prices in menu-style lists.
- Accent color for links, active states and the single primary button.
- Small caps / uppercase kickers (`.kicker`) above headlines ("Fra ovnen").
- Microcopy tone: literate, calm Norwegian bokmål ("Dagens utvalg",
  "Kaken bakes til deg samme morgen"). No em-dashes.
- Mobile-first: single column below 680px, max content width 1100px.
