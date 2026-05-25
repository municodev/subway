/**
 * MapSession — In-memory subway.json schema manager for LLM-guided map building.
 *
 * When an LLM builds a subway map interactively via MCP tools, the schema
 * accumulates in this session. Read tools (search, station, path, etc.)
 * also use the session schema when active, so the LLM can inspect its
 * work-in-progress as it builds.
 */
import * as path from 'node:path';
import * as fs from 'node:fs';
import type {
  SubwaySchema,
  Station,
  Synapse,
  World,
  Line,
  StationRole,
  TerminalType,
  SynapseCondition,
  SynapseDirection,
  LineOutcome,
  ProjectEcosystem,
} from '../types/index.js';

/** Result from scanning a project for files and structure */
export interface ProjectScanResult {
  projectRoot: string;
  projectName: string;
  totalFiles: number;
  fileList: Array<{ path: string; ext: string; size: number }>;
  topLevelDirs: string[];
  languages: string[];
  entryPoints: string[];
  frameworkHints: string[];
  /** Full ecosystem detection result — languages, frameworks, package manager, key deps */
  ecosystem: {
    primaryLanguage: string | null;
    languages: string[];
    frameworks: string[];
    packageManager: string | null;
    dependencies: string[];
    configFiles: string[];
  };
}

/** Stats about the current build session */
export interface SessionStatus {
  stationCount: number;
  synapseCount: number;
  worldCount: number;
  lineCount: number;
  stationsByWorld: Record<string, number>;
  stationsByRole: Record<string, number>;
  hasDescriptions: boolean;
  hasLines: boolean;
}

/**
 * Manages an in-memory subway.json schema during LLM-guided map building.
 */
export class MapSession {
  public schema: SubwaySchema;
  public projectRoot: string;
  /** Cache of file contents keyed by relative path */
  public fileCache: Map<string, string> = new Map();
  private _worldColors: string[] = [
    '#f5a623', // auth gold
    '#4cc9f0', // info cyan
    '#f72585', // accent pink
    '#7209b7', // purple
    '#06d6a0', // green
    '#ef476f', // red
    '#ffd166', // yellow
    '#118ab2', // blue
    '#073b4c', // dark teal
    '#e36414', // orange
    '#8338ec', // violet
    '#ffbe0b', // bright yellow
    '#fb5607', // orange-red
    '#3a86ff', // bright blue
    '#ff006e', // hot pink
  ];
  private _nextColorIndex = 0;

  constructor(projectRoot: string, projectName: string) {
    this.projectRoot = projectRoot;

    const now = new Date().toISOString();

    this.schema = {
      meta: {
        project: projectName,
        version: '3.0',
        generated: now,
        entryPoint: '',
        totalStations: 0,
        totalSynapses: 0,
        totalLines: 0,
        totalWorlds: 0,
        languages: [],
      },
      worlds: [],
      stations: [],
      synapses: [],
      lines: [],
    };
  }

  // ---- Station management ----

  /**
   * Add a station to the schema. If a station with the same ID exists,
   * it will be replaced.
   */
  addStation(station: Omit<Station, 'weight' | 'authors' | 'lastModified' | 'commitCount' | 'embedding'> & {
    weight?: Partial<Station['weight']>;
    authors?: string[];
  }): Station {
    const id = this.ensureUniqueId(station.id);

    const fullStation: Station = {
      id,
      label: station.label,
      world: station.world,
      role: station.role,
      terminalType: station.terminalType ?? null,
      files: station.files ?? [],
      description: station.description ?? '',
      weight: {
        influence: station.weight?.influence ?? 0,
        dependency: station.weight?.dependency ?? 0,
        churn: station.weight?.churn ?? 0,
        centrality: station.weight?.centrality ?? 0,
      },
      authors: station.authors ?? [],
      lastModified: new Date().toISOString(),
      commitCount: 0,
    };

    // Replace or add
    const existingIdx = this.schema.stations.findIndex(s => s.id === id);
    if (existingIdx >= 0) {
      this.schema.stations[existingIdx] = fullStation;
    } else {
      this.schema.stations.push(fullStation);
    }

    // Ensure world exists and includes this station
    this._ensureWorldHasStation(station.world, id);

    this._updateMeta();
    return fullStation;
  }

