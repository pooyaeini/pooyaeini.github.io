# Pooya Eini, MD · Personal Academic Website

An interactive, scroll-driven 3D journey through the cardiovascular system (whole body, heart,
great vessels, pulmonary microcirculation, arterial lumen, atherosclerosis, thrombosis), with each
chapter holding the research whose clinical question lives at that anatomical scale.

Static site, no build step. Deploys as is on Vercel or GitHub Pages.

- `index.html` · page structure and chapter copy
- `styles.css` · dark theme and layout
- `js/publications.js` · **edit this file to add or update publications** (territory, role, DOI)
- `js/main.js` · scroll mapping, publication rendering, labels, HUD
- `js/gl/*.js` · three.js scenes (body, heart, arteries, micro, lumen) and the orchestrating `world.js`
- `vendor/three` · three.js r170 (MIT), served locally

Run locally with any static server, for example `python3 -m http.server`, then open http://localhost:8000.
