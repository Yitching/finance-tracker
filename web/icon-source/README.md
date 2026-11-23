# App icon: Lazy coin

The sources for the PNGs in `web/public/`:

- `lazy-coin.svg`: the full icon, used for `icon-coin-192.png`, `icon-coin-512.png`, `apple-touch-icon-coin.png` (180) and `favicon-coin.png` (64).
- `lazy-coin-maskable.svg`: the same art scaled to 80% so it fits Android's round mask, used for `icon-coin-maskable-512.png`.

The file names change whenever the icon changes, so browsers, the offline cache and Android fetch the new one instead of a cached copy.

To change the icon, edit the SVGs and re-export each PNG at its size. Any SVG-to-PNG tool works, e.g. a headless browser screenshot.
