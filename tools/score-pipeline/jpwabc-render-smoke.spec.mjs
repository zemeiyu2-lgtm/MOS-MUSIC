import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const SONGS = ["MUS-S-0001", "MUS-S-0002", "MUS-S-0004"];

function readScore(songId) {
  const p = path.resolve(process.cwd(), "..", "content", "production", "packages", songId, "score.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

for (const songId of SONGS) {
  test(`JPWABC actual parser + SVG render: ${songId}`, async ({ page }, testInfo) => {
    const score = readScore(songId);
    const sourceMeasures = score.sections?.[0]?.measures ?? [];
    const sourceNotes = sourceMeasures.reduce((n, m) => n + (m.beats?.length ?? 0), 0);

    await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__app), null, { timeout: 30_000 });

    const result = await page.evaluate(async (id) => {
      const text = await fetch(`/mos-test/${id}.jpwabc`).then((r) => {
        if (!r.ok) throw new Error(`jpwabc fetch failed: ${r.status}`);
        return r.text();
      });

      const app = window.__app;
      app.loadText(text, `${id}.jpwabc`);

      // Wait for the editor's reactive reload/painter cycle.
      await new Promise((resolve) => setTimeout(resolve, 800));

      const j = await window.__j123;
      const file = j.JpwFile.fromString(text);
      if (!file) throw new Error("JpwFile.fromString returned null");

      const source = j.readJpwSource(file);
      const pageCount = app.painter.pageCount;
      const domSvgs = document.querySelectorAll(".score-page-wrap svg").length;
      const renderedSvg = pageCount > 0 ? app.painter.renderPage(0).outerHTML : "";
      const firstSvg = document.querySelector(".score-page-wrap svg");
      return {
        title: file.getTitle()?.title ?? null,
        meter: file.getTitle()?.meter ?? null,
        key: file.getTitle()?.key ?? null,
        tempo: file.getTitle()?.tempo ?? 0,
        sourceMeasures: source.measures.length,
        sourceNotes: source.measures.reduce(
          (n, m) => n + m.entries.filter((e) => e.kind === "note").length,
          0,
        ),
        lyricSegments: file.getLyric()?.segments.length ?? 0,
        passes: source.passes,
        pageCount,
        domSvgs,
        renderedSvgLength: renderedSvg.length,
        firstSvgBox: firstSvg?.getAttribute("viewBox") ?? null,
      };
    }, songId);

    expect(result.sourceMeasures).toBe(sourceMeasures.length);
    expect(result.sourceNotes).toBe(sourceNotes);
    expect(result.lyricSegments).toBeGreaterThan(0);
    expect(result.pageCount).toBeGreaterThan(0);
    expect(result.domSvgs).toBe(result.pageCount);
    expect(result.renderedSvgLength).toBeGreaterThan(1000);
    expect(result.firstSvgBox).toBeTruthy();

    await page.screenshot({
      path: testInfo.outputPath(`${songId}-page1.png`),
      fullPage: false,
    });

    await testInfo.attach(`${songId}-render-summary.json`, {
      body: Buffer.from(JSON.stringify(result, null, 2), "utf8"),
      contentType: "application/json",
    });
  });
}
