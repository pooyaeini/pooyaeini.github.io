# Pooya Eini — Vercel edition

Production: https://pooya-eini.vercel.app

Published successfully with the Vercel CLI to project `aizzx/pooya-eini`. The live page, CSS, JavaScript, heart artwork, and CV were verified over HTTPS. Automatic GitHub integration was not connected: Vercel rejected the repository connection during setup. Connect the repository in the project's Git settings and set `vercel-redesign` as the production branch before relying on push-to-deploy. Until then, publish updates with `npx vercel --prod` from this checkout.

## Publish

Import `pooyaeini/pooyaeini.github.io` into Vercel and select the `vercel-redesign` branch as the production branch. Use the repository root, framework **Other**, build command `node build.mjs`, and output directory `dist`. No environment variables or external services are required.

Alternatively, from this directory run `npx vercel login`, then `npx vercel --prod`. The checked-in `vercel.json` supplies the build settings. Once Vercel reports a ready production deployment, its assigned domain can be used as the new public URL. The existing github.io address will continue serving its current main branch until a redirect is separately configured.

## Edit and verify

- `index.html`: profile, research, publications, manually maintained metrics, and links.
- `experience.css`: responsive layout and visual system.
- `experience.js`: navigation, accessible publication filtering, and content reveals.
- `heart.js`: WebGL particle relief using the existing heart artwork. The depth is artistic; this is not a full anatomical mesh or a diagnostic illustration.
- `npm run check`: JavaScript syntax, public asset availability, exact metrics, and deployment packaging.

The build has no third-party runtime dependencies. It packages only explicitly selected public files. The old MP4, source image sequence, and obsolete scripts are retained in source control but excluded from deployment.

The scene connects the original particle heart relief to shaded arterial and venous tube meshes. Scroll position moves and banks the camera through progressively finer branches; pointer position controls a subtle orbit. Moving highlights convey flow. Desktop content reserves a right-hand visual column; smaller screens use opaque text panels over the scene. Persistent chapter links and a pause button control the journey. This is an artistic vascular network, not a diagnostic anatomical model. Rendering targets 30 fps at rest and 60 fps during camera movement, pauses in hidden tabs, and caps pixel density at 1.5. Phones use fewer particles and lower-resolution tube meshes. Reduced-motion preferences and unavailable WebGL use the original static heart artwork. Content remains usable without JavaScript.

Metrics supplied September 2026: citations 300+, h-index 10+, articles 65+. The previously supplied i10-index remains 14; these values do not automatically synchronize with Google Scholar.

No browser preview or visual performance measurement was run, per the owner's preference. Verify the appearance and motion on a real phone after publishing.
