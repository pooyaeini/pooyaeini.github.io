import { mkdir, copyFile, readFile, stat } from 'node:fs/promises';
import { dirname } from 'node:path';

// Explicit public allowlist: source frames, old video, tooling and credentials stay out of deployments.
const files = ['index.html', 'experience.css', 'experience.js', 'heart.js', 'Pooya_Eini_CV.pdf',
  'assets/bg/ezgif-frame-001.jpg', 'assets/img/portrait.jpg', 'assets/img/portrait-or.jpg',
  'assets/img/fig-cardiac.jpg', 'assets/img/fig-risk.jpg', 'assets/img/fig-eval.jpg', 'assets/img/fig-evidence.jpg'];
let total = 0;
for (const file of files) {
  const target = `dist/${file}`;
  await mkdir(dirname(target), { recursive: true });
  await copyFile(file, target);
  total += (await stat(file)).size;
}
const html = await readFile('index.html', 'utf8');
for (const [, url] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  if (/^(https?:|data:)/.test(url)) continue;
  if (!files.includes(url)) throw new Error(`Unpackaged resource: ${url}`);
}
for (const [value, label] of [['300', 'Citations'], ['10', 'h-index'], ['65', 'Articles']]) {
  if (!html.includes(`<strong>${value}<span>+</span></strong><span>${label}</span>`)) throw new Error(`Metric mismatch: ${label}`);
}
console.log(`Built ${files.length} public files, ${(total / 1024).toFixed(0)} KiB total (including CV and lazy images).`);
