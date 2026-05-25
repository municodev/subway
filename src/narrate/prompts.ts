/**
 * Narration prompt templates.
 *
 * These templates are designed to be:
 * 1. Injected as prompts via CLI (calling Ollama/OpenAI)
 * 2. Used directly by an LLM agent (skill mode) without calling an external API
 *
 * Each template returns JSON for structured output.
 */

// ---- World naming & description ----

export function promptWorldNaming(
  worldId: string,
  stations: Array<{ id: string; label: string; files: string[]; role: string }>,
  exampleWorlds?: Array<{ id: string; name: string; description: string }>,
): string {
  const stationList = stations
    .map(s => `  - ${s.label} (role: ${s.role}, files: ${s.files.join(', ')})`)
    .join('\n');

  const exampleSection = exampleWorlds?.length
    ? `\nExamples of other worlds in this project (for style reference):\n${exampleWorlds.map(w => `  - ${w.id}: "${w.name}" — ${w.description}`).join('\n')}\n`
    : '';

  return `You are analyzing a software codebase. You are naming a "World" (a logical domain) that contains these stations:

World ID: "${worldId}"
Stations in this world:
${stationList}
${exampleSection}
Your task: give this world a human-readable name (1-3 words) and a concise description (1 sentence) that captures what this domain does.

Return JSON only:
{
  "name": "Human-readable name",
  "description": "One sentence describing this domain"
}`;
}

// ---- Station description & role refinement ----

export function promptStationDescription(
  label: string,
  currentRole: string,
  files: string[],
  world: string,
  weight: { influence: number; dependency: number; churn: number; centrality: number },
  conditions?: string[],
): string {
  const weightInfo = [
    `influence: ${(weight.influence * 100).toFixed(0)}% (how many others depend on it)`,
    `dependency: ${(weight.dependency * 100).toFixed(0)}% (external import ratio)`,
    `churn: ${(weight.churn * 100).toFixed(0)}% (change frequency)`,
    `centrality: ${(weight.centrality * 100).toFixed(0)}% (hub position in graph)`,
  ].join(', ');

  const condSection = conditions?.length
    ? `\nConditions found in source:\n${conditions.map(c => `  - ${c}`).join('\n')}`
    : '';

  return `You are analyzing a software component in a codebase.

Component: "${label}"
World: ${world}
Current role: ${currentRole}
Files: ${files.join(', ')}
Weights: ${weightInfo}
${condSection}
Write a concise 1-sentence description of what this component does. Then, if the current role seems wrong, suggest a better one from: start, hub, checkpoint, importance, terminal.
If it's a terminal, also specify: success, failure, or partial.

Return JSON only:
{
  "description": "One sentence describing what this component does",
  "role": "start|hub|checkpoint|importance|terminal",
  "terminalType": null or "success" or "failure" or "partial"
}`;
}

// ---- Synapse condition annotation ----

export function promptSynapseCondition(
  fromLabel: string,
  toLabel: string,
  currentCondition: string,
  currentType: string,
  codeContext?: string,
): string {
  const codeSection = codeContext
    ? `\nCode context near this transition:\n\`\`\`\n${codeContext}\n\`\`\``
    : '';

  return `You are annotating a transition between two components in a codebase.

From: "${fromLabel}"
To: "${toLabel}"
Current condition: "${currentCondition}" (type: ${currentType})
${codeSection}
Rewrite the condition as a clear human-readable sentence. Classify it as one of:
- api_response: depends on an API call result
- user_role: depends on user permissions/role
- device_state: depends on device/platform state
- config_flag: depends on a feature flag or build config
- data_value: depends on a data condition
- always: unconditional transition

Return JSON only:
{
  "description": "Clear human-readable condition sentence",
  "type": "api_response|user_role|device_state|config_flag|data_value|always"
}`;
}

// ---- Line (end-to-end flow) generation ----

export function promptLineGeneration(
  stations: Array<{ id: string; label: string; role: string; description: string }>,
  synapses: Array<{ from: string; to: string; description: string; direction: string }>,
  startStationId: string,
): string {
  const stationList = stations
    .map(s => `  - ${s.id}: ${s.label} (${s.role}) — ${s.description}`)
    .join('\n');

  const synapseList = synapses
    .map(s => `  - ${s.from} → ${s.to} [${s.direction}]: ${s.description}`)
    .join('\n');

  return `You are analyzing navigation flows in a codebase. Given this graph:

Stations:
${stationList}

Transitions:
${synapseList}

Starting from: "${startStationId}"

Identify 2-4 complete end-to-end flows (Lines) that represent realistic user journeys through this system. Each line starts at the start station and ends at a terminal.

For each line, provide a human-readable name, the ordered list of station IDs in the path, and the outcome (success, failure, or partial).

Return JSON only:
{
  "lines": [
    {
      "name": "Human-readable flow name",
      "path": ["station_id_1", "station_id_2", "..."],
      "outcome": "success|failure|partial",
      "conditions": ["condition description 1", "condition description 2"]
    }
  ]
}`;
}

// ---- Meta: project summary ----

export function promptProjectSummary(
  projectName: string,
  stationCount: number,
  worldCount: number,
  synapseCount: number,
  topStations: Array<{ label: string; world: string; influence: number; centrality: number }>,
): string {
  const topList = topStations
    .map(s => `  - ${s.label} [${s.world}] — influence: ${(s.influence*100).toFixed(0)}%, centrality: ${(s.centrality*100).toFixed(0)}%`)
    .join('\n');

  return `You are summarizing a codebase analysis for "${projectName}".

Stats: ${stationCount} stations, ${worldCount} worlds, ${synapseCount} synapses.

Most important stations (by influence × centrality):
${topList}

Write a 1-paragraph executive summary (2-3 sentences) of this codebase's architecture. What are the key domains? What patterns emerge?

Return JSON only:
{
  "summary": "Executive summary paragraph"
}`;
}
