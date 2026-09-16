# Rounds, design constraints

Read this before changing anything visual.

## Reference

**The Zagat pocket guide, 1990s to 2000s.** A dense, typographic catalogue of
places: condensed bold names in caps, a neighborhood line in small caps, a
quoted line stitched from what people actually said, a small red mark for the
ones that made a list. Cream paper, black ink, one red. No pictures.

The thing to keep hold of: it is a *reference book you carry*, not a feed. Every
entry is scannable in one second, and the personality is in the quotes, which
here are Nate's and Amanda's own notes. If a change makes it look like a
discovery app (photos, cards, ratings, a map hero) it is wrong.

## Banned

- Photos or photo tiles. The list is words.
- Star characters or numeric ratings of any kind. Google's rating is noise and
  is never shown. Status is a word: to try, favorite, tried, pass.
- Bordered rounded cards. Entries are separated by hairline rules only.
- Border radius above 2px anywhere.
- Box shadows, gradients.
- Inter, Roboto, Space Grotesk, Poppins, or a bare system stack as display.
- Emoji. Icons beside labels. A glyph appears only when it carries meaning alone.
- A map as the primary surface. "Go" hands off to Google Maps.

## Colour

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--color-bg` | `#F1EADB` | `#191511` | Page ground, cream paper. |
| `--color-bg-raised` | `#F8F3E7` | `#221D17` | Inputs, the capture bar. |
| `--color-ink` | `#1C1712` | `#EFE6D3` | Names, notes, rules. |
| `--color-ink-2` | `#55493B` | `#C2B49C` | Neighborhood line, meta. |
| `--color-ink-3` | `#8A7D6A` | `#8C7F6B` | Tags, counts, placeholders. |
| `--color-rule` | `#CFC3AA` | `#3C332A` | Hairlines between entries. |
| `--color-accent` | `#B4261C` | `#E2503F` | The one red: list badge, happy hour, active travel chip, half the wordmark. |
| `--color-warn-bg` | `#E9DDBE` | `#2E271C` | The "no why yet" flag. |

No colour outside this table enters the app. The red is spent on provenance
and time-sensitive facts (NYT Best, Infatuation, happy hour), never on decoration.
A red badge means the place is on a curated list Nate trusts; the keys live in
`src/lib/tags.js` `LIST_SOURCES`. Nate signed off on the Zagat look 2026-09-16.

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
2px black rule. Entries below as a grid: name and badge, hood line, tags, the
note, meta and the action. A fixed capture bar at the bottom.

## Rules for changes

Visual changes get rendered on a phone-width screen and looked at before they
ship. Add a tag to the vocabulary in `src/lib/tags.js`, never as a one-off.
