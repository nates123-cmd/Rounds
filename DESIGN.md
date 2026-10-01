# Rounds, design constraints

Read this before changing anything visual.

## Reference

**The Zagat pocket guide, 1990s to 2000s.** A dense, typographic catalogue of
places: condensed bold names in caps, a neighborhood line in small caps, a
quoted line stitched from what people actually said, a small red mark for the
ones that made a list (Rounds spends that one accent in indigo). Cream paper, black ink, one accent. No pictures.

The thing to keep hold of: it is a *reference book you carry*, not a feed. Every
entry is scannable in one second, and the personality is in the quotes, which
here are Nate's and Amanda's own notes. If a change makes it look like a
discovery app (photos, cards, ratings, a map hero) it is wrong.

## Banned

- Photos or photo tiles in the list. The list is words. One photo is allowed in
  the place sheet only (2026-09-30), full sheet width, square corners, with
  its credit line under it.
- Star characters or numeric ratings of any kind. Google's rating is noise and
  is never shown. Status is a word: to try, favorite, tried, pass.
- Bordered rounded cards. Entries are separated by hairline rules only.
- Border radius above 2px anywhere.
- Box shadows, gradients.
- Inter, Roboto, Space Grotesk, Poppins, or a bare system stack as display.
- Emoji. Icons beside labels. A glyph appears only when it carries meaning alone.
- A map as the primary surface. "Go" hands off to Google Maps.

## Colour: cream paper, indigo accent (2026-10-01)

History: the moodboard deck notes ("Dark mode; try a blue or indigo") led to
an indigo-night ground on 2026-09-30. Nate, a day later: "I don't like the
colors as much. Can we make the indigo the accent rather than the
background?" So the ground went back to Zagat cream and indigo replaced red
as the one accent. The theme follows the phone: light is cream, dark is warm
near-black, never indigo. Who owns what:

- **Zagat pocket guide** owns the ground (cream paper, black ink), type,
  density and the quoted notes.
- **The Infatuation + NYT 100 Best** (both blue, sampled `#3C63EF` and
  `#599EE3`) own the accent, taken darker to indigo so it holds on cream.
- **Old NYC menus** own the devices: the dot leader and the double rule.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--color-bg` | `#F1EADB` | `#191511` | Page ground, cream paper. |
| `--color-bg-raised` | `#F8F3E7` | `#221D17` | Inputs, the capture bar. |
| `--color-ink` | `#1C1712` | `#EFE6D3` | Names, notes, rules. |
| `--color-ink-2` | `#55493B` | `#C2B49C` | Neighborhood line, meta. |
| `--color-ink-3` | `#8A7D6A` | `#8C7F6B` | Tags, counts, placeholders, leader dots, "closed". |
| `--color-rule` | `#CFC3AA` | `#3C332A` | Hairlines between entries. |
| `--color-accent` | `#2F3B96` | `#9AA5FF` | Indigo as text or a line: HH, active tab, half the wordmark, focus. |
| `--color-badge` | `#2F3B96` | `#3E4BB0` | Indigo as a fill: list badges, Add a place. |
| `--color-accent-ink` | `#F8F3E7` | `#F4EEE0` | Text on an indigo fill. |
| `--color-danger` | `#A8321F` | `#E2674F` | Errors and Remove only. Never decoration. |
| `--color-warn-bg` | `#E9DDBE` | `#2E271C` | The "no why yet" flag. |

No colour outside this table enters the app. The indigo is spent on
provenance and time-sensitive facts (NYT Best, Infatuation, happy hour) and
the few controls that need to be found (active tab, Add a place), never on
decoration. "Closed" is quiet ink-3, not a colour: it is a state, not an alarm.
An INK-filled badge ("Rec · Nate") means a person vouched for it; that is the personal-versus-list distinction Nate asked for on 2026-09-16 and it must stay visually distinct from the indigo list badges. An indigo badge means the place is on a curated list Nate trusts; the keys live in
`src/lib/tags.js` `LIST_SOURCES`.

Filter chips are one style in every row: ink outline, ink fill when active. No indigo chips; indigo is reserved for badges, time-sensitive facts and the two controls above (Nate, 2026-09-17, on seeing three chip styles stacked).

## Photo and vibe line (2026-09-30, from the deck: "picture API? Vibe of place?")

- **Vibe line**: one italic line under the note, ink-2, smaller than the note.
  It is the room sentence from Google's Gemini review summary
  (`src/lib/vibe.js`), else Google's editorial line. The note is always the
  headline; the vibe line never replaces or outranks it, and is never quoted.
- **Photo**: one, in the place sheet, fetched live on open (`placePhotos`).
  Photo names expire, so nothing photo-related is stored on the row.
- **Honesty rules that outrank the design**: Google requires its disclosure
  shown wherever a generated summary appears ("Summarized with Gemini" as a
  tiny caps label after the vibe line), the photographer credited under the
  photo, and the report link offered beside the full summary in the sheet.
  Never trim these to tidy the layout.

## The motif: the menu price column

Every entry's name runs into a dotted leader that ends in moped minutes from
home (or straight-line miles when there is no route yet), set like the price
on an old NYC menu: display face, tabular digits, a small letterspaced unit.
It answers "how far" at a glance, which is the question the list exists for.
Distance never appears in the meta line too. Section breaks (masthead, tail
heads) are a 4px double rule, the menu's frame line.

If a change makes it look like a tech product (indigo grounds, glows,
gradients, blue on everything), it is wrong: indigo is a pen mark on paper,
not the paper.

## Type

- `--font-display`: **Archivo Narrow 700**, uppercase, for place names, the
  wordmark, chips, buttons, and all letterspaced labels.
- `--font-body`: **Archivo 400/500/600** for notes, meta, prose.
- Scale: wordmark 34, name 19, note 14.5, body 14, hood 12 caps, meta 12,
  tags 11, badge 10.5 caps. Stay on it.
- Digits in meta use `tabular-nums`.

## Layout

One column, max 560px, 16px gutters. Sticky masthead: wordmark and origin,
three view tabs, search, three chip rows (occasion, getting there, hood), a
4px double rule. Entries below as a grid: name and badge, hood line, tags, the
note, meta and the action. A fixed capture bar at the bottom.

## Rules for changes

Visual changes get rendered on a phone-width screen and looked at before they
ship. Add a tag to the vocabulary in `src/lib/tags.js`, never as a one-off.