  /**
   * Remove a station and all its associated synapses.
   */
  removeStation(id: string): boolean {
    const idx = this.schema.stations.findIndex(s => s.id === id);
    if (idx < 0) return false;

    this.schema.stations.splice(idx, 1);

    // Remove all synapses involving this station
    this.schema.synapses = this.schema.synapses.filter(
      s => s.from !== id && s.to !== id,
    );

    // Remove from line paths
    for (const line of this.schema.lines) {
      line.path = line.path.filter(p => p !== id);
    }
    this.schema.lines = this.schema.lines.filter(l => l.path.length > 0);

    // Remove from world station lists
    for (const world of this.schema.worlds) {
      world.stations = world.stations.filter(s => s !== id);
    }

    this._updateMeta();
    return true;
  }

  /**
   * Update specific fields of an existing station.
   */
  updateStation(id: string, updates: Partial<Pick<Station, 'label' | 'world' | 'role' | 'terminalType' | 'files' | 'description' | 'weight' | 'authors'>>): Station | null {
    const station = this.schema.stations.find(s => s.id === id);
    if (!station) return null;

    if (updates.label !== undefined) station.label = updates.label;
    if (updates.world !== undefined) {
      const oldWorld = station.world;
      station.world = updates.world;
      // Move station between world lists
      if (oldWorld !== updates.world) {
        const oldW = this.schema.worlds.find(w => w.id === oldWorld);
        if (oldW) {
          oldW.stations = oldW.stations.filter(s => s !== id);
        }
        this._ensureWorldHasStation(updates.world, id);
      }
    }
    if (updates.role !== undefined) station.role = updates.role;
    if (updates.terminalType !== undefined) station.terminalType = updates.terminalType;
    if (updates.files !== undefined) station.files = updates.files;
    if (updates.description !== undefined) station.description = updates.description;
    if (updates.weight !== undefined) {
      station.weight = { ...station.weight, ...updates.weight };
    }
    if (updates.authors !== undefined) station.authors = updates.authors;
    station.lastModified = new Date().toISOString();

    this._updateMeta();
    return station;
  }

  // ---- World management ----

  /**
   * Add or update a world. If a world with the same ID exists, it will be replaced.
   */
  addWorld(world: { id: string; name: string; color?: string; description?: string }): World {
    const color = world.color ?? this._nextColor();
    const fullWorld: World = {
      id: world.id,
      name: world.name,
      color,
      description: world.description ?? `${world.name} domain`,
      stations: [],
    };

    const existingIdx = this.schema.worlds.findIndex(w => w.id === world.id);
    if (existingIdx >= 0) {
      // Preserve existing stations list
      fullWorld.stations = this.schema.worlds[existingIdx].stations;
      this.schema.worlds[existingIdx] = fullWorld;
    } else {
      this.schema.worlds.push(fullWorld);
    }

    this._updateMeta();
    return fullWorld;
  }

  // ---- Synapse management ----

  /**
   * Add a synapse (transition) between two stations.
   */
  addSynapse(synapse: {
    from: string;
    to: string;
    condition: SynapseCondition;
    direction?: SynapseDirection;
    isCritical?: boolean;
    strength?: number;
  }): Synapse | null {
    // Verify both stations exist
    const fromStation = this.schema.stations.find(s => s.id === synapse.from);
    const toStation = this.schema.stations.find(s => s.id === synapse.to);
    if (!fromStation || !toStation) return null;

    const fullSynapse: Synapse = {
      from: synapse.from,
      to: synapse.to,
      condition: synapse.condition,
      direction: synapse.direction ?? 'forward',
      isCritical: synapse.isCritical ?? false,
      strength: synapse.strength ?? 0.5,
    };

    // Avoid exact duplicates
    const duplicate = this.schema.synapses.find(
      s => s.from === synapse.from && s.to === synapse.to &&
           s.direction === (synapse.direction ?? 'forward'),
    );
    if (duplicate) {
      // Update the existing one
      Object.assign(duplicate, fullSynapse);
    } else {
      this.schema.synapses.push(fullSynapse);
    }

    this._updateMeta();
    return fullSynapse;
  }

  /**
   * Remove a synapse by from/to pair.
   */
  removeSynapse(from: string, to: string): boolean {
    const idx = this.schema.synapses.findIndex(s => s.from === from && s.to === to);
    if (idx < 0) return false;
    this.schema.synapses.splice(idx, 1);
    this._updateMeta();
    return true;
  }

  // ---- Line management ----

