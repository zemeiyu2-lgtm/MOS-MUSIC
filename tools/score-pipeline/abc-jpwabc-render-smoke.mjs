import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "..");
const SOURCE_DIR = path.join(ROOT, "content", "production", "abc-jpwabc");
const EVIDENCE = path.resolve(process.cwd(), "mos-abc-render-evidence");
fs.mkdirSync(EVIDENCE, { recursive: true });

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function main() {
  const index = readJSON(path.join(SOURCE_DIR, "index.json"));
  const songs = index.results.filter((x) => x.status === "OK");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });

  const results = [];

  try {
    await page.goto("http://127.0.0.1:1420/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__app), null, { timeout: 30_000 });

    for (const item of songs) {
      const id = item.song_id;
      const result = { song_id: id, status: "FAIL" };

      try {
        const source = fs.readFileSync(
          path.join(SOURCE_DIR, id + ".jpwabc"),
          "utf8",
        );
        const titleLine = source
          .split(/\r?\n/)
          .find((x) => x.startsWith("Title = ")) ?? "";
        const expectedTitle = titleLine.slice("Title = ".length);

        await page.evaluate(({ text, id }) => {
          window.__app.loadText(text, id + ".jpwabc");
        }, { text: source, id });

        await page.waitForFunction(
          (title) => window.__app?.painterTitle === title,
          expectedTitle,
          { timeout: 30_000 },
        );

        await page.waitForFunction(
          () => Boolean(
            window.__app?.jpwDoc &&
            window.__app?.painter?.pageCount > 0 &&
            document.querySelector(".score-page-wrap svg")
          ),
          null,
          { timeout: 30_000 },
        );

        const inspected = await page.evaluate(() => {
          const app = window.__app;
          const doc = app.jpwDoc;
          const part = doc?.songs?.[0]?.parts?.[0];
          const measures = part?.measures ?? [];
          const docNotes = measures.reduce(
            (n, m) => n + m.elements.filter((e) => e.kind === "chord").length,
            0,
          );
          const docLyrics = measures.reduce(
            (n, m) => n + m.elements.reduce(
              (k, e) => k + (
                e.kind === "chord"
                  ? (e.lyrics?.length ?? 0)
                  : 0
              ),
              0,
            ),
            0,
          );
          const pageCount = app.painter.pageCount;
          const domPages = document.querySelectorAll(".score-page-wrap").length;
          const domSvgs = document.querySelectorAll(".score-page-wrap svg").length;
          const svg = app.painter.renderPage(0);

          return {
            title: app.painter.score.title,
            docMeasures: measures.length,
            docNotes,
            docLyrics,
            pageCount,
            domPages,
            domSvgs,
            svgLength: svg.outerHTML.length,
            viewBox: svg.getAttribute("viewBox"),
          };
        });

        Object.assign(result, {
          expectedTitle,
          ...inspected,
          expectedMeasures: item.measure_count,
          expectedNotes: item.note_count,
          expectedLyrics: item.lyric_item_count,
        });

        result.validation = {
          titleMatch: inspected.title === expectedTitle,
          measureMatch: inspected.docMeasures === item.measure_count,
          noteMatch: inspected.docNotes === item.note_count,
          lyricMatch: inspected.docLyrics === item.lyric_item_count,
          rendered: inspected.pageCount > 0,
          pageDomMatch: inspected.domPages === inspected.pageCount,
          svgDomMatch: inspected.domSvgs === inspected.pageCount,
          svgValid: inspected.svgLength > 500 && Boolean(inspected.viewBox),
        };

        result.status = Object.values(result.validation).every(Boolean) ? "PASS" : "FAIL";

        await page.screenshot({
          path: path.join(EVIDENCE, id + "-page1.png"),
          fullPage: false,
        });
      } catch (err) {
        result.error = String(err?.message ?? err);
      }

      fs.writeFileSync(
        path.join(EVIDENCE, id + ".json"),
        JSON.stringify(result, null, 2) + "\n",
      );
      results.push(result);
      console.log(JSON.stringify(result));
    }
  } finally {
    await browser.close();
  }

  const summary = {
    schema_version: "MUS-MUSIC-ABC-JPWABC-RENDER-1.0",
    jpeditor_commit: "4147f58f3a09e7d8656bb14e028d0daa4e51620a",
    requested: songs.length,
    passed: results.filter((x) => x.status === "PASS").length,
    failed: results.filter((x) => x.status !== "PASS").length,
    all_pass: results.length === songs.length && results.every((x) => x.status === "PASS"),
    results,
  };
  fs.writeFileSync(
    path.join(EVIDENCE, "summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );

  console.log(JSON.stringify({
    requested: summary.requested,
    passed: summary.passed,
    failed: summary.failed,
    all_pass: summary.all_pass,
  }));

  if (!summary.all_pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err?.stack ?? err);
  process.exit(1);
});
