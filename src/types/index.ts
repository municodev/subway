// ============================================================
// Subway — Core Type Definitions
// ============================================================
// These types define the subway.json v3.0 schema and all
// internal types used by the analysis pipeline.

// ---- Station Roles ----

export type StationRole = 'start' | 'hub' | 'checkpoint' | 'importance' | 'terminal';

export type TerminalType = 'success' | 'failure' | 'partial' | null;

// ---- Synapse Types ----

export type SynapseDirection = 'forward' | 'back' | 'both';

export type ConditionType =
  | 'api_response'
  | 'user_role'
  | 'device_state'
  | 'config_flag'
  | 'data_value'
  | 'always';

export interface SynapseCondition {
  description: string;
  type: ConditionType;
  value: string;
}

export interface Synapse {
  from: string;
  to: string;
  condition: SynapseCondition;
  direction: SynapseDirection;
  isCritical: boolean;
  strength: number;
}

// ---- Stations ----

export interface StationWeights {
  influence: number;   // 0–1: how many other stations depend on this
  dependency: number;  // 0–1: risk score (external deps / low test coverage)
  churn: number;       // 0–1: git change frequency
  centrality: number;  // 0–1: betweenness centrality in the graph
}

export interface Station {
  id: string;
  label: string;
  world: string;
  role: StationRole;
  terminalType: TerminalType;
  files: string[];
  description: string;
  weight: StationWeights;
  authors: string[];
  lastModified: string;   // ISO 8601
  commitCount: number;
  embedding?: number[];   // Fase 4
}

// ---- Worlds ----

export interface World {
  id: string;
  name: string;
  color: string;
  description: string;
  stations: string[];  // station IDs
}

// ---- Lines ----

export type LineOutcome = 'success' | 'failure' | 'partial';

export interface Line {
  id: string;
  name: string;
  world: string;
  color: string;
  path: string[];       // station IDs in order
  conditions: string[]; // human-readable condition summary
  outcome: LineOutcome;
}

// ---- Top-level Schema ----

export interface SubwayMeta {
  project: string;
  version: string;
  generated: string;      // ISO 8601
  entryPoint: string;
  totalStations: number;
  totalSynapses: number;
  totalLines: number;
  totalWorlds: number;
  languages: string[];
  embeddings_model?: string;
}

export interface SubwaySchema {
  meta: SubwayMeta;
  worlds: World[];
  stations: Station[];
  synapses: Synapse[];
  lines: Line[];
}

// ============================================================
// Internal types (not in subway.json)
// ============================================================

/** A file discovered during scanning */
export interface SourceFile {
  path: string;
  language: 'typescript' | 'javascript' | 'tsx' | 'jsx';
  content: string;
}

/** A detected entry point in the codebase */
export interface DetectedEntryPoint {
  file: string;
  kind: 'framework_app' | 'render_root' | 'server_listen' | 'export_default' | 'main_function';
  name: string;
  symbol: string;  // the export name or function name
  line: number;
}

/** A detected navigation call or router configuration */
export interface DetectedNavigation {
  file: string;
  kind: 'router_config' | 'navigate_call' | 'push_call' | 'link_component';
  target?: string;        // where it navigates to (if detectable)
  framework?: string;     // react-router, vue-router, react-navigation, etc.
  line: number;
}

/** A detected condition that may guard a transition */
export interface DetectedCondition {
  file: string;
  kind: 'if_statement' | 'switch_case' | 'ternary' | 'guard_clause' | 'optional_chain';
  description: string;    // human-readable summary
  code: string;           // the actual source text
  line: number;
}

/** A detected terminal node (end state) */
export interface DetectedTerminal {
  file: string;
  kind: 'success_screen' | 'error_screen' | 'error_boundary' | 'catch_block' | 'completion_handler' | 'toast_final';
  terminalType: TerminalType;
  description: string;
  line: number;
}

/** An import/export relationship between files */
export interface FileDependency {
  from: string;  // file path
  to: string;    // file path
  importedSymbols: string[];
}

/** Intermediate analysis result from TRACE phase */
export interface TraceResult {
  entryPoints: DetectedEntryPoint[];
  navigations: DetectedNavigation[];
  conditions: DetectedCondition[];
  terminals: DetectedTerminal[];
  dependencies: FileDependency[];
  files: SourceFile[];
}

/** Configuration for the TRACE module */
export interface TraceConfig {
  rootDir: string;
  ignoreDirs?: string[];
  frameworkHints?: string[];
}
