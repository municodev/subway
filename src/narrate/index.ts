/**
 * NARRATE phase orchestrator — batch-optimized.
 *
 * Uses batch LLM calls instead of per-station/synapse calls.
 * Entirely optional — subway.json is valid without narration.
 */
import type { Station, Synapse, World, Line, SubwaySchema } from '../types/index.js';
import type { NarrateConfig } from './config.js';
import { resolveNarrateConfig } from './config.js';
import { createLLMProvider, type LLMProvider } from './llm.js';

export interface NarrateReport {
  worldsNamed: number;
  stationsDescribed: number;
  synapsesAnnotated: number;
  linesGenerated: number;
  model: string;
  provider: string;
}

interface NarrateContext {
  provider: LLMProvider;
  config: NarrateConfig;
  schema: SubwaySchema;
  stationMap: Map<string, Station>;
}

/**
 * Run the NARRATE phase using batched LLM calls.
 * Each batch describes multiple items at once.
 */
export async function runNarrate(
  schema: SubwaySchema,
  cliOptions: Partial<NarrateConfig> = {},
): Promise<NarrateReport> {
  const config = resolveNarrateConfig(cliOptions);

  console.log(`  📖  Phase 4: NARRATE — LLM narration`);
  console.log(`      Provider: ${config.provider}`);
  console.log(`      Model:    ${config.model}`);

  let provider: LLMProvider;
  try {
    provider = createLLMProvider(config);
    const available = await provider.isAvailable();
    if (!available) {
      throw new Error(`${config.provider.toUpperCase()} is not available.`);
    }
  } catch (err) {
    console.warn(`      ⚠  LLM not available: ${err instanceof Error ? err.message : String(err)}`);
    console.warn('      Skipping narration — map will use auto-generated descriptions.');
    return zeroReport(config);
  }

  const ctx: NarrateContext = {
    provider, config, schema,
    stationMap: new Map(schema.stations.map(s => [s.id, s])),
  };

  const stats = { worlds: 0, stations: 0, synapses: 0, lines: 0 };

  try { stats.worlds = await narrateWorldsBatch(ctx); } catch (e) { warn(e, 'worlds'); }
  try { stats.stations = await narrateStationsBatch(ctx); } catch (e) { warn(e, 'stations'); }
  try { stats.synapses = await narrateSynapsesBatch(ctx); } catch (e) { warn(e, 'synapses'); }
  try { stats.lines = await narrateLinesBatch(ctx); } catch (e) { warn(e, 'lines'); }

  console.log(`      ✓ ${stats.worlds}/${schema.worlds.length} worlds named, ${stats.stations}/${schema.stations.length} stations described`);
  console.log(`      ✓ ${stats.synapses}/${schema.synapses.length} synapses annotated, ${stats.lines} lines generated`);

  return {
    worldsNamed: stats.worlds,
    stationsDescribed: stats.stations,
    synapsesAnnotated: stats.synapses,
    linesGenerated: stats.lines,
    model: config.model,
    provider: config.provider,
  };
}

function warn(e: unknown, phase: string): void {
  console.warn(`      ⚠  ${phase}: ${(e as Error).message}`);
}

function zeroReport(config: NarrateConfig): NarrateReport {
  return { worldsNamed: 0, stationsDescribed: 0, synapsesAnnotated: 0, linesGenerated: 0, model: config.model, provider: config.provider };
}

// ---- Batch: Worlds ----

async function narrateWorldsBatch(ctx: NarrateContext): Promise<number> {
  const items = ctx.schema.worlds.map(w => {
    const sts = ctx.schema.stations.filter(s => s.world === w.id).map(s => s.label).join(', ');
    return `  "${w.id}": stations=[${sts}]`;
  }).join('\n');

  const prompt = [
    'You are analyzing a software codebase. Name each "World" (logical domain) below.',
    'Give each a human-readable name (1-3 words) and a 1-sentence description.',
    '\nWorlds to name:',
    items,
    '\nReturn JSON: { "worlds": { "<world-id>": { "name": "...", "description": "..." } } }',
  ].join('\n');

  const raw = await ctx.provider.chat([{ role: 'user', content: prompt }], true);
  const data = JSON.parse(extractJson(raw));

  let count = 0;
  const named = data.worlds ?? data;
  for (const world of ctx.schema.worlds) {
    const info = named[world.id];
    if (info?.name) {
      world.name = info.name;
      world.description = info.description ?? world.description;
      count++;
    }
  }
  return count;
}

// ---- Batch: Stations (batch size: 10) ----

