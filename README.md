# Ascension EP — site clone

A front-end rebuild of https://ascension.pegassi.be/ for local use and study.
It reproduces the site's visible design, responsive layout, animations, and
interactions as closely as source inspection allowed.

All design, branding, text, images, audio, and video remain the property of
the original site owner (Pegassi / Sweet Nothing). This is an unaffiliated,
local reference build — do not publish or redistribute it.

## Run it

Any static file server works. From this folder:

    npx serve .
    # or
    python3 -m http.server 8000

Then open http://localhost:8000 (or the port shown).

## Media files

To keep the download small, the music tracks and the seven largest videos
were left out of the zip. Restore the exact original files with:

    bash download-assets.sh

The site still works without them: audio stays silent and the video slots
show the original still-image fallbacks.

## What's included

- Home, Listen, Sequencer, About, Buy, Privacy, Terms pages
- Global audio player (bottom bar, expandable track list, duck/restore under
  video audio)
- Intro overlay with grain, page-transition mask, scroll reveal animations
- Home cue hover video previews (desktop)
- Listen page: track switching, vinyl, waveforms, prev/next, media viewer
- Sequencer: 4 kits, 16-step grid, WebAudio scheduling, copy/paste, pattern
  slots, BPM control, localStorage persistence, share-link encode/decode
- Buy page: technical specs toggle, sleeve drag, cover lightbox
- Mobile menu sheet, site-credits popover

## Known differences from the live site

- The live site's WebGL hero/record effects are replaced by the site's own
  static fallbacks (the same images it serves to browsers without WebGL).
- Buy is front-end only: the live "Sold out" state is reproduced; there is
  no store backend.
- The small hover film-strip clips on the Listen page are not bundled
  (large files); still frames are shown instead.
- Site-credits popover content is approximated; it is not recoverable from
  the served source.
