# Practice character assets

Drop a transparent animated WebP or GIF into this directory to replace the
provisional reaction PNGs. Animated WebP is checked first, then GIF. The
tutorial loads these state names automatically:

- `shu-idle.gif`
- `shu-point.gif`
- `shu-explain.gif`
- `shu-surprise.gif`
- `shu-cheer.gif`
- `shu-gone.gif`
- `miu-idle.gif`
- `miu-ready.gif`
- `miu-thinking.gif`
- `miu-accept.gif`
- `miu-reject.gif`
- `miu-panic.gif`
- `miu-gone.gif`
- `miu-shock.gif`
- `miu-lose.gif`

Keep the character centered on a transparent canvas. A square canvas is the
easiest drop-in shape.

`provisional/` contains the twelve reaction PNGs cut from the supplied review
sheet. They are used for placement and size checks until a state-specific
animated asset is added. Some states intentionally share the nearest matching
provisional reaction.

When reduced motion is enabled, the tutorial uses the matching provisional
still PNG. If an asset cannot be loaded, the built-in CSS bear remains the last
fallback.
