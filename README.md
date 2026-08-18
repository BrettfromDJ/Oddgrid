# Oddgrid — Pixel Type

A pixelated-text tool. Words are sampled onto a grid and drawn as dots, with three
motion systems layered on top:

**Morph** — when the word changes, the dots travel to their new positions instead of
cutting. Each target claims its nearest existing dot, so pixels the two words share
stay put and only the difference moves. Leftovers fade out, new ones fly in.

**Repel** — dots near the pointer are pushed away with a squared falloff. The pointer
position is smoothed, so the push trails the cursor rather than snapping to it.
Hold the pointer down to roughly double the force.

**Wave** — a travelling sine wave modulates dot size and brightness. Wavelength,
speed and angle are all adjustable.

## Running it

Open `index.html`. No build step, no dependencies.

## Controls

- Comma-separate the text to cycle through several words.
- `Space` jumps to the next word.
- Each motion system has its own toggle; turning Morph off makes word changes a hard cut.
