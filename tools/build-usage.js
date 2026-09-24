#!/usr/bin/env node
/* =========================================================
   MOS-MUSIC｜Music Library Usage Builder
   ---------------------------------------------------------
   从既有内容推导音乐库的**使用历史**（CI-0009 / §三 A）。

   数据来源（全部只读）：
     · content/songs/*.json            歌曲身份、神学主题、圣经表达、tier、生命周期
     · content/annual/2027/weeks/*.json  哪一周用了哪首歌、什么角色、什么功能
     · content/annual/2027/units/*.json  该周的歌曲关系 / 适配裁决 / 风险说明
     · docs/PHASE-2B-W04-DISCERNMENT.json  W04 全候选辨识留档
     · 已冻结技能的 examples/*.json      W01–W03 的辨识留档（只读引用；缺失则跳过）

   输出：content/production/library-usage.json
   用法：node tools/build-usage.js
   ========================================================= */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKILL_EXAMPLES = 'C:/Users/Administrator/.workbuddy/skills/mos-music-song-discernment/examples';

const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

function listDir(dir, re) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => re.test(f)).map((f) => path.join(dir, f)).sort();
}

function main() {
  const songsIndex = readJSON(path.join(ROOT, 'content/songs/index.json'));
  const annualIndex = readJSON(path.join(ROOT, 'content/annual/2027/index.json'));
  const weeks = annualIndex.weeks.map((w) => readJSON(path.join(ROOT, w.file)));
  const units = annualIndex.units.map((u) => readJSON(path.join(ROOT, u.file)));
  const unitByWeek = new Map(units.map((u) => [u.mos_week, u]));

  /* 辨识留档：W04（项目内）+ W01–W03（技能 examples，只读引用） */
  const runs = [];
  const w04Path = path.join(ROOT, 'docs/PHASE-2B-W04-DISCERNMENT.json');
  if (fs.existsSync(w04Path)) {
    const doc = readJSON(w04Path);
    for (const c of doc.candidates || []) {
      runs.push({
        week: doc.week, song_id: (c.song_id || String(c.candidate_song).split(' ')[0]),
        source: 'discernment_run', ref: 'docs/PHASE-2B-W04-DISCERNMENT.json',
        decision: c.decision, song_relation: c.song_relation,
        week_fit: c.week_fit_verdict_code, tier: c.tier, review_status: c.review_status,
        risk_codes: (c.risks || []).map((r) => r.code),
        risk_records: (c.risks || []).map((r) => ({ code: r.code, severity: r.severity, message: r.message })),
      });
    }
  }
  if (fs.existsSync(SKILL_EXAMPLES)) {
    for (const f of listDir(SKILL_EXAMPLES, /\.json$/)) {
      const r = readJSON(f);
      runs.push({
        week: r.week,
        song_id: String(r.candidate_song || '').split(' ')[0],
        source: 'frozen_run_record',
        ref: `mos-music-song-discernment/examples/${path.basename(f)}`,
        decision: r.decision, song_relation: r.song_relation,
        week_fit: r.week_fit_verdict_code, tier: r.tier, review_status: r.review_status,
        risk_codes: (r.risks || []).map((x) => x.code),
        risk_records: (r.risks || []).map((x) => ({ code: x.code, severity: x.severity, message: x.message })),
      });
    }
  }

  /* 库级辨识留档与升层声明：详情层与登记层共用同一份，避免两处各自解释。 */
  const registryPath = path.join(ROOT, 'content/library/registry.json');
  const registry = fs.existsSync(registryPath) ? readJSON(registryPath) : { records: [] };
  const libScopePath = path.join(ROOT, 'content/production/song-discernment-v0.5.json');
  const libScope = fs.existsSync(libScopePath) ? readJSON(libScopePath) : { results: [] };
  const libScopeById = new Map((libScope.results || []).map((r) => [r.song_id, r]));
  const promPath = path.join(ROOT, 'content/production/library-promotions.json');
  const promotedIds = new Set(((fs.existsSync(promPath) ? readJSON(promPath) : {}).promotions || [])
    .map((p) => p.song_id));

  const detailSongs = songsIndex.songs.map((row) => {
    const rec = readJSON(path.join(ROOT, 'content/songs', `${row.song_id}.json`));
    const usedIn = [];
    for (const w of weeks) {
      const u = unitByWeek.get(w.mos_week);
      if (w.core_song_id === row.song_id) {
        usedIn.push({
          week: w.mos_week, week_id: w.week_id, role: 'core',
          bible_passage: w.bible_passage_id, life_question: w.life_question_id,
          music_function: w.music_function,
          song_relation: u ? u.review_gate.song_relation : null,
          unit_gate: u ? u.review_gate.theological_review : null,
        });
      }
      if ((w.auxiliary_song_id || []).includes(row.song_id)) {
        usedIn.push({
          week: w.mos_week, week_id: w.week_id, role: 'auxiliary',
          bible_passage: w.bible_passage_id, life_question: w.life_question_id,
          music_function: w.music_function,
          song_relation: null,
          unit_gate: u ? u.review_gate.theological_review : null,
        });
      }
    }

    const history = runs.filter((r) => r.song_id === row.song_id)
      .map((r) => ({
        week: r.week, source: r.source, ref: r.ref,
        decision: r.decision, song_relation: r.song_relation, week_fit: r.week_fit,
        tier: r.tier, review_status: r.review_status, risk_codes: r.risk_codes,
      }));

    const riskRecords = runs.filter((r) => r.song_id === row.song_id)
      .flatMap((r) => (r.risk_records || []).map((x) => ({
        week: r.week, code: x.code, severity: x.severity, message: x.message,
        source: r.source,
      })));

    const unitRiskNotes = weeks
      .map((w) => ({ w, u: unitByWeek.get(w.mos_week) }))
      .filter(({ u }) => u && (u.core_song === row.song_id || (u.auxiliary_song_id || []).includes(row.song_id)))
      .filter(({ u }) => u.review_gate.theological_risk)
      .map(({ w, u }) => ({ week: w.mos_week, text: u.review_gate.theological_risk }));

    /* 库级辨识只作为单独字段记录，不计入 discernment_history，
       以免把「证据不足」误记成「已完成辨识」。升层后该字段同时挂在详情层条目上，
       但升层不等于完成辨识，所以仍不进 discernment_history。 */
    const scope = libScopeById.get(rec.song_id) || null;
    const scopeResult = (history.length === 0 && scope) ? {
      ref: 'content/production/song-discernment-v0.5.json',
      scope: scope.scope,
      decision: scope.decision,
      song_relation: scope.song_relation,
      week_fit: scope.week_fit_verdict_code,
      missing_evidence: scope.missing_evidence,
    } : null;

    return {
      song_id: rec.song_id,
      title: rec.title,
      layer: 'detail',
      promoted: promotedIds.has(rec.song_id),
      tier: rec.tier,
      review_status: rec.review_status,
      primary_function: rec.formation.primary_function,
      secondary_functions: rec.formation.secondary_functions || [],
      main_theme: rec.discipleship.main_theme,
      core_passage: rec.bible.core_passage,
      theological_note: rec.theological_note || null,
      music_unit_refs: rec.discipleship.music_unit_refs || [],
      copyright_status: rec.copyright.copyright_status,
      used_in: usedIn,
      times_used: usedIn.length,
      times_as_core: usedIn.filter((x) => x.role === 'core').length,
      times_as_auxiliary: usedIn.filter((x) => x.role === 'auxiliary').length,
      reuse_status: usedIn.length === 0 ? 'never_used'
        : usedIn.length === 1 ? 'used_once' : 'used_multiple_times',
      discernment_status: history.length ? 'assessed' : 'not_assessed',
      discernment_history: history,
      library_scope_result: scopeResult,
      last_discernment_week: history.length ? history[history.length - 1].week : null,
      risk_records: riskRecords,
      high_risk_codes: [...new Set(riskRecords.filter((r) => r.severity === 'HIGH').map((r) => r.code))],
      unit_risk_notes: unitRiskNotes,
      version: rec.version,
    };
  });

  /* V0.5 扩库：仍在登记层的歌曲并入使用历史（§九：新增歌曲一律「未使用」）。
     它们没有歌曲详情记录，因此身份以外的字段一律为 null —— 不用常识补满。 */
  const detailIds = new Set(detailSongs.map((s) => s.song_id));

  const intakeSongs = (registry.records || [])
    .filter((r) => !detailIds.has(r.song_id))
    .map((r) => {
      const scope = libScopeById.get(r.song_id) || null;
      return {
        song_id: r.song_id,
        title: r.title_en ? `${r.title_zh}（${r.title_en}）` : r.title_zh,
        layer: 'intake',
        promoted: false,
        tier: 'C',
        review_status: 'draft',
        primary_function: null,
        secondary_functions: [],
        main_theme: null,
        core_passage: null,
        theological_note: null,
        music_unit_refs: [],
        /* CI-0015 案 a：`copyright_status_mapped` 是**法律状态判定槽**（未判定 = unknown），
           不是由登记层映射而来；`copyright_status_v05` 才是登记层的来源与行动状态。 */
        copyright_status: r.copyright_status_mapped,
        copyright_status_v05: r.copyright_status,
        candidate_note: r.candidate_note || null,
        used_in: [],
        times_used: 0,
        times_as_core: 0,
        times_as_auxiliary: 0,
        reuse_status: 'never_used',
        discernment_status: 'not_assessed',
        discernment_history: [],
        library_scope_result: scope ? {
          ref: 'content/production/song-discernment-v0.5.json',
          scope: scope.scope,
          decision: scope.decision,
          song_relation: scope.song_relation,
          week_fit: scope.week_fit_verdict_code,
          missing_evidence: scope.missing_evidence,
        } : null,
        last_discernment_week: null,
        risk_records: [],
        high_risk_codes: [],
        unit_risk_notes: [],
        version: r.library_version,
      };
    });

  const songs = [...detailSongs, ...intakeSongs];

  const out = {
    usage_version: 'MUS-V-0.5.0',
    generated_at: new Date().toISOString(),
    generated_by: 'tools/build-usage.js',
    note: '音乐库使用历史。全部字段由周次与单元记录推导（不手工维护）；辨识留档来自 W04 项目留档与已冻结技能的 examples（只读引用）。V0.5 新增候选全部并入本表：其中仍在登记层的只记「未使用 / 未辨识」，其库级判定单独记为 library_scope_result；已升入详情层的同样未完成周辨识，也挂在同一字段上（升层不等于完成辨识）。',
    library_version: songsIndex.library_version,
    layer_defs: {
      detail: '有歌曲详情记录（身份 + 神学 + 圣经表达 + tier + 生命周期；八维可能仍未辨识）',
      intake: '只有入库登记记录（身份 + 来源 + 资源现状 + 版权状态）',
    },
    songs,
    summary: {
      total: songs.length,
      by_layer: {
        detail: detailSongs.length,
        intake: intakeSongs.length,
      },
      promoted: songs.filter((s) => s.promoted).length,
      used: songs.filter((s) => s.times_used > 0).length,
      never_used: songs.filter((s) => s.times_used === 0).length,
      reused: songs.filter((s) => s.times_used > 1).length,
      assessed: songs.filter((s) => s.discernment_status === 'assessed').length,
      library_scope_insufficient: songs.filter((s) => s.library_scope_result
        && s.library_scope_result.decision === 'Research').length,
      with_high_risk: songs.filter((s) => s.high_risk_codes.length > 0).length,
      weeks_covered: weeks.map((w) => w.mos_week),
    },
  };

  const target = path.join(ROOT, 'content/production/library-usage.json');
  fs.writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
  console.log(`usage written: ${rel(target)}  songs=${songs.length}  used=${out.summary.used}  never_used=${out.summary.never_used}`);
  for (const s of songs) {
    console.log(`  ${s.song_id} ${s.title}  tier=${s.tier}  用于 ${s.times_used} 周(${s.used_in.map((x) => x.week + '/' + x.role).join(', ') || '—'})  辨识=${s.discernment_status}  HIGH风险=${s.high_risk_codes.join(',') || '—'}`);
  }
  process.exit(0);
}

main();
