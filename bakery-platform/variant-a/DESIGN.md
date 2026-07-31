# Variant A — "Håndverk" (warm / rustic)

Team A design direction. All four pages must feel like one shop. Load
`./styles/theme.css` FIRST on every page, then your page stylesheet.

## Mood
A neighborhood craft bakery: warm, floury, honest. Cream paper background,
espresso-brown text, terracotta accent. Serif headings, soft rounded corners.
Think wood counters and parchment, not tech.

## Tokens (defined in styles/theme.css — use the variables, never raw hex)
- Background `--bg` #FAF6F0 (cream), cards `--surface` #FFFFFF
- Text `--ink` #3E2F25 (espresso), muted `--ink-soft` #8A776A
- Accent `--accent` #C2571B (terracotta), hover `--accent-strong` #A34412
- Success `--ok` #4C7A3F, borders `--line` #E8DFD3
- Radius `--radius` 12px, headings serif (Georgia stack), body system sans

## Rules
- Generous padding, soft shadows only (`--shadow`), no hard black lines.
- Primary actions use `.btn.btn-primary` (terracotta). One primary per view.
- Prices in the serif heading font, e.g. `<span class="price">kr 349</span>`.
- Product cards: image on top, name, short description, price. Rounded 12px.
- Microcopy tone: warm and personal Norwegian bokmål ("Velkommen inn!",
  "Vi gleder oss til å bake for deg"). No em-dashes anywhere.
- Mobile-first: single column below 640px, max content width 1040px.
