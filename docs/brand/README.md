# Silver brand mark

The mark is **Ag** — the chemical symbol for silver — set inside a square frame,
in the manner of a periodic table tile.

## Files

| File | Role |
| --- | --- |
| `ag-mark.txt` | The terminal mark. Authoritative. |
| `ag-figma-export.png` | Raster export from Figma, shared during design. Reference only. |

## Terminal mark

`ag-mark.txt` is **46 × 23 characters**.

| Property | Value |
| --- | --- |
| Frame character | `%` |
| Corner character | `*` (softens the four extreme corners) |
| Frame thickness | 1 column sides, 1 row top and bottom |
| Padding | 3 columns left, 5 columns right, 2 rows top and bottom |
| Letterform block | 36 × 17, shifted 1 column left of centre |

Two pieces of geometry are worth preserving if the mark is ever rebuilt.

**Cell aspect is assumed to be 0.5** — character cells are twice as tall as
wide, which is true of essentially every terminal (8×16, 9×18, 10×20). At that
ratio 46 × 23 is an exact square, matching the graphic mark. If you render this
in a browser `<pre>`, set `line-height: 1.2` so it displays at the same
proportions; the CSS default squashes it and the frame reads as a wide rectangle.

**The letterform is deliberately 1 column left of centre.** The A's lower-left
stroke reaches the block's first column while the g stops short of the last, so
geometric centring pushes the mark visibly right. Padding is 3 left / 5 right to
correct it.

The frame is one character thick on the sides but one row thick top and bottom,
which means the horizontal rules render twice as heavy as the vertical ones.
That is a deliberate trade: it buys even 4-unit optical margins on all four
sides and an exact square. Matching the border weight instead would need
2-column sides, which forces the horizontal padding tighter than the vertical.

## Colour

One hue at two lightness steps — a cool neutral at roughly 215°. A single
mid-tone cannot clear WCAG AA against both a black and a white terminal, so the
mark shifts lightness per ground while keeping the same hue family.

| Ground | Value | Contrast |
| --- | --- | --- |
| Dark terminal | `#C7CBD1` | 12.9:1 on `#000000` |
| Light terminal | `#5B6068` | 6.3:1 on `#FFFFFF` |

Both exceed AA. Reference tone for graphic use is `#9AA0A8`.

There is **one** ASCII file, not a light and a dark variant. The character data
is identical across themes; only the foreground colour changes. Do not fork it.

The installer reads the terminal ground from `COLORFGBG` when available and
uses the matching value above. If the ground is unknown, it uses `#74777B`,
which clears 4.5:1 against both pure black and pure white. `NO_COLOR` and
non-interactive output remain uncoloured so logs and machine consumers do not
receive ANSI escapes.

## Reproduction

The letterform was traced from the Figma artwork using ASCII Lab
(`/Users/jp/Projects/ascii-lab`), which converts artwork to a character grid via
a brightness-to-density ramp with adjustable oversampling, levels, and sub-cell
offset. Its **Copy settings JSON** button exports the exact parameter set — paste
those settings here if the letterform is ever regenerated, so the result stays
reproducible.

The frame was composed separately rather than traced, so that framing could
change without touching a single glyph character.

## Outstanding

An **outlined SVG** exported from the Figma source is still missing, and is what
the graphic mark should ultimately be. Export it with text converted to paths —
an SVG containing live `<text>` renders in whatever font the viewing environment
resolves, which for a mark that *is* a type specimen defeats the purpose.
