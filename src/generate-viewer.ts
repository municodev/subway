/**
 * Generates a standalone, self-contained HTML viewer for a subway.json file.
 * Uses D3-force for the graph, vanilla JS for UI. No build step, no npm.
 * Open the resulting HTML in any browser.
 */
import type { SubwaySchema } from './types/index.js';

export function generateViewerHtml(schema: SubwaySchema): string {
  const dataJson = JSON.stringify(schema);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Subway — ${escapeHtml(schema.meta.project)}</title>
<script src="https://d3js.org/d3.v7.min.js"><\/script>
<style>
/* ── RESET & BASE ── */
*{margin:0;padding:0;box-sizing:border-box}
:root {
  --bg: #0b0b1a;
  --bg2: #101028;
  --bg3: #181838;
  --border: #1e1e3a;
  --text: #c8c8e0;
  --text2: #8888aa;
  --text3: #5a5a7a;
  --accent: #7c8cf8;
  --accent2: #4cc9f0;
  --success: #4ade80;
  --warn: #fbbf24;
  --danger: #f87171;
  --pill-bg: #141430;
}
body {
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  overflow: hidden;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

/* ── HEADER ── */
header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  height: 44px;
  border-bottom: 1px solid var(--border);
  background: var(--bg2);
  flex-shrink: 0;
  z-index: 30;
}
.logo {
  width: 24px; height: 24px;
  border-radius: 6px;
  background: linear-gradient(135deg, #f87171, #7c8cf8);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 900;
  color: #fff;
  flex-shrink: 0;
}
.title { font-size: 12px; font-weight: 800; letter-spacing: .08em; color: #e8e8f0; flex-shrink: 0; }
.subtitle { font-size: 10px; color: var(--text3); flex-shrink: 0; }

/* ── SEARCH ── */
.search-wrap {
  position: relative;
  flex: 1;
  max-width: 340px;
}
.search-wrap input {
  width: 100%;
  padding: 5px 30px 5px 10px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 11px;
  outline: none;
  transition: .2s;
}
.search-wrap input:focus { border-color: var(--accent); box-shadow: 0 0 10px #7c8cf822; }
.search-wrap input::placeholder { color: var(--text3); }
.search-clear {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--text3);
  cursor: pointer;
  font-size: 14px;
  display: none;
}
.search-clear.visible { display: block; }

/* ── HEADER BUTTONS ── */
.hdr-btn {
  padding: 4px 10px;
  border-radius: 5px;
  font-size: 9px;
  cursor: pointer;
  font-weight: 700;
  letter-spacing: .05em;
  border: 1px solid var(--border);
  background: var(--pill-bg);
  color: var(--text2);
  transition: .15s;
  white-space: nowrap;
}
.hdr-btn:hover { border-color: var(--accent); color: var(--accent); }
.hdr-btn.active { background: #7c8cf822; border-color: var(--accent); color: var(--accent); }
.hdr-btn.primary { color: var(--accent); }

#filter-count {
  font-size: 8px;
  color: var(--accent);
  background: #7c8cf822;
  border-radius: 8px;
  padding: 1px 5px;
  margin-left: 2px;
  display: none;
}
#filter-count.visible { display: inline; }

/* ── FILTER PANEL (left slide) ── */
#filter-panel {
  position: fixed;
  top: 44px;
  left: 0;
  bottom: 0;
  width: 260px;
  background: var(--bg2);
  border-right: 1px solid var(--border);
  z-index: 25;
  overflow-y: auto;
  transform: translateX(-100%);
  transition: transform .25s ease;
  display: flex;
  flex-direction: column;
}
#filter-panel.open { transform: translateX(0); }
#filter-panel .fp-header {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
#filter-panel .fp-header h3 {
  font-size: 11px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: .06em;
}
#filter-panel .fp-header button {
  background: none;
  border: none;
  color: var(--text3);
  font-size: 16px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 3px;
}
#filter-panel .fp-header button:hover { color: var(--danger); }
.fp-section {
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
}
.fp-section .fp-label {
  font-size: 8px;
  font-weight: 700;
  color: var(--text3);
  letter-spacing: .1em;
  margin-bottom: 6px;
  text-transform: uppercase;
}
.fp-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  font-size: 10px;
  cursor: pointer;
  user-select: none;
  color: var(--text2);
}
.fp-row:hover { color: var(--text); }
.fp-row input[type="checkbox"] {
  accent-color: var(--accent);
  width: 13px; height: 13px;
}
.fp-row .fp-color { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.fp-row .fp-role-icon { font-size: 10px; width: 14px; text-align: center; flex-shrink: 0; }

/* ── WEIGHT SLIDERS ── */
.weight-slider {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0;
}
.weight-slider .ws-label {
  font-size: 9px;
  color: var(--text2);
  width: 70px;
  flex-shrink: 0;
}
.weight-slider input[type="range"] {
  flex: 1;
  height: 3px;
  -webkit-appearance: none;
  background: var(--border);
  border-radius: 3px;
  outline: none;
}
.weight-slider input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
}
.weight-slider .ws-val {
  font-size: 8px;
  color: var(--accent);
  width: 24px;
  text-align: right;
}

/* ── MAIN GRAPH AREA ── */
#main-area {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}
svg {
  flex: 1;
  display: block;
  cursor: grab;
  transition: margin-left .25s ease;
}
#main-area.filter-open svg { margin-left: 260px; }

/* ── RIGHT DETAIL PANEL ── */
#detail-panel {
  position: fixed;
  top: 44px;
  right: 0;
  bottom: 22px;
  width: 300px;
  background: var(--bg2);
  border-left: 1px solid var(--border);
  z-index: 25;
  overflow-y: auto;
  display: none;
  flex-direction: column;
}
#detail-panel.open { display: flex; }
#detail-panel .dp-content {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
#detail-panel h3 { font-size: 14px; font-weight: 800; margin-bottom: 2px; }
#detail-panel .dp-world {
  font-size: 8px;
  color: var(--text3);
  letter-spacing: .1em;
  margin-bottom: 6px;
}
#detail-panel .dp-desc { font-size: 10px; color: var(--text2); line-height: 1.6; }
#detail-panel .dp-close {
  background: none;
  border: none;
  color: var(--text3);
  font-size: 16px;
  cursor: pointer;
  margin-left: auto;
}
#detail-panel .dp-close:hover { color: var(--danger); }
.dp-weight-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 3px 0;
}
.dp-weight-row .wl {
  font-size: 8px;
  width: 70px;
  color: var(--text3);
  letter-spacing: .06em;
}
.dp-weight-row .wb {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: var(--bg3);
  overflow: hidden;
}
.dp-weight-row .wf {
  height: 100%;
  border-radius: 2px;
}
.dp-weight-row .wv {
  font-size: 8px;
  color: var(--text3);
  width: 28px;
  text-align: right;
}

