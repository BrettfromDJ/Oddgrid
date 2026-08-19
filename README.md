# Oddgrid

Small tools, made as needed. `index.html` lists them.

## Pixel Type

A tool that renders a source onto a grid of dots and animates it. The source is
either **text** or an **uploaded image**; both are sampled the same way, so the
motion applies to either, and the grid morphs between them.

`index.html` is the home page — a list of the tools. Open it, or open a tool
directly. No build step, no dependencies.

## Getting it onto a page

`Copy code` produces a self-contained snippet carrying your current settings: a
`<div>`, the engine, and one call. Paste it into any HTML block (Webflow, Framer,
Squarespace, a hand-written page) and it runs live — no build, no CDN, no external
requests. `Save file` writes the same thing as a standalone page you can upload
and iframe.

The canvas is **transparent**: the snippet draws only the dots, so it sits on
whatever your page already has behind it. Nothing paints a background rectangle.
(The standalone file is a page in its own right, so that one keeps a dark ground.)

The snippet is around 16 KB for text. An image is re-encoded small and inlined,
which adds to that; the panel reports the size before you copy.

## Sampling

Text or image is drawn into a canvas shrunk by one cell per pixel, so each pixel's
value *is* that cell's coverage. That single number becomes the dot's weight, which
drives its size. Opacity is tracked separately — it only says whether a dot exists —
so a mid-tone reads as a smaller dot rather than a smaller *and* fainter one.

For images, what gets read is selectable:

- **Shape** — transparency. Right for icons and logos; the dots trace the silhouette.
- **Light areas** / **Dark areas** — brightness. Right for photographs, which come out
  as a halftone: dot size carries the tone.

Transparency is detected on load and the mode is set accordingly, along with a cutoff
and contrast curve suited to that kind of image. `Its colours` samples each dot's hue
from the image instead of using one flat colour; the hue is normalised because dot
size is already carrying brightness.

## Motion

**Morph** — when the source changes, dots travel to their new positions instead of
cutting. Each target claims its nearest unclaimed dot via a spatial hash, so pixels
the two frames share stay put and only the difference moves. Leftovers fade out, new
ones fly in. This works between two words, between two images, and between a word
and an image.

**Repel** — dots near the pointer are pushed away with a squared falloff. The pointer
position is smoothed, so the push trails the cursor rather than snapping to it.
Holding the pointer down roughly doubles the force.

**Wave** — a travelling sine wave modulates dot size and brightness. Wavelength,
speed and angle are adjustable.

## Rendering

One fill() per dot crawls at fine grids, so dots are bucketed by colour and by
quantised opacity: each bucket is one globalAlpha, one fillStyle and one path.
That keeps the canvas transparent, which pre-blending against a known background
could not. A full-bleed image at the finest cell is
capped at 24,000 dots, strongest first, so the frame rate stays high enough for the
motion to read.

## Layout

- `index.html` — the home page: a list of links, nothing else. Adding a tool is
  one `<li>`.
- `pixel-type.html` — the Pixel Type studio: controls, image loading, export.
- `oddgrid.js` — the engine behind Pixel Type. One self-contained function on
  purpose: the studio exports a standalone embed by stringifying it, so it must
  not reference anything outside itself.
- `.github/workflows/pages.yml` — publishes the repo to GitHub Pages. One-time
  setup: repo Settings → Pages → Source: **GitHub Actions**. The workflow token
  can't switch that on itself; after that every push deploys.

### Using the engine directly

```html
<div id="host" style="width:100%;height:420px"></div>
<script src="oddgrid.js"></script>
<script>
  const grid = OddgridEngine(document.getElementById("host"), {
    words: ["HELLO", "WORLD"],
    colour: "#FFB020",
    wave: { amp: 0.5 }
    // bg is null by default, which leaves the canvas transparent
  });
  grid.set({ cell: 14 });          // change anything at runtime
  grid.setImage("logo.png");       // or feed it an image
</script>
```

## Controls

- Comma-separate the text to cycle through several words.
- `Space` advances the word.
- Six preset dot colours, or pick any colour with the Custom swatch.
- Drop or paste an image anywhere on the grid to switch to image mode.
- Each motion system has its own toggle; turning Morph off makes changes a hard cut.
