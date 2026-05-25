#!/usr/bin/env node

/**
 * Subway MCP Server — Binary Entry Point
 *
 * Starts the Subway MCP server using stdio transport.
 * Compatible with Claude Desktop, Cursor, Copilot, and any MCP-compatible client.
 *
 * Usage:
 *   npx subway-mcp
 *   npx subway-mcp --file ./custom/subway.json
 *
 * Environment variables:
 *   SUBWAY_FILE — path to subway.json
 *   SUBWAY_EMBED_API_KEY / OPENAI_API_KEY — for vector search
 *   SUBWAY_EMBED_PROVIDER — embedding provider (ollama or openai)
 */
import { Command } from 'commander';
import * as fs from 'node:fs';
import { startMcpServer } from './mcp/index.js';

const packageJson = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
);

const program = new Command();

program
  .name('subway-mcp')
  .description('Subway MCP Server — Map your codebase. Every search is a synapse.')
  .version(packageJson.version)
  .option('-f, --file <path>', 'Path to subway.json', process.env.SUBWAY_FILE)
  .action(async (options) => {
    try {
      await startMcpServer(options.file);
    } catch (err) {
      console.error(
        `Failed to start Subway MCP Server: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  });

program.parse(process.argv);