.syn-list { font-size: 10px; color: var(--text2); line-height: 1.8; }
.syn-list a { color: var(--accent); cursor: pointer; text-decoration: none; }
.syn-list a:hover { text-decoration: underline; }
.syn-tag {
  display: inline-block;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 7px;
  margin-left: 4px;
}

/* ── LEGEND TOOLTIP ── */
#legend-float {
  position: fixed;
  bottom: 28px;
  left: 12px;
  display: flex;
  gap: 10px;
  font-size: 9px;
  color: var(--text3);
  flex-wrap: wrap;
  z-index: 20;
  pointer-events: none;
}
#legend-float .leg-item {
  display: flex;
  align-items: center;
  gap: 4px;
}
#legend-float .leg-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
#legend-float .leg-line {
  width: 14px; height: 2px;
  border-radius: 1px;
  flex-shrink: 0;
}

/* ── STATUS BAR ── */
.status-bar {
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  font-size: 8px;
  color: var(--text3);
  border-top: 1px solid var(--border);
  background: var(--bg2);
  flex-shrink: 0;
  z-index: 20;
}
.status-bar .sb-l { display: flex; gap: 12px; }

/* ── TOOLTIP ── */
#tooltip {
  position: fixed;
  padding: 5px 8px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 5px;
  font-size: 10px;
  pointer-events: none;
  z-index: 50;
  opacity: 0;
  max-width: 250px;
  line-height: 1.4;
}

