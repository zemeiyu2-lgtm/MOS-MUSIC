import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const SONGS = ["MUS-S-0001", "MUS-S-0002", "MUS-S-0004"];
const ROOT = path.resolve(process.cwd(), "..");
const OUT = path.resolve(process.cwd(), "mos-render-evidence");
fs.mkdirSync(OUT, { recursive: true });

function readScore(songId) {
  return JSON.parse(fs.readFileSync(
    path.join(ROOT, "content", "production", "packages", songId, "score.json"),
    "utf8",
  ));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const results = [];

  try {
    await page.goto("http://127.0.0.1:1420/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__app), null, { timeout: 30_000 });

    for (const songId of SONGS) {
      const score = readScore(songId);
      const sourceMeasures = score.sections?.[0]?.measures ?? [];
      const sourceNotes = sourceMeasures.reduce((n, m) => n + (m.beats?.length ?? 0), 0);

      const jpw = fs.readFileSync(
        path.join(ROOT, "content", "production", "packages", songId, "score.jpwabc"),
        "utf8",
      );
      const titleLine = jpw.split(/\r?\n/).find((x) => x.startsWith("Title = ")) ?? "";
      const expectedTitle = titleLine.slice("Title = ".length);

      await page.evaluate(({ text, id }) => {
        window.__app.loadText(text, `${id}.jpwabc`);
      }, { text: jpw, id: songId });

      await page.waitForFunction((title) => window.__app?.painterTitle === title, expectedTitle, {
        timeout: 30_000,
      });
      await page.waitForFunction(() =>
        Boolean(window.__app?.painter?.pageCount > 0 && document.querySelector(".score-page-wrap svg")),
        null,
        { timeout: 30_000 },
      );

      const result = await page.evaluate(async () => {
        const app = window.__app;
        const j = await window.__j123;
        const text = app.getText();
        const file = j.JpwFile.fromString(text);
        if (!file) throw new Error("JpwFile.fromString returned null");
        const source = j.readJpwSource(file);
        const pageCount = app.painter.pageCount;
        const domPages = document.querySelectorAll(".score-page-wrap").length;
        const domSvgs = document.querySelectorAll(".score-page-wrap svg").length;
        const svg0 = app.painter.renderPage(0);
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
          lyricPasses: source.passes,
          pageCount,
          domPages,
          domSvgs,
          renderedSvgLength: svg0.outerHTML.length,
          firstSvgBox: svg0.getAttribute("viewBox"),
        };
      });

      if (result.sourceMeasures !== sourceMeasures.length) {
        throw new Error(`${songId}: source measures ${result.sourceMeasures} != ${sourceMeasures.length}`);
      }
      if (result.sourceNotes !== sourceNotes) {
        throw new Error(`${songId}: source notes ${result.sourceNotes} != ${sourceNotes}`);
      }
      if (result.lyricSegments <= 0) throw new Error(`${songId}: no lyric segments`);
      if (result.pageCount <= 0) throw new Error(`${songId}: no rendered pages`);
      if (result.domPages !== result.pageCount) throw new Error(`${songId}: DOM page mismatch`);
      if (result.domSvgs !== result.pageCount) throw new Error(`${songId}: SVG page mismatch`);
      if (result.renderedSvgLength <= 1000) throw new Error(`${songId}: rendered SVG too small`);
      if (!result.firstSvgBox) throw new Error(`${songId}: rendered SVG has no viewBox`);

      await page.screenshot({
        path: path.join(OUT, `${songId}-page1.png`),
        fullPage: false,
      });
      fs.writeFileSync(
        path.join(OUT, `${songId}-summary.json`),
        JSON.stringify(result, null, 2) + "\n",
      );
      results.push({ songId, ...result });
      console.log(JSON.stringify({ songId, ...result }));
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(results, null, 2) + "\n");
  console.log("JPWABC actual parser + SVG render smoke: PASS");
}

main().catch((err) => {
  console.error(err?.stack ?? err);
  process.exit(1);
});
