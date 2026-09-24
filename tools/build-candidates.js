#!/usr/bin/env node
/* =========================================================
   MOS-MUSIC｜tools/build-candidates.js（V2.0）
   ---------------------------------------------------------
   从《MOS_Life_Hymn_Library_V2_100首目标曲库.csv》生成
   content/candidates/index.json —— 100 首目标候选库（候选层）。

   铁律（V2.0 规格 §17 / §33）：
     - 全部 100 首统一为候选记录：discernment_status = NOT_YET_ASSESSED，
       copyright_status = SOURCE_REQUIRED（以 CSV 为准，逐行核对）。
     - CSV 行序不构成推荐排序；本工具不改写行序、不打分。
     - front_tags（主题/场景）只是**录入期初分类**，不是辨识结论；
       由关键词映射生成，落档时明示 provisional。
     - song_id 规范化为 MUS-S-NNNN（项目 ID 铁律），保留 csv_song_id 溯源。
     - 候选层不写 content/library/registry.json（登记层保持 V0.5 契约冻结）。
========================================================= */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_CSV = path.join(ROOT, 'content', 'candidates', 'source', 'MOS-LIFE-HYMN-LIBRARY-V2.csv');
const OUT = path.join(ROOT, 'content', 'candidates', 'index.json');

/* ---------------- 主题初分类（关键词映射，provisional） ---------------- */
/* 顺序即优先级：命中即停。每条映射是纯关键词规则，不含任何辨识结论。 */
const THEME_RULES = [
  ['十字架', /十架|十字架|受难|髑髅|骷髅|宝架/],
  ['复活', /复活|主活着|得胜/],
  ['恩典', /恩典|怜悯|恩手|奇异/],
  ['救恩', /救恩|福音|拯救|悔改|赦罪|宝血|洁净|称义|中保|确据|寻回|失丧|救赎/],
  ['祷告', /祷告|祈求|恳求/],
  ['安慰', /安慰|患难|平安|避难|保障|保护|磐石|镇静|惧怕|胆怯|保守|稳固|遮盖|需要你|同住|扶持|依靠|信靠|试炼/],
  ['盼望', /盼望|天家|永恒|再临|生死|荣耀盼望/],
  ['宣教', /宣教|万邦|传扬|见证|使命|寻找|失丧者/],
  ['爱人', /彼此相爱|爱人|祝福|服事|合一|相爱/],
  ['教会', /教会|牧养|身体|精兵/],
  ['成圣', /成圣|效法|成长|更新|圣灵|操练|亲近|住在|像你|像基督|委身|奉献|降服|优先|中心|满足|根基|跟随|跟随|门训/],
  ['跟随', /跟随|呼召|顺服|引导|带领|道路|行|差遣|领导|跟随/],
  ['敬拜', /敬拜|荣耀|颂赞|三一|圣洁|伟大|为王|宝座|王权|美善|尊崇|降生|感恩|真神|主/],
];

const SCENE_RULES = [
  ['家庭', /家庭|亲子/],
  ['儿童/青少年', /儿童|青少年|小孩|孩子/],
  ['小组', /小组/],
  ['主日', /主日|圣诞|复活|受难|敬拜|节期/],
  ['门训', /门训|门徒|成长|奉献|顺服|跟随|灵修/],
  ['使命', /宣教|传扬|见证|使命|福音/],
  ['个人', /./],
];

function classify(rules, text) {
  for (const [tag, re] of rules) {
    if (re.test(String(text || ''))) return tag;
  }
  return rules[rules.length - 1][0];
}

/* ---------------- 主流程 ---------------- */

