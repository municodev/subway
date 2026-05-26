import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

const CACHE_DIR = path.join(os.homedir(), '.subway');
const CACHE_FILE = path.join(CACHE_DIR, 'update-check.json');
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  lastCheck: string;   // ISO timestamp
  latestVersion: string;
}

function readCache(): CacheEntry | null {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (data && typeof data.lastCheck === 'string' && typeof data.latestVersion === 'string') {
      return data as CacheEntry;
    }
    return null;
  } catch {
    return null;
  }
}

function writeCache(entry: CacheEntry): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(entry, null, 2), 'utf-8');
  } catch {
    // silently ignore cache write failures
  }
}

/** Compare two semver-ish strings. Returns >0 if a > b, <0 if a < b, 0 if equal. */
function compareVersions(a: string, b: string): number {
  const aParts = a.replace(/^v/, '').split('.').map(Number);
  const bParts = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const an = aParts[i] ?? 0;
    const bn = bParts[i] ?? 0;
    if (an > bn) return 1;
    if (an < bn) return -1;
  }
  return 0;
}

/**
 * Check the npm registry for a newer version of the given package.
 * Caches results for CHECK_INTERVAL_MS (24h).
 * Returns the latest version string if a newer version is available, null otherwise.
 *
 * @param packageName  e.g. "@municode/subway"
 * @param currentVersion  e.g. "0.1.4"
 * @param quiet  if true, suppress console output (still returns the version if available)
 */
export async function checkForUpdates(
  packageName: string,
  currentVersion: string,
  quiet = false,
): Promise<string | null> {
  // 1. Check cache
  const cache = readCache();
  if (cache) {
    const age = Date.now() - new Date(cache.lastCheck).getTime();
    if (age < CHECK_INTERVAL_MS) {
      // Cache is fresh — compare cached version
      if (compareVersions(cache.latestVersion, currentVersion) > 0) {
        if (!quiet) printUpdateNotice(cache.latestVersion, currentVersion);
        return cache.latestVersion;
      }
      return null; // up to date, cache fresh
    }
  }

  // 2. Fetch from npm registry
  let latestVersion: string | null = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const encoded = encodeURIComponent(packageName).replace('%40', '@');
    const url = `https://registry.npmjs.org/${encoded}/latest`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      // npm registry returned non-2xx — update cache to avoid re-fetching
      writeCache({ lastCheck: new Date().toISOString(), latestVersion: currentVersion });
      return null;
    }

    const data = await response.json() as { version?: string };
    latestVersion = data.version ?? null;
  } catch {
    // Network error, timeout, or parse failure — update cache to avoid re-fetching
    writeCache({ lastCheck: new Date().toISOString(), latestVersion: currentVersion });
    return null;
  }

  if (!latestVersion) {
    writeCache({ lastCheck: new Date().toISOString(), latestVersion: currentVersion });
    return null;
  }

  // 3. Store in cache
  writeCache({ lastCheck: new Date().toISOString(), latestVersion });

  // 4. Compare and notify
  if (compareVersions(latestVersion, currentVersion) > 0) {
    if (!quiet) printUpdateNotice(latestVersion, currentVersion);
    return latestVersion;
  }

  return null;
}

function printUpdateNotice(latest: string, current: string): void {
  console.log('');
  console.log('  ┌──────────────────────────────────────────────────────┐');
  console.log(`  │  🚇  subway v${latest} is available!                      │`);
  console.log(`  │  You have v${current}.  Run \`subway update\` to upgrade.   │`);
  console.log('  └──────────────────────────────────────────────────────┘');
  console.log('');
}

/**
 * Self-update by running npm install -g <packageName>@latest.
 * Returns true on success, false on failure.
 */
export function selfUpdate(packageName: string): boolean {
  console.log('');
  console.log(`  🚇  Updating ${packageName} to latest...`);
  console.log('');

  try {
    execSync(`npm install -g ${packageName}@latest`, {
      stdio: 'inherit',
      env: { ...process.env },
    });
    // Clear cache so the next check reflects the new version
    try { fs.unlinkSync(CACHE_FILE); } catch { /* ok */ }
    console.log('');
    console.log('  ✓  Update complete!');
    console.log('');
    return true;
  } catch (err) {
    console.error('');
    console.error(`  ✗  Update failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error('  Try running manually: npm install -g @municode/subway@latest');
    console.error('');
    return false;
  }
}