/* ── ANIMATIONS ── */
@keyframes pulse-slow {
  0%, 100% { filter: drop-shadow(0 0 4px var(--gc, #7c8cf8)88); }
  50% { filter: drop-shadow(0 0 12px var(--gc, #7c8cf8)aa); }
}
.n-start-shiny { animation: pulse-slow 2.5s ease-in-out infinite; }

/* ── NO RESULTS HINT ── */
#hint-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 15;
  opacity: 0;
  transition: opacity .4s;
}
#hint-overlay.show { opacity: 1; }
#hint-overlay .hint-text {
  font-size: 13px;
  color: var(--text3);
  text-align: center;
  line-height: 1.6;
}
#hint-overlay .hint-text strong { color: var(--accent); }
</style>
</head>
<body>

<header>
  <div class="logo">S</div>
  <span class="title">SUBWAY</span>
  <span class="subtitle">/ ${escapeHtml(schema.meta.project)}</span>

  <button class="hdr-btn" id="btn-filters" title="Filters">☰ Filters <span id="filter-count"></span></button>

  <div class="search-wrap">
    <input id="search" placeholder="Search stations, files, concepts…" />
    <button class="search-clear" id="search-clear">×</button>
  </div>

  <button class="hdr-btn primary active" id="btn-expand">▲ Start Only</button>
  <button class="hdr-btn" id="btn-reset">↺ Reset</button>
</header>

<div id="main-area">
  <div id="filter-panel">
    <div class="fp-header">
      <h3>Filters</h3>
      <button id="btn-fp-close" title="Close filters">×</button>
    </div>
    <div class="fp-section" id="fp-worlds"><div class="fp-label">Domains (Worlds)</div></div>
    <div class="fp-section" id="fp-lines"><div class="fp-label">Lines (Flows)</div></div>
    <div class="fp-section" id="fp-roles"><div class="fp-label">Station Type</div></div>
    <div class="fp-section" id="fp-authors"><div class="fp-label">Author</div></div>
    <div class="fp-section" id="fp-weights"><div class="fp-label">Weight Filters</div></div>
  </div>

  <svg id="graph"></svg>

  <div id="detail-panel">
    <div class="dp-content" id="dp-content"></div>
  </div>
</div>

<div id="legend-float"></div>
<div id="tooltip"></div>
<div id="hint-overlay"><div class="hint-text">Click a <strong>node</strong> for details<br>or press <strong>▲ Start Only</strong> to focus on entry points</div></div>

<div class="status-bar">
  <span class="sb-l">
    <span>Drag · Scroll zoom · Click node · DblClick zoom</span>
    <span id="sb-search" style="display:none"></span>
    <span id="sb-line" style="display:none"></span>
    <span id="sb-active" style="display:none"></span>
  </span>
  <span>
    <span style="color:#4ade80">● low</span>
    <span style="color:#fbbf24">● med</span>
    <span style="color:#f87171">● high</span>
    <span>risk</span>
  </span>
</div>

<script>
// ─── DATA ───
const DATA = ${dataJson};
const STATIONS = DATA.stations;
const SYNAPSES = DATA.synapses;
const WORLDS = DATA.worlds;
const LINES = DATA.lines;

// ─── STATIC MAPS ───
const worldMap = Object.fromEntries(WORLDS.map(w => [w.id, w]));
const stationMap = Object.fromEntries(STATIONS.map(s => [s.id, s]));

// ─── AUTO-DETECT STATION CATEGORIES FROM FILES/LABEL ───
function detectCategory(s) {
  const corpus = [s.label, s.id, s.description, ...(s.files||[])].join(' ').toLowerCase();
  // Controllers / handlers (MVC patterns, route handlers, presenters, view-models)
  if (/controller|handler|route|middleware|presenter|viewmodel|vm\b|action|endpoint|resolver|gateway|interceptor/
    .test(corpus)) return 'controller';
  // UI / Views / Pages
  if (/view|page|screen|component|render|template|html|jsx|tsx|widget|dialog|modal|layout|panel|form|button|card/
    .test(corpus)) return 'ui';
  // Models / Domain / Entities
  if (/model|entity|schema|domain|type\b|interface|struct|class\b|object|record|dto|vo\b|value.object/
    .test(corpus) && !/controller|handler|route|view|page|screen|component/.test(corpus))
    return 'domain';
  // Services / Providers
  if (/service|provider|usecase|use.case|interactor|repository|adapter|facade|factory|builder|strategy/
    .test(corpus)) return 'service';
  // Infra / Config / Util
  if (/config|db|database|cache|queue|logger|util|helper|constant|enum|migration|seed|fixture|test|spec|mock/
    .test(corpus)) return 'infra';
  return 'other';
}
STATIONS.forEach(s => { s._cat = detectCategory(s); });

// ─── DETECT LINK TYPE ───
function detectLinkType(fromId, toId) {
  const f = stationMap[fromId];
  const t = stationMap[toId];
  if (!f || !t) return 'mixed';
  if (f._cat === t._cat) return f._cat + '-' + f._cat; // e.g., "ui-ui", "controller-controller"
  return 'cross'; // cross-boundary
}

// ─── ROLE DISPLAY ───
const CAT_LABELS = {
  controller: 'Controller / Handler',
  ui: 'UI / View',
  domain: 'Domain / Model',
  service: 'Service',
  infra: 'Infra / Config',
  other: 'Other'
};
const CAT_ICONS = {
  controller: '⚙', ui: '▣', domain: '◆', service: '◇', infra: '⬡', other: '●'
};
const CAT_COLORS = {
  controller: '#f87171', ui: '#4cc9f0', domain: '#a78bfa',
  service: '#4ade80', infra: '#fbbf24', other: '#888'
};

const ROLE_ICONS = {
  start: '▶', hub: '⬢', checkpoint: '◇',
  importance: '★', terminal: '■', boss: '◆'
};

// ─── COLOR HELPERS ───
function fragColor(v) {
  if (v >= 0.75) return '#f87171';
  if (v >= 0.5) return '#fb923c';
  if (v >= 0.25) return '#fbbf24';
  return '#4ade80';
}

function nodeRadius(s) {
  const base = 8;
  const imp = (s.weight?.centrality || 0) * 0.5 + (s.weight?.influence || 0) * 0.5;
  return Math.round(base * (0.7 + imp * 1.4));
}

// ─── STATE ───
let selected = null;
let hovered = null;
let selectedLine = null;
let showAll = true;
let filterPanelOpen = false;
let transform = { x: 0, y: 0, k: 1 };
let searchQuery = '';
let pinned = new Set();
let notes = {};

// Active filters
let activeFilters = {
  worlds: Object.fromEntries(WORLDS.map(w => [w.id, true])),
  lines: {},
  roles: Object.fromEntries(['start','hub','checkpoint','importance','terminal','boss'].map(r => [r, true])),
  categories: Object.fromEntries(Object.keys(CAT_LABELS).map(c => [c, true])),
  authors: {}, // {name: true}
  weightMin: { influence: 0, dependency: 0, churn: 0, centrality: 0 }
};

// Build author list
const allAuthors = [...new Set(STATIONS.flatMap(s => s.authors || []))].sort();
allAuthors.forEach(a => { activeFilters.authors[a] = true; });

// ─── START NODE DETECTION ───
const startIds = new Set(STATIONS.filter(s => s.role === 'start').map(s => s.id));
if (startIds.size === 0) {
  const ep = DATA.meta?.entryPoint;
  if (ep && stationMap[ep]) startIds.add(ep);
  if (startIds.size === 0 && STATIONS.length > 0) startIds.add(STATIONS[0].id);
}
function isRoot(s) { return startIds.has(s.id); }

// ─── FILTER MATCH ───
function passesFilters(s) {
  if (!activeFilters.worlds[s.world]) return false;
  if (!activeFilters.roles[s.role]) return false;
  if (!activeFilters.categories[s._cat]) return false;
  if (s.authors?.length && !s.authors.some(a => activeFilters.authors[a])) return false;
  const w = s.weight || {};
  if ((w.influence || 0) < activeFilters.weightMin.influence) return false;
  if ((w.dependency || w.fragility || 0) < activeFilters.weightMin.dependency) return false;
  if ((w.churn || 0) < activeFilters.weightMin.churn) return false;
  if ((w.centrality || 0) < activeFilters.weightMin.centrality) return false;
  return true;
}

// Active filter count
function activeFilterCount() {
  let n = 0;
  if (Object.values(activeFilters.worlds).some(v => !v)) n++;
  if (Object.values(activeFilters.roles).some(v => !v)) n++;
  if (Object.values(activeFilters.categories).some(v => !v)) n++;
  if (Object.values(activeFilters.authors).some(v => !v)) n++;
  if (activeFilters.weightMin.influence > 0) n++;
  if (activeFilters.weightMin.dependency > 0) n++;
  if (activeFilters.weightMin.churn > 0) n++;
  if (activeFilters.weightMin.centrality > 0) n++;
  return n;
}

// ─── SEARCH ───
function computeActivations(query) {
  if (!query.trim()) return {};
  const q = query.toLowerCase();
  const act = {};
  STATIONS.forEach(s => {
    const corpus = [s.label, s.description, s.world, ...(s.files||[])].join(' ').toLowerCase();
    let score = 0;
    if (s.label.toLowerCase().includes(q)) score = 0.96;
    else if (s.id.toLowerCase().includes(q)) score = 0.88;
    else if (s.world.toLowerCase().includes(q)) score = 0.65;
    else if (corpus.includes(q)) score = 0.72;
    else {
      // Fuzzy word match
      const words = q.split(/\\s+/);
      const matchCount = words.filter(w => corpus.includes(w)).length;
      if (matchCount > 0) score = 0.45 + matchCount * 0.15;
    }
    if (score > 0) act[s.id] = Math.min(score, 1);
  });
  // 1-hop spread
  for (let hop = 0; hop < 2; hop++) {
    const snap = {...act};
    SYNAPSES.forEach(syn => {
      const fa = snap[syn.from] || 0;
      if (fa > 0.1) act[syn.to] = Math.max(act[syn.to] || 0, fa * (syn.strength || 0.5) * 0.35);
      const ta = snap[syn.to] || 0;
      if (ta > 0.1) act[syn.from] = Math.max(act[syn.from] || 0, ta * (syn.strength || 0.5) * 0.35);
    });
  }
  return act;
}

// ─── D3 SETUP ───
const svg = d3.select('#graph');
const mainG = svg.append('g');

// Dot grid background
for (let i = 0; i < 20; i++)
  for (let j = 0; j < 30; j++)
    mainG.append('circle')
      .attr('cx', j * 70).attr('cy', i * 70)
      .attr('r', 0.8).attr('fill', '#7c8cf8').attr('opacity', 0.018);

const nodeData = STATIONS.map(s => ({ ...s, r: nodeRadius(s) }));
const linkData = SYNAPSES.map(s => ({
  ...s,
  source: s.from,
  target: s.to,
  _type: detectLinkType(s.from, s.to)
}));

// Arrow markers per world
WORLDS.forEach(w => {
  svg.append('defs').append('marker')
    .attr('id', 'arr-' + w.id)
    .attr('markerWidth', 5).attr('markerHeight', 5)
    .attr('refX', 5).attr('refY', 2.5).attr('orient', 'auto')
    .append('path').attr('d', 'M0,0 L5,2.5 L0,5 Z')
    .attr('fill', w.color).attr('opacity', 0.7);
});

const linkG = mainG.append('g');
const nodeG = mainG.append('g');

const linkEls = linkG.selectAll('g').data(linkData).join('g');
linkEls.append('path').attr('class', 'link-path').attr('fill', 'none');
linkEls.append('path').attr('class', 'link-glow').attr('fill', 'none').attr('opacity', 0).attr('stroke-width', 5);

const nodeEls = nodeG.selectAll('g').data(nodeData).join('g')
  .attr('class', 'sn').style('cursor', 'pointer')
  .on('click', (e, d) => { e.stopPropagation(); selectNode(d); })
  .on('mouseenter', (e, d) => { hovered = d; updateStyles(); })
  .on('mouseleave', () => { hovered = null; updateStyles(); });

// Node layers (bottom to top)
nodeEls.append('circle').attr('class', 'n-boss-ring').attr('fill', 'none').attr('stroke-width', 1.5).attr('opacity', 0);
nodeEls.append('circle').attr('class', 'n-halo').attr('fill', 'none').attr('stroke', '#4ade80').attr('stroke-width', 2).attr('opacity', 0);
nodeEls.append('circle').attr('class', 'n-start-ring').attr('fill', 'none').attr('stroke-width', 1).attr('opacity', 0).attr('stroke-dasharray', '3 3');
nodeEls.append('circle').attr('class', 'n-sel-ring').attr('fill', 'none').attr('stroke-width', 2).attr('opacity', 0);
nodeEls.append('circle').attr('class', 'n-glow').attr('fill', 'none').attr('opacity', 0);
nodeEls.append('circle').attr('class', 'n-body').attr('fill', '#0000').attr('stroke-width', 1.5);
nodeEls.append('circle').attr('class', 'n-core').attr('opacity', 0);
nodeEls.append('circle').attr('class', 'n-start-dot').attr('fill', '#fff').attr('opacity', 0);
nodeEls.append('circle').attr('class', 'n-cat-dot').attr('r', 2.5).attr('opacity', 0);
nodeEls.append('text').attr('class', 'n-label').attr('text-anchor', 'middle').attr('font-size', 9).style('user-select','none').style('pointer-events','none');
nodeEls.append('text').attr('class', 'n-pct').attr('text-anchor', 'middle').attr('font-size', 7).attr('font-weight', 700).style('user-select','none').style('pointer-events','none');
nodeEls.append('circle').attr('class', 'n-note-dot').attr('r', 2).attr('fill', '#fbbf24').attr('opacity', 0);
nodeEls.append('text').attr('class', 'n-pin').attr('font-size', 8).style('user-select','none').style('pointer-events','none');

// ─── FORCE SIMULATION (tighter layout) ───
const sim = d3.forceSimulation(nodeData)
  .force('link', d3.forceLink(linkData).id(d => d.id).distance(45).strength(0.35))
  .force('charge', d3.forceManyBody().strength(-180))
  .force('collide', d3.forceCollide(d => d.r + 14).strength(0.9))
  .force('x', d3.forceX().strength(0.03))
  .force('y', d3.forceY().strength(0.03))
  .alphaDecay(0.022)
  .on('tick', () => {
    linkEls.selectAll('.link-path,.link-glow').attr('d', d => {
      const s = nodeData.find(n => n.id === (d.source?.id || d.source));
      const t = nodeData.find(n => n.id === (d.target?.id || d.target));
      if (!s || !t || s.x == null || t.x == null) return '';
      const dx = t.x - s.x, dy = t.y - s.y, dist = Math.hypot(dx, dy);
      if (dist < 1) return '';
      const curve = dist * 0.18;
      const mx = (s.x + t.x) / 2 - dy * curve / dist;
      const my = (s.y + t.y) / 2 + dx * curve / dist;
      const ang = Math.atan2(dy, dx);
      const sx = s.x + Math.cos(ang) * (s.r + 2);
      const sy = s.y + Math.sin(ang) * (s.r + 2);
      const ex = t.x - Math.cos(ang) * (t.r + 6);
      const ey = t.y - Math.sin(ang) * (t.r + 6);
      return \`M\${sx},\${sy} Q\${mx},\${my} \${ex},\${ey}\`;
    });
    nodeEls.attr('transform', d => (d.x != null) ? \`translate(\${d.x},\${d.y})\` : '');
    updateNodeStyles();
  });

// ─── NODE STYLES ───
function updateNodeStyles() {
  const act = computeActivations(searchQuery);
  const isSearching = searchQuery.trim().length > 0;
  const connectedIds = new Set();
  if (selected) {
    connectedIds.add(selected.id);
    SYNAPSES.forEach(s => { if (s.from === selected.id) connectedIds.add(s.to); if (s.to === selected.id) connectedIds.add(s.from); });
  }
  if (hovered) {
    connectedIds.add(hovered.id);
    SYNAPSES.forEach(s => { if (s.from === hovered.id) connectedIds.add(s.to); if (s.to === hovered.id) connectedIds.add(s.from); });
  }
  const lineSet = selectedLine ? new Set(LINES.find(l => l.id === selectedLine)?.path || []) : null;
  const linePairs = selectedLine ? (() => {
    const path = LINES.find(l => l.id === selectedLine)?.path || [];
    const s = new Set();
    for (let i = 0; i < path.length - 1; i++) s.add(path[i] + '__' + path[i + 1]);
    return s;
  })() : null;

  nodeEls.each(function(d) {
    const g = d3.select(this);
    const W = worldMap[d.world] || { color: '#666', name: d.world };
    const r = d.r;
    const a = act[d.id] || 0;
    const fc = fragColor(d.weight?.dependency || d.weight?.fragility || 0);
    const isBoss = d.role === 'importance' || d.role === 'boss';
    const isStart = isRoot(d);
    const isSel = selected?.id === d.id;
    const isHov = hovered?.id === d.id;

    let op = 1;
    if (!showAll && connectedIds.size === 0) {
      op = isRoot(d) ? 1 : 0;
    } else if (!showAll) {
      if (isRoot(d)) op = 1;
      else if (connectedIds.has(d.id)) op = 0.7;
      else op = 0.02;
    } else if (lineSet && !lineSet.has(d.id)) {
      op = 0.05;
    } else if (isSearching) {
      op = a > 0.05 ? 0.3 + a * 0.7 : 0.04;
    } else if (connectedIds.size > 0 && !connectedIds.has(d.id)) {
      op = 0.08;
    }
    if (!passesFilters(d)) op = 0.03;

    g.style('opacity', op);

    // Boss ring
    g.select('.n-boss-ring')
      .attr('r', r + 10)
      .attr('stroke', W.color)
      .attr('opacity', isBoss ? 0.16 : 0);

    // Terminal halo
    g.select('.n-halo')
      .attr('r', r + 5)
      .attr('stroke', d.terminalType === 'failure' ? '#f87171' : '#4ade80')
      .attr('opacity', d.role === 'terminal' ? 0.55 : 0);

    // Start ring
    g.select('.n-start-ring')
      .attr('r', r + 8)
      .attr('stroke', W.color)
      .attr('opacity', isStart ? 0.5 : 0)
      .attr('stroke-width', isStart ? 1.5 : 1);

    // Selection ring
    const selRing = g.select('.n-sel-ring');
    if (isSel) selRing.attr('r', r + 4).attr('stroke', W.color).attr('stroke-width', 2.5).attr('opacity', 0.9);
    else if (isHov) selRing.attr('r', r + 3).attr('stroke', W.color).attr('stroke-width', 1.5).attr('opacity', 0.65);
    else selRing.attr('opacity', 0);

    // Search glow
    g.select('.n-glow')
      .attr('r', r + 14)
      .attr('fill', W.color)
      .attr('opacity', (isSearching && a > 0.45) ? a * 0.1 : 0);

    // Body
    g.select('.n-body')
      .attr('r', r)
      .attr('fill', W.color + '33')
      .attr('stroke', isSel ? W.color : fc)
      .attr('stroke-width', isSel ? 2.5 : isBoss ? 2.2 : 1.5);

    // Core
    g.select('.n-core')
      .attr('r', r * 0.45)
      .attr('fill', W.color)
      .attr('opacity', (isBoss || isStart) ? 0.45 : 0);

    // Start dot
    g.select('.n-start-dot')
      .attr('r', 2.5)
      .attr('fill', W.color)
      .attr('opacity', isStart ? 0.9 : 0);

    // Category dot (top-right of node)
    g.select('.n-cat-dot')
      .attr('cx', r - 2)
      .attr('cy', -r + 2)
      .attr('fill', CAT_COLORS[d._cat] || '#888')
      .attr('opacity', 0.85);

    // Label
    g.select('.n-label')
      .attr('y', r + 11)
      .text(d.label.length > 22 ? d.label.substring(0, 20) + '…' : d.label)
      .attr('fill', (isSel || isHov) ? '#e8e8f0' : '#9494b8')
      .attr('font-size', (isSel || isHov) ? 9.5 : 8.5)
      .attr('font-weight', isSel ? 700 : 400);

    // Search %
    g.select('.n-pct')
      .attr('y', -r - 8)
      .text((isSearching && a > 0.6) ? Math.round(a * 100) + '%' : '')
      .attr('fill', W.color);

    // Note dot
    g.select('.n-note-dot')
      .attr('cx', r - 1.5).attr('cy', r - 1.5)
      .attr('opacity', notes[d.id] ? 0.85 : 0);

    // Pin
    g.select('.n-pin')
      .attr('x', -r + 2).attr('y', -r + 9)
      .text(pinned.has(d.id) ? '📌' : '');
  });

  // ─── LINK STYLES ───
  linkEls.each(function(d) {
    const g = d3.select(this);
    const sId = d.source?.id || d.source;
    const tId = d.target?.id || d.target;
    const fs = stationMap[sId];
    const ts = stationMap[tId];
    const srcW = fs?.world || 'core';
    const W = worldMap[srcW] || { color: '#666' };
    const a = computeActivations(searchQuery);
    const isSearching = searchQuery.trim().length > 0;

    // Determine link style based on type
    let linkDash = null;
    let linkColor = W.color;
    if (d._type === 'controller-controller') linkDash = null; // solid = same type internal
    else if (d._type === 'ui-ui') linkDash = '2 4'; // short dash = UI → UI
    else if (d._type === 'domain-domain') linkDash = '6 3'; // long dash = model → model
    else if (d._type === 'cross') linkDash = '8 4 2 4'; // complex = cross-boundary
    else if (d.direction === 'back') linkDash = '4 4';
    else if (d.condition?.type !== 'always') linkDash = '5 3';

    let op = 0.22;
    if (!showAll && !selected && !hovered) {
      op = 0;
    } else if (!showAll) {
      const focus = (selected || hovered)?.id;
      op = (sId === focus || tId === focus) ? 0.7 : 0.015;
    } else if (linePairs) {
      const key = sId + '__' + tId;
      op = linePairs.has(key) ? 0.9 : 0.015;
    } else if (isSearching) {
      const fa = a[sId] || 0, ta = a[tId] || 0;
      op = Math.max(fa, ta) > 0.2 ? Math.max(fa, ta) * 0.65 : 0.02;
    } else if (selected || hovered) {
      const focus = (selected || hovered)?.id;
      op = (sId === focus || tId === focus) ? 0.7 : 0.03;
    }

    const path = g.select('.link-path');
    path.attr('stroke', linkColor)
      .attr('stroke-width', d.isCritical ? 1.2 : 0.7)
      .attr('stroke-dasharray', linkDash || 'none')
      .attr('marker-end', 'url(#arr-' + srcW + ')')
      .attr('opacity', op);

    g.select('.link-glow')
      .attr('stroke', linkColor)
      .attr('opacity', (d.isCritical && op > 0.3) ? 0.1 : 0);
  });
}

function updateStyles() {
  updateNodeStyles();
  updatePanel();
  updateStatusBar();
  updateHint();
}

// ─── ZOOM & PAN ───
let isDragging = false, dragOrig = { x: 0, y: 0 };

svg.on('wheel', (e) => {
  e.preventDefault();
  transform.k = Math.max(0.12, Math.min(3.5, transform.k * (1 - e.deltaY * 0.0025)));
  applyTransform();
});

svg.on('dblclick', (e) => {
  e.preventDefault();
  const pt = svg.node().createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  const svgPt = pt.matrixTransform(svg.node().getScreenCTM().inverse());
  const factor = 1.5;
  transform.x = svgPt.x - factor * (svgPt.x - transform.x);
  transform.y = svgPt.y - factor * (svgPt.y - transform.y);
  transform.k = Math.min(3.5, transform.k * factor);
  applyTransform();
});

svg.on('mousedown', (e) => {
  if (e.target.closest('.sn')) return;
  isDragging = true;
  dragOrig = { x: e.clientX - transform.x, y: e.clientY - transform.y };
});
svg.on('mousemove', (e) => {
  if (!isDragging) return;
  transform.x = e.clientX - dragOrig.x;
  transform.y = e.clientY - dragOrig.y;
  applyTransform();
});
svg.on('mouseup', () => { isDragging = false; });
svg.on('mouseleave', () => { isDragging = false; });
svg.on('click', (e) => {
  if (e.target.closest('.sn')) return;
  deselectNode();
});

function applyTransform() {
  mainG.attr('transform', \`translate(\${transform.x},\${transform.y}) scale(\${transform.k})\`);
}

// ─── SEARCH ───
const searchEl = document.getElementById('search');
const sclearEl = document.getElementById('search-clear');

searchEl.addEventListener('input', () => {
  searchQuery = searchEl.value;
  sclearEl.style.display = searchQuery.trim() ? 'block' : 'none';
  updateStyles();
});
sclearEl.addEventListener('click', () => {
  searchEl.value = '';
  searchQuery = '';
  sclearEl.style.display = 'none';
  updateStyles();
});

// ─── FILTER PANEL ───
const filterPanel = document.getElementById('filter-panel');
const mainArea = document.getElementById('main-area');
const btnFilters = document.getElementById('btn-filters');
const btnFpClose = document.getElementById('btn-fp-close');
const filterCount = document.getElementById('filter-count');

function toggleFilterPanel() {
  filterPanelOpen = !filterPanelOpen;
  filterPanel.classList.toggle('open', filterPanelOpen);
  mainArea.classList.toggle('filter-open', filterPanelOpen);
  if (filterPanelOpen) buildFilterPanel();
}
btnFilters.addEventListener('click', toggleFilterPanel);
btnFpClose.addEventListener('click', toggleFilterPanel);

function updateFilterCount() {
  const n = activeFilterCount();
  filterCount.textContent = n;
  filterCount.classList.toggle('visible', n > 0);
}

function onFilterChange() {
  updateFilterCount();
  updateStyles();
}

function buildFilterPanel() {
  // ── Worlds ──
  const fpw = document.getElementById('fp-worlds');
  fpw.innerHTML = '<div class="fp-label">Domains (Worlds)</div>' +
    WORLDS.map(w => \`
      <label class="fp-row">
        <input type="checkbox" \${activeFilters.worlds[w.id] ? 'checked' : ''}
          onchange="activeFilters.worlds['\${w.id}']=this.checked;onFilterChange()">
        <span class="fp-color" style="background:\${w.color}"></span>
        \${escHtml(w.name)} (\${STATIONS.filter(s => s.world === w.id).length})
      </label>\`).join('');

  // ── Lines ──
  const fpl = document.getElementById('fp-lines');
  fpl.innerHTML = '<div class="fp-label">Lines (Flows)</div>' +
    (LINES.length > 0 ? LINES.map(l => {
      const os = l.outcome === 'failure' ? '🔴' : l.outcome === 'partial' ? '🟡' : '🟢';
      return \`<label class="fp-row">
        <input type="checkbox" \${activeFilters.lines[l.id] !== false ? 'checked' : ''}
          onchange="activeFilters.lines['\${l.id}']=this.checked;onFilterChange()">
        \${os} \${escHtml(l.name)} (\${l.path?.length||0})
      </label>\`;
    }).join('') : '<div style="font-size:9px;color:var(--text3);padding:4px 0;">No lines defined</div>');

  // ── Roles ──
  const fpr = document.getElementById('fp-roles');
  const roleDist = {};
  STATIONS.forEach(s => { roleDist[s.role] = (roleDist[s.role] || 0) + 1; });
  fpr.innerHTML = '<div class="fp-label">Station Type</div>' +
    Object.entries(ROLE_ICONS).map(([role, icon]) => \`
      <label class="fp-row">
        <input type="checkbox" \${activeFilters.roles[role] ? 'checked' : ''}
          onchange="activeFilters.roles['\${role}']=this.checked;onFilterChange()">
        <span class="fp-role-icon">\${icon}</span>
        \${role.charAt(0).toUpperCase() + role.slice(1)} (\${roleDist[role] || 0})
      </label>\`).join('') +
    '<div class="fp-label" style="margin-top:6px">Category (auto-detected)</div>' +
    Object.entries(CAT_LABELS).map(([cat, label]) => \`
      <label class="fp-row">
        <input type="checkbox" \${activeFilters.categories[cat] ? 'checked' : ''}
          onchange="activeFilters.categories['\${cat}']=this.checked;onFilterChange()">
        <span class="fp-color" style="background:\${CAT_COLORS[cat]}"></span>
        \${label} (\${STATIONS.filter(s => s._cat === cat).length})
      </label>\`).join('');

  // ── Authors ──
  const fpa = document.getElementById('fp-authors');
  fpa.innerHTML = '<div class="fp-label">Author</div>' +
    allAuthors.map(a => \`
      <label class="fp-row">
        <input type="checkbox" \${activeFilters.authors[a] ? 'checked' : ''}
          onchange="activeFilters.authors['\${escHtml(a)}']=this.checked;onFilterChange()">
        \${escHtml(a)} (\${STATIONS.filter(s => (s.authors||[]).includes(a)).length})
      </label>\`).join('');

  // ── Weight Sliders ──
  const fpw2 = document.getElementById('fp-weights');
  fpw2.innerHTML = '<div class="fp-label">Weight Filters</div>' +
    [
      { id: 'influence', label: 'Influence', color: '#74b9ff' },
      { id: 'dependency', label: 'Dependency', color: '#f87171' },
      { id: 'churn', label: 'Churn', color: '#fbbf24' },
      { id: 'centrality', label: 'Centrality', color: '#a78bfa' }
    ].map(w => \`
      <div class="weight-slider">
        <span class="ws-label" style="color:\${w.color}">\${w.label}</span>
        <input type="range" min="0" max="100" value="\${Math.round(activeFilters.weightMin[w.id] * 100)}"
          oninput="activeFilters.weightMin['\${w.id}']=this.value/100;document.getElementById('wsv-\${w.id}').textContent=this.value+'%';onFilterChange()">
        <span class="ws-val" id="wsv-\${w.id}">\${Math.round(activeFilters.weightMin[w.id] * 100)}%</span>
      </div>\`).join('');
}

// ─── EXPAND / SHOW ALL ───
document.getElementById('btn-expand').addEventListener('click', () => {
  showAll = !showAll;
  const btn = document.getElementById('btn-expand');
  btn.textContent = showAll ? '▲ Start Only' : '▼ Show All';
  btn.classList.toggle('active', showAll);
  updateStyles();
});

// ─── RESET ───
document.getElementById('btn-reset').addEventListener('click', () => {
  transform = { x: 0, y: 0, k: 1 };
  applyTransform();
  searchEl.value = '';
  searchQuery = '';
  sclearEl.style.display = 'none';
  selected = null;
  hovered = null;
  selectedLine = null;
  showAll = true;
  const expandBtn = document.getElementById('btn-expand');
  expandBtn.textContent = '▲ Start Only';
  expandBtn.classList.add('active');
  document.getElementById('detail-panel').classList.remove('open');
  // Reset all filters
  activeFilters.worlds = Object.fromEntries(WORLDS.map(w => [w.id, true]));
  activeFilters.roles = Object.fromEntries(Object.keys(ROLE_ICONS).map(r => [r, true]));
  activeFilters.categories = Object.fromEntries(Object.keys(CAT_LABELS).map(c => [c, true]));
  activeFilters.authors = Object.fromEntries(allAuthors.map(a => [a, true]));
  activeFilters.weightMin = { influence: 0, dependency: 0, churn: 0, centrality: 0 };
  updateFilterCount();
  updateStyles();
});

// ─── SELECT / DESELECT ───
function selectNode(station) {
  selected = station;
  document.getElementById('detail-panel').classList.add('open');
  updateStyles();
}

function deselectNode() {
  selected = null;
  document.getElementById('detail-panel').classList.remove('open');
  updateStyles();
}

// ─── DETAIL PANEL ───
function updatePanel() {
  const content = document.getElementById('dp-content');
  if (!selected) { content.innerHTML = ''; return; }

  const W = worldMap[selected.world] || { color: '#666', name: selected.world };
  const out = SYNAPSES.filter(s => s.from === selected.id);
  const inc = SYNAPSES.filter(s => s.to === selected.id);
  const isPinned = pinned.has(selected.id);

  content.innerHTML = \`
    <div style="display:flex;align-items:flex-start;justify-content:space-between">
      <div>
        <div class="dp-world">\${(W.name || selected.world).toUpperCase()} · \${CAT_LABELS[selected._cat] || selected._cat}
          · \${selected.role?.toUpperCase()}\${selected.terminalType ? ' (' + selected.terminalType + ')' : ''}</div>
        <h3 style="color:\${W.color}">\${escHtml(selected.label)}</h3>
      </div>
      <button class="dp-close" onclick="deselectNode()">×</button>
    </div>
    <div class="dp-desc">\${escHtml(selected.description || 'No description')}</div>

    <div>
      \${[
        { k: 'influence', label: 'INFLUENCE', c: '#74b9ff', v: selected.weight?.influence || 0 },
        { k: 'dependency', label: 'DEPENDENCY', c: fragColor(selected.weight?.dependency || selected.weight?.fragility || 0), v: selected.weight?.dependency || selected.weight?.fragility || 0 },
        { k: 'churn', label: 'CHURN', c: '#fbbf24', v: selected.weight?.churn || 0 },
        { k: 'centrality', label: 'CENTRALITY', c: '#a78bfa', v: selected.weight?.centrality || 0 }
      ].map(w => \`
        <div class="dp-weight-row">
          <span class="wl" style="color:\${w.c}">\${w.label}</span>
          <div class="wb"><div class="wf" style="width:\${Math.round(w.v * 100)}%;background:\${w.c}"></div></div>
          <span class="wv" style="color:\${w.c}">\${Math.round(w.v * 100)}%</span>
        </div>
      \`).join('')}
    </div>

    \${selected.files?.length ? \`
      <div style="margin-top:4px;font-size:8px;color:var(--text3);letter-spacing:.06em">FILES (\${selected.files.length})</div>
      <div style="font-size:9px;color:var(--text2);line-height:1.6;margin-top:4px">\${selected.files.map(f =>
        \`<div style="padding-left:6px;border-left:2px solid \${W.color}33">\${escHtml(f)}</div>\`).join('')}</div>
    \` : ''}

    \${selected.authors?.length ? \`
      <div style="margin-top:4px;font-size:8px;color:var(--text3);letter-spacing:.06em">AUTHORS</div>
      <div style="font-size:9px;color:var(--text2);line-height:1.6;margin-top:4px">\${selected.authors.map(a =>
        \`<span style="display:inline-block;padding:1px 5px;background:\${W.color}18;border-radius:3px;margin:1px 2px">\${escHtml(a)}</span>\`).join('')}</div>
    \` : ''}

    \${selected.commitCount ? \`
      <div style="margin-top:4px;font-size:8px;color:var(--text3);letter-spacing:.06em">COMMITS</div>
      <div style="font-size:10px;color:var(--accent);font-weight:600">\${selected.commitCount}</div>
    \` : ''}

    \${out.length ? \`
      <div style="margin-top:4px;font-size:8px;color:var(--text3);letter-spacing:.06em">OUTGOING (\${out.length})</div>
      <div class="syn-list">\${out.map(s => {
        const t = stationMap[s.to];
        const lt = detectLinkType(selected.id, s.to);
        return \`<div>→ <a class="dp-syn-link" data-station-id="\${s.to}" style="cursor:pointer;color:var(--accent);text-decoration:none">\${escHtml(t?.label || s.to)}</a>
          <span class="syn-tag" style="background:\${CAT_COLORS[t?._cat]||'#666'}22;color:\${CAT_COLORS[t?._cat]||'#666'}">\${t?._cat || '?'}</span>
          <span class="syn-tag" style="background:var(--bg3);color:var(--text3)">\${lt.replace(/-/g,'→')}</span></div>
          <div style="font-size:8px;color:var(--text3);padding-left:14px">\${escHtml(s.condition?.description || '')}</div>\`;
      }).join('')}</div>
    \` : ''}

    \${inc.length ? \`
      <div style="margin-top:4px;font-size:8px;color:var(--text3);letter-spacing:.06em">INCOMING (\${inc.length})</div>
      <div class="syn-list">\${inc.map(s => {
        const f = stationMap[s.from];
        const lt = detectLinkType(s.from, selected.id);
        return \`<div>← <a class="dp-syn-link" data-station-id="\${s.from}" style="cursor:pointer;color:var(--accent);text-decoration:none">\${escHtml(f?.label || s.from)}</a>
          <span class="syn-tag" style="background:\${CAT_COLORS[f?._cat]||'#666'}22;color:\${CAT_COLORS[f?._cat]||'#666'}">\${f?._cat || '?'}</span>
          <span class="syn-tag" style="background:var(--bg3);color:var(--text3)">\${lt.replace(/-/g,'→')}</span></div>
          <div style="font-size:8px;color:var(--text3);padding-left:14px">\${escHtml(s.condition?.description || '')}</div>\`;
      }).join('')}</div>
    \` : ''}

    <div style="margin-top:4px;">
      <div style="font-size:8px;color:var(--text3);letter-spacing:.06em;margin-bottom:4px">NOTES</div>
      <textarea id="note-text" placeholder="Add a note…" style="width:100%;height:50px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:10px;padding:6px;resize:vertical;outline:none">\${escHtml(notes[selected.id] || '')}</textarea>
      <div style="display:flex;gap:6px;margin-top:4px">
        <button class="dp-save-note" style="padding:3px 8px;border-radius:3px;font-size:9px;cursor:pointer;border:1px solid var(--border);background:var(--bg3);color:var(--text2)">Save</button>
        <button class="dp-clear-note" style="padding:3px 8px;border-radius:3px;font-size:9px;cursor:pointer;border:1px solid var(--border);background:var(--bg3);color:var(--text2)">Clear</button>
        <button class="dp-toggle-pin" data-station-id="\${selected.id}" style="margin-left:auto;padding:3px 8px;border-radius:3px;font-size:9px;cursor:pointer;border:1px solid var(--border);background:var(--bg3);color:var(--text2)">\${isPinned ? '📌 Unpin' : '📌 Pin'}</button>
      </div>
    </div>
  \`;
}

// ─── LEGEND ───
function updateLegend() {
  const legend = document.getElementById('legend-float');
  legend.innerHTML = \`
    <div class="leg-item"><span class="leg-dot" style="background:#4ade80"></span> low risk</div>
    <div class="leg-item"><span class="leg-dot" style="background:#fbbf24"></span> med</div>
    <div class="leg-item"><span class="leg-dot" style="background:#f87171"></span> high</div>
    <div class="leg-item"><span style="color:var(--text3)">|</span></div>
    <div class="leg-item"><span class="leg-line" style="background:var(--text2)"></span> same-type</div>
    <div class="leg-item"><span class="leg-line" style="background:var(--text2);border-top:2px dashed var(--text2);height:0"></span> UI→UI</div>
    <div class="leg-item"><span class="leg-line" style="background:var(--text2);border-top:2px dotted var(--text2);height:0"></span> cross</div>
  \`;
}

// ─── STATUS BAR ───
function updateStatusBar() {
  const sbSearch = document.getElementById('sb-search');
  const sbLine = document.getElementById('sb-line');
  const sbActive = document.getElementById('sb-active');

  if (searchQuery.trim()) {
    const count = Object.keys(computeActivations(searchQuery)).length;
    sbSearch.style.display = 'inline';
    sbSearch.textContent = \`Search: \${count} match(es)\`;
  } else sbSearch.style.display = 'none';

  if (selectedLine) {
    sbLine.style.display = 'inline';
    sbLine.textContent = \`Line: \${LINES.find(l => l.id === selectedLine)?.name || selectedLine}\`;
  } else sbLine.style.display = 'none';

  const n = activeFilterCount();
  sbActive.style.display = n > 0 ? 'inline' : 'none';
  sbActive.textContent = n > 0 ? \`\${n} filter(s) active\` : '';
}

// ─── HINT OVERLAY ───
function updateHint() {
  const overlay = document.getElementById('hint-overlay');
  const anyVisible = nodeData.some(d => {
    if (!showAll && !selected && !hovered) return isRoot(d) && passesFilters(d);
    // rough check — if all nodes are near 0 opacity
    return true;
  });
  // Show hint only when in start-only mode with no selection
  if (!showAll && !selected && !hovered && !searchQuery.trim()) {
    overlay.classList.add('show');
  } else {
    overlay.classList.remove('show');
  }
}

// ─── ACTIONS ───
window.selectNodeById = function(id) { const st = stationMap[id]; if (st) selectNode(st); };
// ─── DETAIL PANEL EVENT DELEGATION ───
document.getElementById('dp-content').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.classList.contains('dp-save-note')) {
    if (!selected) return;
    const text = document.getElementById('note-text')?.value || '';
    notes = { ...notes, [selected.id]: text };
    updateStyles();
  } else if (btn.classList.contains('dp-clear-note')) {
    if (!selected) return;
    const ta = document.getElementById('note-text');
    if (ta) ta.value = '';
    notes = { ...notes, [selected.id]: '' };
    updateStyles();
  } else if (btn.classList.contains('dp-toggle-pin')) {
    const id = btn.dataset.stationId;
    if (id) {
      const s = new Set(pinned);
      if (s.has(id)) s.delete(id); else s.add(id);
      pinned = s;
      updateStyles();
    }
  } else if (btn.classList.contains('dp-syn-link')) {
    const id = btn.dataset.stationId;
    if (id) { const st = stationMap[id]; if (st) selectNode(st); }
  }
});
window.deselectNode = deselectNode;
window.onFilterChange = onFilterChange;

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── KEYBOARD SHORTCUTS ───
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    deselectNode();
    searchEl.value = ''; searchQuery = ''; sclearEl.style.display = 'none';
    updateStyles();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
    searchEl.focus();
  }
  if (e.key === 'f' && !e.ctrlKey && !e.metaKey && document.activeElement !== searchEl) {
    // Toggle filter panel
    toggleFilterPanel();
  }
});

// ─── INIT ───
applyTransform();
updateStyles();
updateLegend();
updateFilterCount();

// Center on start nodes after simulation settles
setTimeout(() => {
  const starts = nodeData.filter(n => isRoot(n));
  if (starts.length > 0) {
    const valid = starts.filter(n => n.x != null && n.y != null);
    if (valid.length > 0) {
      const cx = valid.reduce((s, n) => s + n.x, 0) / valid.length;
      const cy = valid.reduce((s, n) => s + n.y, 0) / valid.length;
      transform = { x: (window.innerWidth / 2) - cx, y: (window.innerHeight / 2) - cy, k: 1.1 };
      applyTransform();
    }
  }
}, 1800);

// ─── RESIZE ───
window.addEventListener('resize', () => {
  sim.force('center', d3.forceCenter(window.innerWidth / 2, window.innerHeight / 2));
  sim.alpha(0.3).restart();
});
<\/script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