  /**
   * Add a line (complete end-to-end flow).
   */
  addLine(line: {
    id: string;
    name: string;
    world?: string;
    color?: string;
    path: string[];
    conditions?: string[];
    outcome?: LineOutcome;
  }): Line | null {
    // Verify all stations in path exist
    for (const stationId of line.path) {
      if (!this.schema.stations.find(s => s.id === stationId)) {
        return null; // station not found
      }
    }

    const fullLine: Line = {
      id: this.ensureUniqueId(line.id, 'line_'),
      name: line.name,
      world: line.world ?? this.schema.stations.find(s => s.id === line.path[0])?.world ?? 'core',
      color: line.color ?? '#4cc9f0',
      path: line.path,
      conditions: line.conditions ?? [],
      outcome: line.outcome ?? 'success',
    };

    this.schema.lines.push(fullLine);
    this._updateMeta();
    return fullLine;
  }

  // ---- Query helpers ----

  /**
   * Get the current status of the session.
   */
  getStatus(): SessionStatus {
    const stationsByWorld: Record<string, number> = {};
    const stationsByRole: Record<string, number> = {};
    let hasDescriptions = false;

    for (const s of this.schema.stations) {
      stationsByWorld[s.world] = (stationsByWorld[s.world] ?? 0) + 1;
      stationsByRole[s.role] = (stationsByRole[s.role] ?? 0) + 1;
      if (s.description && s.description.length > 10) {
        hasDescriptions = true;
      }
    }

    return {
      stationCount: this.schema.stations.length,
      synapseCount: this.schema.synapses.length,
      worldCount: this.schema.worlds.length,
      lineCount: this.schema.lines.length,
      stationsByWorld,
      stationsByRole,
      hasDescriptions,
      hasLines: this.schema.lines.length > 0,
    };
  }

  /**
   * List all stations, optionally filtered by world.
   */
  listStations(worldFilter?: string): Station[] {
    if (worldFilter) {
      return this.schema.stations.filter(s => s.world === worldFilter);
    }
    return [...this.schema.stations];
  }

  /**
   * Scan the project root and return a structural overview.
   * Auto-detects language, framework, and package ecosystem from
   * config files (package.json, go.mod, Cargo.toml, etc.).
   */
  scanProject(ignoreDirs: Set<string> = new Set([
    'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
    'coverage', '.cache', '__pycache__', 'vendor', '.pnpm',
    'android', 'ios', '.expo', '.turbo', '.parcel-cache',
    'target', 'bin', 'obj', 'out', '.dart_tool', '.gradle',
    'Pods', '.bundle', 'venv', '.venv', 'env',
    '.serverless', '.terraform', '.cdk',
  ])): ProjectScanResult {
    const fileList: ProjectScanResult['fileList'] = [];
    const extensions = new Set<string>();
    const topLevelDirs: string[] = [];
    const entryPoints: string[] = [];
    const frameworkHints: string[] = [];

    // ALL recognized source-file extensions (language-agnostic)
    const SRC_EXTS = new Set([
      // JS/TS
      '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts',
      // Python
      '.py', '.pyw', '.pyx',
      // Ruby
      '.rb', '.rake', '.gemspec',
      // Go
      '.go',
      // Rust
      '.rs',
      // Kotlin / Java
      '.kt', '.kts', '.java',
      // Swift
      '.swift',
      // Dart
      '.dart',
      // C#
      '.cs',
      // PHP
      '.php', '.phtml',
      // C / C++
      '.c', '.h', '.cpp', '.cc', '.cxx', '.hpp', '.hxx',
      // Shell
      '.sh', '.bash', '.zsh',
      // SQL
      '.sql',
      // Config / data
      '.yaml', '.yml', '.json', '.toml',
      // Docs
      '.md', '.mdx',
      // Web
      '.html', '.htm', '.css', '.scss', '.sass', '.less',
    ]);

    // ---- FIRST PASS: detect ecosystem from config files ----
    const ecosystem = this._detectEcosystem();
    this.schema.meta.languages = ecosystem.languages;

    function walk(dir: string, depth: number, relativePrefix: string) {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = relativePrefix ? path.join(relativePrefix, entry.name) : entry.name;

        if (entry.isDirectory()) {
          if (ignoreDirs.has(entry.name)) continue;

          if (depth === 0) {
            topLevelDirs.push(entry.name);
          }

          // Limit recursion depth for scan to 3 levels
          if (depth < 3) {
            walk(fullPath, depth + 1, relPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (ext) extensions.add(ext);

          if (SRC_EXTS.has(ext)) {
            let size = 0;
            try {
              size = fs.statSync(fullPath).size;
            } catch { /* ignore */ }

            fileList.push({ path: relPath, ext, size });

            // Detect entry points by filename AND ecosystem
            const base = entry.name.toLowerCase();
            if (_isEntryPoint(base, ecosystem)) {
              entryPoints.push(relPath);
            }

            // Detect framework hints from filenames
            if (base.includes('route') || base.includes('router')) {
              frameworkHints.push(`Router config: ${relPath}`);
            }
            if (base.includes('layout')) {
              frameworkHints.push(`Layout: ${relPath}`);
            }
            if (base.includes('controller')) {
              frameworkHints.push(`Controller: ${relPath}`);
            }
            if (base.includes('model') || base.includes('schema')) {
              frameworkHints.push(`Model/Schema: ${relPath}`);
            }
            if (base.includes('middleware')) {
              frameworkHints.push(`Middleware: ${relPath}`);
            }
          }
        }
      }
    }

    walk(this.projectRoot, 0, '');
    fileList.sort((a, b) => a.path.localeCompare(b.path));

    return {
      projectRoot: this.projectRoot,
      projectName: this.schema.meta.project,
      totalFiles: fileList.length,
      fileList,
      topLevelDirs,
      languages: [...extensions],
      entryPoints,
      frameworkHints,
      ecosystem: {
        primaryLanguage: ecosystem.languages[0] ?? null,
        languages: ecosystem.languages,
        frameworks: ecosystem.frameworks,
        packageManager: ecosystem.packageManager,
        dependencies: ecosystem.dependencies.slice(0, 40), // cap for context size
        configFiles: ecosystem.configFiles,
      },
    };
  }

  /**
   * Read a file relative to the project root, caching it.
   */
  readFile(relativePath: string): string | null {
    // Check cache first
    if (this.fileCache.has(relativePath)) {
      return this.fileCache.get(relativePath)!;
    }

    const fullPath = path.resolve(this.projectRoot, relativePath);

    // Security: ensure the path is within the project root
    if (!fullPath.startsWith(this.projectRoot)) {
      return null;
    }

    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      // Limit size to 50KB to avoid overwhelming the LLM context
      const truncated = content.length > 50_000
        ? content.slice(0, 50_000) + '\n\n--- [TRUNCATED: file too large] ---'
        : content;
      this.fileCache.set(relativePath, truncated);
      return truncated;
    } catch {
      return null;
    }
  }