function main() {
  const csvPath = process.argv[2] || DEFAULT_CSV;
  if (!fs.existsSync(csvPath)) {
    console.error('[build-candidates] 找不到输入 CSV：' + csvPath);
    process.exit(1);
  }
  const raw = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const header = lines[0].split(',');
  const expect = ['song_id', 'title_zh_display', 'title_en_authoritative', 'formation_theme', 'suggested_use', 'source_stage', 'copyright_status', 'discernment_status'];
  if (header.join(',') !== expect.join(',')) {
    console.error('[build-candidates] CSV 表头与预期不符：' + header.join(','));
    process.exit(1);
  }

  const candidates = lines.slice(1).map((line) => {
    /* 逐行解析：title_en 内含逗号，因此按前三个逗号 + 后四个逗号切分 */
    const m = line.match(/^(S-\d{4}),"?([^"]*?)"?,(".*?"|[^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*)$/);
    if (!m) throw new Error('无法解析行：' + line);
    const [, sid, zh, en, theme, use, stage, cp, ds] = m;
    const n = Number(sid.slice(2));
    const songId = 'MUS-S-' + String(n).padStart(4, '0');
    if (cp !== 'SOURCE_REQUIRED') throw new Error(`${sid} copyright_status=${cp}，候选层铁律要求 SOURCE_REQUIRED`);
    if (ds !== 'NOT_YET_ASSESSED') throw new Error(`${sid} discernment_status=${ds}，候选层铁律要求 NOT_YET_ASSESSED`);
    return {
      song_id: songId,
      csv_song_id: sid,
      title_zh: zh,
      title_en: en.replace(/^"|"$/g, ''),
      formation_theme: theme,
      suggested_use: use,
      source_stage: stage,
      copyright_status: cp,
      discernment_status: ds,
      front_tags: {
        theme: classify(THEME_RULES, theme),
        scene: classify(SCENE_RULES, use),
        tags_status: 'provisional_intake_classification',
      },
    };
  });

  if (candidates.length !== 100) throw new Error('候选数应为 100，实际 ' + candidates.length);
  const ids = new Set(candidates.map((c) => c.song_id));
  if (ids.size !== 100) throw new Error('song_id 有重复');

  const counts = {
    total: candidates.length,
    existing_in_library_v05: candidates.filter((c) => c.source_stage === 'existing').length,
    new_candidate: candidates.filter((c) => c.source_stage === 'new').length,
    discernment_assessed: 0,
    copyright_cleared: 0,
  };

  const out = {
    candidates_version: 'MUS-CAND-1.0.0',
    generated_at: new Date().toISOString().slice(0, 10),
    source_csv: 'content/candidates/source/MOS-LIFE-HYMN-LIBRARY-V2.csv',
    source_note: '由人工提供的 100 首目标曲库 CSV 原样拷贝入库；本工具只做格式规范化与初分类，不改写任何事实字段。',
    id_mapping_note: 'CSV 的 S-NNNN 规范化为项目 ID MUS-S-NNNN；csv_song_id 保留溯源。MUS-S-0001…0050 与 Music Library V0.5 曲库重合（详情层/登记层以曲库为准），MUS-S-0051…0100 目前只有候选记录。',
    field_policy: {
      discernment_status: '全部 NOT_YET_ASSESSED：辨识未开始，前台一律如实显示，不给出任何八维/关系/等级结论。',
      copyright_status: '全部 SOURCE_REQUIRED（来源与行动状态，ADR-0012 维度）：表示「需要落实来源授权」，不构成任何法律状态结论。',
      front_tags: 'provisional_intake_classification：录入期关键词初分类，仅供浏览筛选，不是辨识结论，不构成推荐或排序。',
      ordering: '保持 CSV 原行序（S-0001…S-0100）；行序不构成推荐排序，前台不做任何打分或「最佳歌曲」。',
    },
    counts,
    themes: ['敬拜', '恩典', '救恩', '十字架', '复活', '跟随', '成圣', '祷告', '安慰', '爱人', '教会', '宣教', '盼望'],
    scenes: ['个人', '家庭', '小组', '主日', '儿童/青少年', '门训', '使命'],
    note: 'V2.0 候选库（§17）：候选库 → 详情库 → 实际使用 → 精选库 四层中的第一层。候选 ≠ 已辨识 ≠ 可用资源；歌谱/歌词/音频一律 尚未提供。',
    candidates,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
  const themeDist = {};
  for (const c of candidates) themeDist[c.front_tags.theme] = (themeDist[c.front_tags.theme] || 0) + 1;
  console.log('[build-candidates] OK:', OUT);
  console.log('  total=100  existing=50  new=50');
  console.log('  theme distribution:', JSON.stringify(themeDist));
}

try {
  main();
} catch (e) {
  console.error('[build-candidates] FAILED:', e.message);
  process.exit(1);
}
