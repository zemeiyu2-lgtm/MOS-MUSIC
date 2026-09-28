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
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  const results = [];

  try {
    await page.goto("http://127.0.0.1:1420/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__app), null, { timeout: 30_000 });

    for (const songId of SONGS) {
      const result = { songId, status: "FAIL" };
      try {
        const score = readScore(songId);
        const sourceMeasures = (score.sections?.[0]?.measures ?? [])
          .filter((m) => (m.beats?.length ?? 0) > 0);
        const sourceNotes = sourceMeasures.reduce(
          (n, m) => n + (m.beats?.length ?? 0), 0,
        );

        const jpw = fs.readFileSync(
          path.join(ROOT, "content", "production", "packages", songId, "score.jpwabc"),
          "utf8",
        );
        const titleLine = jpw.split(/\r?\n/).find((x) => x.startsWith("Title = ")) ?? "";
        const expectedTitle = titleLine.slice("Title = ".length);

        await page.evaluate(({ text, id }) => {
          window.__app.loadText(text, id + ".jpwabc");
        }, { text: jpw, id: songId });

        await page.waitForFunction(
          (title) => window.__app?.painterTitle === title,
          expectedTitle,
          { timeout: 30_000 },
        );
        await page.waitForFunction(
          () => Boolean(
            window.__app?.painter?.pageCount > 0 &&
            document.querySelector(".score-page-wrap svg")
          ),
          null,
          { timeout: 30_000 },
        );

        const expectedLyrics = sourceMeasures
          .flatMap((m) => (m.beats ?? []))
          .filter((b) => b.syllable && b.lyric_status !== "melisma")
          .map((b) => b.syllable);

        const inspected = await page.evaluate((expectedLyricSequence) => {
          const app = window.__app;
          const doc = app.jpwDoc;
          if (!doc) throw new Error("jpwDoc=null");

          const dpart = doc.songs?.[0]?.parts?.[0];
          const dmeasures = dpart?.measures ?? [];
          const docNotes = dmeasures.reduce(
            (n, m) => n + m.elements.filter((e) => e.kind === "chord").length, 0,
          );
          const docLyricSequence = dmeasures.flatMap((m) =>
            m.elements.flatMap((e) =>
              e.kind === "chord"
                ? (e.lyrics ?? []).filter((x) => x.number === 1).map((x) => x.text)
                : [],
            )
          );
          const docLyrics = docLyricSequence.length;

          const score = app.painter.score;
          const part = score.parts?.[0];
          const measures = part?.measures ?? [];
          const scoreNotes = measures.reduce(
            (n, m) => n + m.entries.filter((e) => e.kind === "chord").length, 0,
          );
          const scoreLyrics = measures.reduce(
            (n, m) => n + m.entries.reduce(
              (k, e) => k + (
                e.kind === "chord"
                  ? e.notes.reduce((q, nt) => q + (nt.lyrics?.length ?? 0), 0)
                  : 0
              ), 0,
            ), 0,
          );

          const pageCount = app.painter.pageCount;
          const domPages = document.querySelectorAll(".score-page-wrap").length;
          const domSvgs = document.querySelectorAll(".score-page-wrap svg").length;
          const svg0 = app.painter.renderPage(0);

          return {
            title: score.title ?? null,
            expectedLyrics: expectedLyricSequence,
            docLyricSequence,
            docMeasures: dmeasures.length,
            docNotes,
            docLyrics,
            scoreMeasures: measures.length,
            scoreNotes,
            scoreLyrics,
            pageCount,
            domPages,
            domSvgs,
            renderedSvgLength: svg0.outerHTML.length,
            firstSvgBox: svg0.getAttribute("viewBox"),
          };
        }, expectedLyrics);

        Object.assign(result, {
          sourceMeasures: sourceMeasures.length,
          sourceNotes,
          expectedTitle,
          ...inspected,
        });

        const valid =
          inspected.docNotes === sourceNotes &&
          inspected.scoreNotes === sourceNotes &&
          inspected.docLyricSequence.join("\u0000") === inspected.expectedLyrics.join("\u0000") &&
          inspected.pageCount > 0 &&
          inspected.domPages === inspected.pageCount &&
          inspected.domSvgs === inspected.pageCount &&
          inspected.renderedSvgLength > 500 &&
          Boolean(inspected.firstSvgBox);

        result.status = valid ? "PASS" : "FAIL";
        result.validation = {
          noteCountMatch: inspected.docNotes === sourceNotes,
          lyricSequenceMatch: inspected.docLyricSequence.join("\u0000") === inspected.expectedLyrics.join("\u0000"),
          docLyricsObserved: inspected.docLyrics,
          painterNoteCountMatch: inspected.scoreNotes === sourceNotes,
          painterLyricsObserved: inspected.scoreLyrics,
          pagesRendered: inspected.pageCount > 0,
          domPageMatch: inspected.domPages === inspected.pageCount,
          domSvgMatch: inspected.domSvgs === inspected.pageCount,
          svgLooksValid: inspected.renderedSvgLength > 500 && Boolean(inspected.firstSvgBox),
        };

        if (inspected.pageCount > 0) {
          await page.screenshot({
            path: path.join(OUT, songId + "-page1.png"),
            fullPage: false,
          });
        }
      } catch (err) {
        result.error = String(err?.message ?? err);
      }

      fs.writeFileSync(
        path.join(OUT, songId + "-summary.json"),
        JSON.stringify(result, null, 2) + "\n",
      );
      results.push(result);
      console.log(JSON.stringify(result));
    }
  } finally {
    await browser.close();
  }

  const summary = {
    schema_version: "MUS-MUSIC-JPWABC-RENDER-1.0",
    jpeditor_commit: "4147f58f3a09e7d8656bb14e028d0daa4e51620a",
    results,
    all_pass: results.length === SONGS.length && results.every((x) => x.status === "PASS"),
  };
  fs.writeFileSync(
    path.join(OUT, "summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );
  console.log(JSON.stringify(summary));

  if (!summary.all_pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err?.stack ?? err);
  process.exit(1);
});