  /**
   * List contents of a directory relative to the project root.
   */
  readDir(relativePath: string): { name: string; type: 'file' | 'directory'; size?: number }[] | null {
    const fullPath = path.resolve(this.projectRoot, relativePath);

    if (!fullPath.startsWith(this.projectRoot)) {
      return null;
    }

    try {
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      return entries.map(e => ({
        name: e.name,
        type: (e.isDirectory() ? 'directory' : 'file') as 'file' | 'directory',
        size: e.isFile() ? (() => { try { return fs.statSync(path.join(fullPath, e.name)).size; } catch { return undefined; } })() : undefined,
      })).sort((a, b) => {
        // directories first, then alphabetical
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    } catch {
      return null;
    }
  }

  /**
   * Save the current schema to a subway.json file.
   */
  save(outputPath: string): string {
    this.schema.meta.generated = new Date().toISOString();
    this._updateMeta();

    const fullPath = path.resolve(this.projectRoot, outputPath);

    // Ensure parent directory exists
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, JSON.stringify(this.schema, null, 2), 'utf-8');
    return fullPath;
  }

  // ---- Private helpers ----

  /**
   * Auto-detect the project ecosystem from config/manifest files.
   * Reads package.json, go.mod, Cargo.toml, pyproject.toml, etc.
   * to determine primary language, frameworks, package manager, and key dependencies.
   */
  private _detectEcosystem(): ProjectEcosystem {
    const configFiles: string[] = [];
    const languages: string[] = [];
    const frameworks: string[] = [];
    let packageManager: string | null = null;
    const dependencies: string[] = [];

    const root = this.projectRoot;

    // ---- Node.js / JavaScript / TypeScript ----
    const pkgJsonPath = path.join(root, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      configFiles.push('package.json');
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        const depNames = Object.keys(allDeps);

        // Detect language
        if (depNames.some((d: string) => d === 'typescript' || d.startsWith('@types/'))) {
          languages.push('typescript');
        } else {
          languages.push('javascript');
        }

        // Detect package manager from lock files
        if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) packageManager = 'pnpm';
        else if (fs.existsSync(path.join(root, 'yarn.lock'))) packageManager = 'yarn';
        else if (fs.existsSync(path.join(root, 'bun.lockb'))) packageManager = 'bun';
        else packageManager = 'npm';

        // Key dependencies
        dependencies.push(...depNames.slice(0, 30));

        // Framework detection
        if (depNames.includes('react')) frameworks.push('react');
        if (depNames.includes('next')) frameworks.push('nextjs');
        if (depNames.includes('vue')) frameworks.push('vue');
        if (depNames.includes('nuxt')) frameworks.push('nuxt');
        if (depNames.includes('svelte')) frameworks.push('svelte');
        if (depNames.includes('@angular/core')) frameworks.push('angular');
        if (depNames.includes('express')) frameworks.push('express');
        if (depNames.includes('fastify')) frameworks.push('fastify');
        if (depNames.includes('@nestjs/core')) frameworks.push('nestjs');
        if (depNames.includes('expo')) frameworks.push('expo');
        if (depNames.includes('react-native')) frameworks.push('react-native');
        if (depNames.includes('@modelcontextprotocol/sdk')) frameworks.push('mcp-server');
        if (depNames.includes('vite')) frameworks.push('vite');
        if (depNames.includes('webpack')) frameworks.push('webpack');
        if (depNames.includes('electron')) frameworks.push('electron');
      } catch { /* ignore malformed package.json */ }
    }

