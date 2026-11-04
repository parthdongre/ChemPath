# ChemPath Studio — Optical Liquid Glass on the Web

This feature recreates **key visual principles** of Apple's native
SwiftUI Liquid Glass and the floating-control aesthetic seen on Cluely.
It is written for ChemPath's **React website**, not for a SwiftUI desktop shell.

Apple's proprietary SwiftUI glassEffect modifier is unavailable on a normal
webpage. We are not using, reverse engineering or claiming to ship that
native renderer.

## What's implemented

The previous material was a translucent background, a decorative highlight
and a low-level turbulence filter on the *highlight*, not on the background.

The new browser material:

1. Measures each small floating surface when it mounts or changes size.
2. Builds a **signed-distance-field** displacement texture for that surface's
   exact dimensions and rounded corners.
3. Encodes X/Y displacement in R/G and edge illumination in B.
4. Adds a scoped SVG filter with three closely spaced red/green/blue
   displacement passes (chromatic fringing).
5. Applies that filter to the **live backdrop** behind the control in supported
   Chromium browsers. The graph stays interactive and is not duplicated.
6. Adds highlight, bevel and reflection layers, tracking the pointer through
   requestAnimationFrame without React rerenders.
7. Uses a stable frosted fallback on browsers where SVG references in
   backdrop-filter are not supported. An explicit **Reduce transparency**
   setting disables all optical layers without changing the layout.

No extra runtime dependencies or graph-algorithm changes were added.

## Supported browser behavior

| Environment | Expected appearance |
| --- | --- |
| Chrome / Edge / Chromium with SVG backdrop filters | Actual SDF refractive distortion behind the controls |
| Safari / WebKit | Accessible frosted glass and reflective bevel; SVG backdrop refraction may be unavailable |
| Firefox | Accessible frosted glass and reflective bevel |
| Reduced transparency, high contrast | Stable opaque surfaces; no optical distortion |
| Reduced motion | No elastic press animations or forced camera easing |

Browsers may change their SVG filter behavior. Verify a representative
environment visually rather than trusting CSS.supports alone.

## Where to see it

- Drag the floating graph toolbar by its dotted grip and move it over
  compound links to see actual refractive sampling of the changing backdrop.
  Double-click the grip to reset its position.
- Hover the **Map clarity / All links / Lens / Fit** floating toolbar over the
  reaction graph. The optical map is live because it samples the graph behind
  the controls instead of warping a decorative pseudo-element.
- The renderer toggle at the opposite corner, the graph status pill,
  and the command search surface also receive the material.
- Search/reaction result text, scientific measurements and the graph nodes
  remain sharp and are never distorted intentionally.

## Graph improvements in the same release

- Overview groups nearby, less prominent compounds into clickable cluster
  markers with truthful counts.
- Important high-degree compounds and route nodes remain unclustered.
- Clicking a marker smoothly zooms to its neighborhood.
- A bounded screen-space collision solver keeps nearby group bubbles from overlapping.
- Zooming into neighborhood/detail removes the grouping; **All links**
  still reveals the complete unmodified graph.
- A five-entry in-memory layout cache preserves the normalized ForceAtlas2
  positions when navigating out of and back into Explore. This does not
  persist across browser restarts or replace the C++ graph.

## Implementation map

- web/src/components/liquidOptics.js — shape-aware SDF texture generation
- web/src/components/StudioGlassEffects.jsx — scoped SVG filter management
- web/src/studio-liquid-optics.css — optical surfaces and fallbacks
- web/src/components/graphClusters.js — graph-only cluster grouping
- web/src/components/ClusterOverlay.jsx — interactive visual cluster markers
- web/src/components/graphLayoutCache.js — bounded in-memory layout cache
- web/src/components/SigmaNetwork.jsx — WebGL/cluster integration
- scripts/test-studio-optics.mjs — non-browser unit tests
- scripts/smoke-webgl.mjs — real Chromium interaction and screenshot checks

## References

- https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views
- https://aave.com/design/building-glass-for-the-web
- https://github.com/rdev/liquid-glass-react
- https://liquidglass.dev/
- https://cluely.com/

These references inform the optical design. ChemPath does not use Apple's
private APIs or copy Cluely's source code.