async function narrateStationsBatch(ctx: NarrateContext): Promise<number> {
  const BATCH = 10;
  let count = 0;

  for (let i = 0; i < ctx.schema.stations.length; i += BATCH) {
    const batch = ctx.schema.stations.slice(i, i + BATCH);
    const items = batch.map(s =>
      `  "${s.id}": label="${s.label}", world="${s.world}", role=${s.role}, files=[${s.files.join(', ')}], weights=influence:${(s.weight.influence*100).toFixed(0)}% dependency:${(s.weight.dependency*100).toFixed(0)}% churn:${(s.weight.churn*100).toFixed(0)}% centrality:${(s.weight.centrality*100).toFixed(0)}%`
    ).join('\n');

    const prompt = [
      'You are analyzing software components. For each component below, write a 1-sentence description of its purpose.',
      'If the role looks wrong, suggest a better one: start, hub, checkpoint, importance, terminal.',
      'If terminal, add terminalType: success, failure, or partial.',
      '\nComponents:',
      items,
      '\nReturn JSON: { "stations": { "<id>": { "description": "...", "role": "...?", "terminalType": "..." } } }',
    ].join('\n');

    const raw = await ctx.provider.chat([{ role: 'user', content: prompt }], true);
    const data = JSON.parse(extractJson(raw));
    const described = data.stations ?? data;

    for (const s of batch) {
      const info = described[s.id];
      if (info?.description) {
        s.description = info.description;
        if (info.role && ['start','hub','checkpoint','importance','terminal'].includes(info.role)) {
          s.role = info.role;
        }
        if (info.terminalType) s.terminalType = info.terminalType;
        count++;
      }
    }
  }
  return count;
}

// ---- Batch: Synapses (batch size: 15) ----

async function narrateSynapsesBatch(ctx: NarrateContext): Promise<number> {
  const BATCH = 15;
  let count = 0;

  for (let i = 0; i < ctx.schema.synapses.length; i += BATCH) {
    const batch = ctx.schema.synapses.slice(i, i + BATCH);
    const items = batch.map(s => {
      const from = ctx.stationMap.get(s.from)?.label ?? s.from;
      const to = ctx.stationMap.get(s.to)?.label ?? s.to;
      return `  ${s.from}→${s.to}: "${from}"→"${to}", current: "${s.condition.description}"`;
    }).join('\n');

    const prompt = [
      'You are annotating code transitions. Rewrite each condition as a clear human-readable sentence.',
      'Classify each as: api_response, user_role, device_state, config_flag, data_value, or always.',
      '\nTransitions:',
      items,
      '\nReturn JSON: { "synapses": { "<from>→<to>": { "description": "...", "type": "..." } } }',
    ].join('\n');

    const raw = await ctx.provider.chat([{ role: 'user', content: prompt }], true);
    const data = JSON.parse(extractJson(raw));
    const annotated = data.synapses ?? data;

    for (const s of batch) {
      const key = `${s.from}→${s.to}`;
      const info = annotated[key];
      if (info?.description) {
        s.condition.description = info.description;
        if (info.type) s.condition.type = info.type;
        count++;
      }
    }
  }
  return count;
}

// ---- Batch: Lines ----

async function narrateLinesBatch(ctx: NarrateContext): Promise<number> {
  const starts = ctx.schema.stations.filter(s => s.role === 'start' || s.role === 'hub');
  if (starts.length === 0) return 0;

  const stationList = ctx.schema.stations.slice(0, 30).map(s =>
    `  ${s.id}: ${s.label} (${s.role})`
  ).join('\n');

  const synapseList = ctx.schema.synapses.slice(0, 50).map(s =>
    `  ${s.from} → ${s.to}: ${s.condition.description}`
  ).join('\n');

  const entryIds = starts.slice(0, 3).map(s => s.id).join(', ');

  const prompt = [
    'You are tracing user flows through a codebase graph. Identify 3-5 realistic end-to-end flows.',
    `Entry points: ${entryIds}`,
    '\nStations:',
    stationList,
    '\nTransitions:',
    synapseList,
    '\nReturn JSON: { "lines": [{ "name": "Flow name", "path": ["id1","id2","id3"], "outcome": "success|failure|partial", "conditions": ["desc"] }] }',
  ].join('\n');

  const raw = await ctx.provider.chat([{ role: 'user', content: prompt }], true);
  const data = JSON.parse(extractJson(raw));
  const lineList = data.lines ?? [];

  const newLines: Line[] = [];
  for (const l of lineList) {
    if (l.name && Array.isArray(l.path) && l.path.length >= 2) {
      const valid = l.path.filter((id: string) => ctx.stationMap.has(id));
      if (valid.length >= 2) {
        newLines.push({
          id: `line_${ctx.schema.lines.length + newLines.length}`,
          name: l.name,
          world: ctx.schema.stations.find(s => s.id === valid[0])?.world ?? 'core',
          color: '#4cc9f0',
          path: valid,
          conditions: Array.isArray(l.conditions) ? l.conditions : [],
          outcome: l.outcome ?? 'success',
        });
      }
    }
  }

  ctx.schema.lines.push(...newLines);
  ctx.schema.meta.totalLines = ctx.schema.lines.length;
  return newLines.length;
}

// ---- JSON extraction ----

function extractJson(raw: string): string {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) return match[1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) return raw.slice(start, end + 1);
  return raw.trim();
}