    // ---- Python ----
    const pyprojectPath = path.join(root, 'pyproject.toml');
    const requirementsPath = path.join(root, 'requirements.txt');
    const setupPy = path.join(root, 'setup.py');
    const setupCfg = path.join(root, 'setup.cfg');

    if (fs.existsSync(pyprojectPath)) {
      configFiles.push('pyproject.toml');
      try {
        const content = fs.readFileSync(pyprojectPath, 'utf-8');
        // Simple heuristic: look for Python frameworks in the TOML
        if (content.includes('django')) frameworks.push('django');
        if (content.includes('flask')) frameworks.push('flask');
        if (content.includes('fastapi')) frameworks.push('fastapi');
        if (content.includes('sqlalchemy')) frameworks.push('sqlalchemy');
        if (content.includes('pydantic')) frameworks.push('pydantic');
        // Detect package manager
        if (content.includes('[tool.poetry]')) packageManager = 'poetry';
        else if (content.includes('[tool.uv]')) packageManager = 'uv';
        else if (content.includes('[build-system]') && content.includes('setuptools')) packageManager = 'pip';
        else packageManager = 'pip';
        // Extract dependencies
        const depMatch = content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
        if (depMatch) {
          const deps = depMatch[1].match(/"([^"]+)"/g);
          if (deps) dependencies.push(...deps.map((d: string) => d.replace(/"/g, '')).slice(0, 30));
        }
        languages.push('python');
      } catch { /* ignore */ }
    }
    if (fs.existsSync(requirementsPath)) {
      configFiles.push('requirements.txt');
      if (!languages.includes('python')) languages.push('python');
      try {
        const content = fs.readFileSync(requirementsPath, 'utf-8');
        const deps = content.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('-'));
        dependencies.push(...deps.slice(0, 30));
        if (deps.some(d => d.includes('django'))) frameworks.push('django');
        if (deps.some(d => d.includes('flask'))) frameworks.push('flask');
        if (deps.some(d => d.includes('fastapi'))) frameworks.push('fastapi');
      } catch { /* ignore */ }
    }
    if (fs.existsSync(setupPy)) {
      configFiles.push('setup.py');
      if (!languages.includes('python')) languages.push('python');
    }
    if (fs.existsSync(setupCfg)) {
      configFiles.push('setup.cfg');
      if (!languages.includes('python')) languages.push('python');
    }

    // ---- Ruby ----
    const gemfile = path.join(root, 'Gemfile');
    if (fs.existsSync(gemfile)) {
      configFiles.push('Gemfile');
      languages.push('ruby');
      packageManager = 'bundler';
      try {
        const content = fs.readFileSync(gemfile, 'utf-8');
        if (content.includes('rails')) frameworks.push('rails');
        if (content.includes('sinatra')) frameworks.push('sinatra');
        if (content.includes('rspec')) frameworks.push('rspec');
        const gemMatches = content.match(/gem\s+['"]([^'"]+)['"]/g);
        if (gemMatches) dependencies.push(...gemMatches.map((g: string) => g.replace(/gem\s+['"]/, '').replace(/['"]$/, '')).slice(0, 30));
      } catch { /* ignore */ }
    }

    // ---- Go ----
    const goMod = path.join(root, 'go.mod');
    if (fs.existsSync(goMod)) {
      configFiles.push('go.mod');
      languages.push('go');
      packageManager = 'go modules';
      try {
        const content = fs.readFileSync(goMod, 'utf-8');
        if (content.includes('gin-gonic/gin')) frameworks.push('gin');
        if (content.includes('echo')) frameworks.push('echo');
        if (content.includes('fiber')) frameworks.push('fiber');
        if (content.includes('gorilla/mux')) frameworks.push('gorilla');
        if (content.includes('grpc')) frameworks.push('grpc');
        const reqMatch = content.match(/require\s*\(([\s\S]*?)\)/);
        if (reqMatch) {
          const deps = reqMatch[1].split('\n').filter((l: string) => l.trim() && !l.startsWith('//'));
          dependencies.push(...deps.map((d: string) => d.trim().split(' ')[0]).filter(Boolean).slice(0, 30));
        }
      } catch { /* ignore */ }
    }

    // ---- Rust ----
    const cargoToml = path.join(root, 'Cargo.toml');
    if (fs.existsSync(cargoToml)) {
      configFiles.push('Cargo.toml');
      languages.push('rust');
      packageManager = 'cargo';
      try {
        const content = fs.readFileSync(cargoToml, 'utf-8');
        if (content.includes('actix-web')) frameworks.push('actix-web');
        if (content.includes('axum')) frameworks.push('axum');
        if (content.includes('rocket')) frameworks.push('rocket');
        if (content.includes('tokio')) frameworks.push('tokio');
        if (content.includes('tauri')) frameworks.push('tauri');
        const depMatch = content.match(/\[dependencies\]([\s\S]*?)(\n\[|$)/);
        if (depMatch) {
          const deps = depMatch[1].split('\n').filter((l: string) => l.trim() && !l.startsWith('#') && !l.startsWith('['));
          dependencies.push(...deps.map((d: string) => d.split('=')[0].trim()).filter(Boolean).slice(0, 30));
        }
      } catch { /* ignore */ }
    }

    // ---- Dart / Flutter ----
    const pubspecYaml = path.join(root, 'pubspec.yaml');
    if (fs.existsSync(pubspecYaml)) {
      configFiles.push('pubspec.yaml');
      languages.push('dart');
      try {
        const content = fs.readFileSync(pubspecYaml, 'utf-8');
        if (content.includes('flutter')) frameworks.push('flutter');
        if (content.includes('dart') || content.includes('sdk:')) {
          if (!languages.includes('dart')) languages.push('dart');
        }
        packageManager = 'pub';
        // Extract dependencies from YAML
        const depSection = content.match(/dependencies:\s*\n([\s\S]*?)(\n\S|$)/);
        if (depSection) {
          const deps = depSection[1].split('\n').filter((l: string) => l.trim() && l.trim().startsWith('  ') && !l.trim().startsWith('#'));
          dependencies.push(...deps.map((d: string) => d.trim().split(':')[0].trim()).filter(Boolean).slice(0, 30));
        }
      } catch { /* ignore */ }
    }

    // ---- Kotlin / Java / Android ----
    const buildGradle = path.join(root, 'build.gradle') || path.join(root, 'build.gradle.kts');
    const settingsGradle = path.join(root, 'settings.gradle') || path.join(root, 'settings.gradle.kts');
    if (fs.existsSync(path.join(root, 'build.gradle.kts')) || fs.existsSync(path.join(root, 'build.gradle'))) {
      configFiles.push(fs.existsSync(path.join(root, 'build.gradle.kts')) ? 'build.gradle.kts' : 'build.gradle');
      languages.push('kotlin');
      packageManager = 'gradle';
      if (fs.existsSync(path.join(root, 'app', 'build.gradle.kts')) || fs.existsSync(path.join(root, 'app', 'build.gradle'))) {
        frameworks.push('android');
      }
      try {
        const gradlePath = fs.existsSync(path.join(root, 'build.gradle.kts'))
          ? path.join(root, 'build.gradle.kts') : path.join(root, 'build.gradle');
        const content = fs.readFileSync(gradlePath, 'utf-8');
        if (content.includes('compose')) frameworks.push('jetpack-compose');
        if (content.includes('ktor')) frameworks.push('ktor');
        if (content.includes('spring')) frameworks.push('spring');
        const depMatch = content.match(/implementation\s*\(\s*["']([^"']+)["']/g);
        if (depMatch) dependencies.push(...depMatch.map((d: string) => d.replace(/implementation\s*\(\s*["']/, '').replace(/["'].*$/, '')).slice(0, 30));
      } catch { /* ignore */ }
    }
    if (fs.existsSync(path.join(root, 'settings.gradle.kts')) || fs.existsSync(path.join(root, 'settings.gradle'))) {
      configFiles.push(fs.existsSync(path.join(root, 'settings.gradle.kts')) ? 'settings.gradle.kts' : 'settings.gradle');
    }

    // ---- Swift / Apple ----
    let xcodeproj: string | undefined;
    try {
      xcodeproj = fs.readdirSync(root).find(f => f.endsWith('.xcodeproj'));
    } catch {
      xcodeproj = undefined;
    }
    const packageSwift = path.join(root, 'Package.swift');
    if (xcodeproj || fs.existsSync(packageSwift) || fs.existsSync(path.join(root, 'Podfile'))) {
      if (xcodeproj) configFiles.push(xcodeproj);
      if (fs.existsSync(packageSwift)) configFiles.push('Package.swift');
      languages.push('swift');
      if (xcodeproj) frameworks.push('ios');
      if (fs.existsSync(packageSwift)) packageManager = 'swift-package-manager';
      if (fs.existsSync(path.join(root, 'Podfile'))) {
        configFiles.push('Podfile');
        packageManager = 'cocoapods';
      }
    }

    // ---- PHP ----
    const composerJson = path.join(root, 'composer.json');
    if (fs.existsSync(composerJson)) {
      configFiles.push('composer.json');
      languages.push('php');
      packageManager = 'composer';
      try {
        const composer = JSON.parse(fs.readFileSync(composerJson, 'utf-8'));
        const req = { ...composer.require, ...composer['require-dev'] };
        const depNames = Object.keys(req || {});
        dependencies.push(...depNames.slice(0, 30));
        if (depNames.includes('laravel/framework')) frameworks.push('laravel');
        if (depNames.includes('symfony/http-kernel')) frameworks.push('symfony');
        if (depNames.includes('slim/slim')) frameworks.push('slim');
      } catch { /* ignore */ }
    }

    // ---- C# / .NET ----
    let csproj: string | undefined;
    try {
      csproj = fs.readdirSync(root).find(f => f.endsWith('.csproj') || f.endsWith('.sln'));
    } catch {
      csproj = undefined;
    }
    if (csproj) {
      configFiles.push(csproj);
      languages.push('csharp');
      packageManager = 'nuget';
      if (csproj.endsWith('.sln')) frameworks.push('dotnet');
      // Try to detect ASP.NET
      try {
        const projFiles = fs.readdirSync(root).filter(f => f.endsWith('.csproj'));
        for (const pf of projFiles) {
          const content = fs.readFileSync(path.join(root, pf), 'utf-8');
          if (content.includes('Microsoft.AspNetCore')) frameworks.push('aspnet');
          if (content.includes('Microsoft.EntityFrameworkCore')) frameworks.push('entity-framework');
          const pkgRefs = content.match(/PackageReference\s+Include="([^"]+)"/g);
          if (pkgRefs) dependencies.push(...pkgRefs.map((p: string) => p.replace(/PackageReference\s+Include="/, '').replace(/"$/, '')).slice(0, 30));
        }
      } catch { /* ignore */ }
    }

    // ---- C / C++ ----
    const cmakeLists = path.join(root, 'CMakeLists.txt');
    const makefile = path.join(root, 'Makefile');
    if (fs.existsSync(cmakeLists)) {
      configFiles.push('CMakeLists.txt');
      languages.push('cpp');
      packageManager = 'cmake';
    } else if (fs.existsSync(makefile)) {
      configFiles.push('Makefile');
      languages.push('c');
    }

    // ---- Default to "unknown" if nothing detected ----
    if (languages.length === 0) {
      languages.push('unknown');
    }

    return { languages, frameworks, packageManager, dependencies, configFiles };
  }

  private _updateMeta(): void {
    this.schema.meta.totalStations = this.schema.stations.length;
    this.schema.meta.totalSynapses = this.schema.synapses.length;
    this.schema.meta.totalLines = this.schema.lines.length;
    this.schema.meta.totalWorlds = this.schema.worlds.length;
    if (this.schema.stations.length > 0) {
      this.schema.meta.entryPoint = this.schema.stations[0].id;
    }
    // Detect languages from file extensions
    const exts = new Set<string>();
    for (const s of this.schema.stations) {
      for (const f of s.files) {
        const ext = path.extname(f).toLowerCase();
        if (ext) exts.add(ext);
      }
    }
    if (exts.size > 0) {
      this.schema.meta.languages = [...exts].map(e => e.slice(1));
    }
  }

  private _ensureWorldHasStation(worldId: string, stationId: string): void {
    let world = this.schema.worlds.find(w => w.id === worldId);
    if (!world) {
      world = {
        id: worldId,
        name: this._capitalize(worldId),
        color: this._nextColor(),
        description: `${this._capitalize(worldId)} domain`,
        stations: [],
      };
      this.schema.worlds.push(world);
    }
    if (!world.stations.includes(stationId)) {
      world.stations.push(stationId);
    }
  }

  private _nextColor(): string {
    const color = this._worldColors[this._nextColorIndex % this._worldColors.length];
    this._nextColorIndex++;
    return color;
  }

  private _capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /**
   * Ensure an ID is unique by appending a suffix if needed.
   */
  private ensureUniqueId(baseId: string, prefix: string = ''): string {
    let id = prefix + baseId.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').toLowerCase();
    if (!id) id = 'unnamed';

    // Check uniqueness
    const allIds = new Set([
      ...this.schema.stations.map(s => s.id),
      ...this.schema.worlds.map(w => w.id),
      ...this.schema.lines.map(l => l.id),
    ]);

    if (!allIds.has(id)) return id;

    let n = 2;
    while (allIds.has(`${id}_${n}`)) n++;
    return `${id}_${n}`;
  }
}

/** Module-level singleton — one active session per MCP server process */
let _activeSession: MapSession | null = null;

// ---- Module-level helpers ----

/**
 * Determine if a file is a likely entry point based on its filename
 * and the detected project ecosystem. Language-agnostic.
 */
function _isEntryPoint(filename: string, ecosystem: ProjectEcosystem): boolean {
  const base = filename;
  const lang = ecosystem.languages[0] ?? '';
  const frameworks = ecosystem.frameworks;

  // Universal entry point patterns (any language)
  if (base === 'index.ts' || base === 'index.tsx' || base === 'index.js' || base === 'index.jsx') return true;
  if (base === 'main.ts' || base === 'main.tsx' || base === 'main.js') return true;
  if (base === 'app.ts' || base === 'app.tsx' || base === 'app.js') return true;
  if (base === 'server.ts' || base === 'server.js') return true;
  if (base === 'cli.ts' || base === 'cli.js') return true;

  // Python entry points
  if (lang === 'python') {
    if (base === 'main.py' || base === 'app.py' || base === 'manage.py' ||
        base === 'wsgi.py' || base === 'asgi.py' || base === '__init__.py') return true;
    if (frameworks.includes('django') && base === 'manage.py') return true;
    if (frameworks.includes('fastapi') && (base === 'main.py' || base === 'server.py')) return true;
  }

  // Ruby entry points
  if (lang === 'ruby') {
    if (base === 'main.rb' || base === 'app.rb' || base === 'server.rb') return true;
    if (frameworks.includes('rails') && (base === 'config.ru' || base === 'application.rb' ||
        base === 'routes.rb' || base.includes('application_controller'))) return true;
  }

  // Go entry points
  if (lang === 'go') {
    if (base === 'main.go' || base === 'server.go') return true;
  }

  // Rust entry points
  if (lang === 'rust') {
    if (base === 'main.rs' || base === 'lib.rs') return true;
  }

  // Kotlin / Java entry points
  if (lang === 'kotlin' || lang === 'java') {
    if (base.endsWith('Application.kt') || base.endsWith('Application.java') ||
        base === 'MainActivity.kt' || base === 'MainActivity.java' ||
        base === 'Main.kt' || base === 'Main.java') return true;
  }

  // Swift entry points
  if (lang === 'swift') {
    if (base === 'main.swift' || base.endsWith('App.swift') ||
        base.includes('AppDelegate') || base.includes('SceneDelegate')) return true;
  }

  // Dart / Flutter entry points
  if (lang === 'dart') {
    if (base === 'main.dart') return true;
  }

  // PHP entry points
  if (lang === 'php') {
    if (base === 'index.php' || base === 'server.php') return true;
    if (frameworks.includes('laravel') && base.includes('artisan')) return true;
  }

  // C# entry points
  if (lang === 'csharp') {
    if (base === 'Program.cs' || base === 'Startup.cs') return true;
  }

  // Generic patterns across languages
  if (base === 'index.html' || base === 'index.htm') return true;
  if (base.startsWith('Dockerfile')) return true;

  return false;
}

export function getActiveSession(): MapSession | null {
  return _activeSession;
}

export function setActiveSession(session: MapSession | null): void {
  _activeSession = session;
}

export function createSession(projectRoot: string, projectName?: string): MapSession {
  const session = new MapSession(
    projectRoot,
    projectName ?? path.basename(projectRoot),
  );
  _activeSession = session;
  return session;
}
