# BuildTrack media starter — candidates for UI redesign

Prepared 2026-10-05. No website changes or deployment have been made.

## Install

Extract this ZIP. Copy the contents of BuildTrack_Media_Starter into your local BuildTrackProject folder, merging the existing design/ and public/ directories. This adds uniquely named media assets; it does not replace application code. Keep README.md and ASSET_SOURCES.json with the asset documentation (for example in design/media-source/).

## Included

- public/media/construction-wide.webp: landscape construction photo, 1920×1280.
- public/media/tower-crane.webp: portrait crane photo, 1280×1920.
- public/media/construction-hero-candidate.mp4: an 8-second excerpt from seconds 4–12, H.264, 1280×720, 24 fps, no audio, fast-start. A candidate, not guaranteed to loop seamlessly.
- public/media/construction-hero-poster.jpg: matching still fallback from second 4.
- design/media-source/: downloaded source renditions (two JPEGs and the 28.33-second 720p clip). These are not the full-resolution originals.
- ASSET_SOURCES.json: creators, source pages, licence link, download sizes and SHA-256 checksums.

## Usage and provenance

The Pexels License page was checked on 2026-10-05. It allows free website use and modification; attribution is optional but appreciated. Do not imply that depicted people or brands endorse BuildTrack. Other restrictions apply; consult the linked licence. These files remain under the Pexels License, not the application's own licence.

Use these as stock illustrations, never as BuildTrack completed projects, customers, partner evidence, or photographs of Philippine sites. Location and releases were not independently verified. Crane/equipment brand names are visible in some media; avoid layouts suggesting endorsement.

## Implementation guidance for the redesign

Keep the static poster visible when video is disabled or unavailable. Respect reduced motion and provide a pause control for persistent motion. Do not make content dependent on video playback. Prefer a still on constrained mobile connections. Use responsive photo sizes and explicit dimensions. Do not load source videos into the page; use the compressed derivative if the visual review approves it.

The desktop/mobile product mockup should use BuildTrack's own demo screenshots, clearly marked simulated. Do not use stock dashboard screenshots as evidence of product behavior.

Before publishing, visually review the entire clip and intended crops, then record selected assets in the existing UX_BRAND asset log. These are starter candidates, not a final art direction.
