// Cuts original vector layers out of the Figma SVG exports by region (no redrawing), keeping
// only the layers that intersect the region and the defs they reference.
// Usage: node apps/extension/scripts/extract-design-regions.js extension_figma_files
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const source = path.resolve(process.argv[2] ?? "extension_figma_files");
const destination = path.resolve(__dirname, "../src/popup/assets");

// [output file, Figma frame, [x, y, width, height] in frame pixels]
const REGIONS = [
  ["design-gift.svg", "Pop Up", [173, 86, 34, 33]],
  ["design-paused-hero.svg", "No Pop Up (When user clicks on the extention)", [0, 169, 600, 340]],
  ["design-done.svg", "Applying And Testing The Codes (1)", [123, 385.5, 49, 49]],
  ["design-arrow.svg", "Pop Up", [360.5, 717, 28, 28]],
  ["design-arrow-light.svg", "5", [380.9, 308.5, 29.1, 29.1]],
  ["design-tag.svg", "5", [120.3, 526.8, 13.9, 13.9]],
  ["design-pill-failed.svg", "Applying And Testing The Codes", [108, 638, 12, 12]],
  ["design-pill-testing.svg", "Applying And Testing The Codes", [203, 632, 24, 24]],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 600, height: 832 } });
  for (const [output, frame, region] of REGIONS) {
    const svg = fs.readFileSync(path.join(source, `${frame}.svg`), "utf8");
    await page.setContent(`<body style="margin:0">${svg}</body>`);
    const markup = await page.evaluate(([x, y, w, h]) => {
      const root = document.querySelector("svg");
      const skip = new Set(["defs", "clipPath", "mask", "filter", "linearGradient", "radialGradient", "pattern", "style"]);
      const leaves = [...root.querySelectorAll("*")].filter(
        (el) => !skip.has(el.tagName) && !el.closest("defs, clipPath, mask, pattern") && el.tagName !== "g",
      );
      for (const el of leaves) {
        const r = el.getBoundingClientRect();
        // Contained (with a little slack for antialiasing), not merely intersecting: a region
        // must not drag in the button/card/frame background that sits behind it.
        const slack = 2;
        const inside =
          r.left >= x - slack && r.right <= x + w + slack &&
          r.top >= y - slack && r.bottom <= y + h + slack;
        if (!inside) el.remove();
      }
      let removed = true;
      while (removed) {
        removed = false;
        for (const g of root.querySelectorAll("g"))
          if (!g.children.length) { g.remove(); removed = true; }
      }
      // Keep only referenced definitions (transitively).
      const defs = [...root.querySelectorAll("defs > *")];
      const byId = new Map(defs.map((d) => [d.id, d]));
      const used = new Set();
      const scan = (el) => {
        const text = el.outerHTML;
        for (const [, id] of text.matchAll(/(?:url\(#|href="#)([^)" ]+)/g)) {
          if (used.has(id) || !byId.has(id)) continue;
          used.add(id);
          scan(byId.get(id));
        }
      };
      for (const child of root.children) if (child.tagName !== "defs") scan(child);
      for (const d of defs) if (!used.has(d.id)) d.remove();
      root.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
      root.setAttribute("width", String(w));
      root.setAttribute("height", String(h));
      return root.outerHTML.replace(/>\s+</g, "><");
    }, region);
    fs.writeFileSync(path.join(destination, output), markup);
    console.log(`${output}: ${(markup.length / 1024).toFixed(1)} KB`);
  }
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
