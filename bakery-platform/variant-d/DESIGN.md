# Variant D — "Lekent" (playful)

Team D design direction. All four pages must feel like one shop. Load
`./styles/theme.css` FIRST on every page, then your page stylesheet.

## Mood
Sugar and confetti, but tasteful: blush background, white cards with big 20px
rounded corners, raspberry accent, chunky friendly buttons. The shop should
make you smile without being childish. Motion limited to gentle hover lifts.

## Tokens (defined in styles/theme.css — use the variables, never raw hex)
- Background `--bg` #FFF3F0 (blush), cards `--surface` #FFFFFF
- Text `--ink` #4A2C2A (cocoa), muted `--ink-soft` #9C7B76
- Accent `--accent` #E0457B (raspberry), secondary `--mint` #DDF2E9
- Borders `--line` #F3DAD3, radius `--radius` 20px, pill buttons.

## Rules
- Big rounded corners everywhere (cards 20px, buttons full pill).
- Soft colored shadows (`--shadow`), gentle hover lift on cards
  (translateY(-2px), transition 0.15s). Nothing else animates.
- Chunky primary button (raspberry, white text, bold, generous padding).
- Use the mint tone for secondary highlights (badges, selected states).
- Microcopy tone: cheerful Norwegian bokmål, may use one exclamation mark
  where natural ("Mmm, godt valg!"). Never use em-dashes.
- Mobile-first: single column below 640px, max content width 1000px.
