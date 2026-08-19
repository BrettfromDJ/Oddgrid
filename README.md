# Oddgrid — Pixel Type

A tool that renders a source onto a grid of dots and animates it. The source is
either **text** or an **uploaded image**; both are sampled the same way, so the
motion below applies to either, and the grid morphs between them.

## Sampling

Text or image is drawn into a canvas shrunk by one cell per pixel, so each pixel's
value *is* that cell's coverage. That single number becomes the dot's weight, which
drives its size. Opacity is tracked separately — it only says whether a dot exists —
so a mid-tone reads as a smaller dot rather than a smaller *and* fainter one.

For images, what gets read is selectable:

- **Shape** — transparency. Right for icons and logos; the dots trace the silhouette.
- **Light areas** / **Dark areas** — brightness. Right for photographs, which come out
  as a halftone: dot size carries the tone.

Transparency is detected on load and the mode is set accordingly, along with a
cutoff and contrast curve suited to that kind of image. `Its colours` samples each
dot's hue from the image instead of using one flat colour; the hue is normalised
because dot size is already carrying brightness.

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

Each dot's opacity is blended into its colour against the known background, so every
dot is opaque and dots sharing a colour draw as a single path. Colour and alpha are
quantised to keep the number of batches low. A full-bleed image at the finest cell is
capped at 24,000 dots, strongest first, so the frame rate stays high enough for the
motion to read.

## Running it

Open `index.html`. No build step, no dependencies.

## Controls

- Comma-separate the text to cycle through several words.
- `Space` advances the word.
- Drop or paste an image anywhere on the grid to switch to image mode.
- Each motion system has its own toggle; turning Morph off makes changes a hard cut.
