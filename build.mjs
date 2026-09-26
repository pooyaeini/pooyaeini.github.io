// Packages only the public site into dist/ so tooling and source assets never ship.
import { cp, mkdir, rm } from "node:fs/promises";

const publicPaths = ["index.html", "styles.css", "js", "vendor", "Pooya_Eini_CV.pdf", "assets/img/portrait.jpg"];
await rm("dist", { recursive: true, force: true });
for (const p of publicPaths) {
  await mkdir(`dist/${p}`.replace(/\/[^/]+\.[a-z]+$/, ""), { recursive: true });
  await cp(p, `dist/${p}`, { recursive: true });
}
console.log(`Packaged ${publicPaths.length} public paths into dist/`);
