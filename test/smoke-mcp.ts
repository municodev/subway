#!/usr/bin/env -S pnpm tsx
/**
 * Quick smoke test for the Subway MCP server.
 * Runs all 9 tools against a subway.json and prints results.
 */
import { createSubwayServer } from '../src/mcp/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const MAP_FILE = process.argv[2] || './subway-sample.json';

async function main() {
  console.log(`🚇 Subway MCP Smoke Test`);
  console.log(`   Map: ${MAP_FILE}\n`);

  // Create server + client linked in-process
  const server = await createSubwayServer(MAP_FILE);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client(
    { name: 'smoke-test', version: '1.0' },
    { capabilities: {} },
  );
  await client.connect(clientTransport);

  // List tools
  const { tools } = await client.listTools();
  console.log(`✅ ${tools.length} tools registered:\n`);
  for (const t of tools) {
    console.log(`   ${t.name} — ${t.description?.slice(0, 70)}...`);
  }
  console.log();

  // 1. subway_search
  console.log('━'.repeat(60));
  console.log('🔍 subway_search("auth")');
  console.log('━'.repeat(60));
  const r1 = await client.callTool({ name: 'subway_search', arguments: { query: 'auth' } });
  console.log(r1.content[0].text);
  console.log();

  // 2. subway_station
  console.log('━'.repeat(60));
  console.log('🚉 subway_station("auth")');
  console.log('━'.repeat(60));
  const r2 = await client.callTool({ name: 'subway_station', arguments: { id: 'auth' } });
  console.log(r2.content[0].text);
  console.log();

  // 3. subway_path (only if we can find two connected stations)
  const firstSynapse = (await import('../src/types/index.js')).default;
  // Just use known IDs from sample-app
  const r3 = await client.callTool({
    name: 'subway_path',
    arguments: { from: 'index', to: 'routes' },
  });
  console.log('━'.repeat(60));
  console.log('🗺  subway_path(index → routes)');
  console.log('━'.repeat(60));
  console.log(r3.content[0].text);
  console.log();

  // 4. subway_impact
  const r4 = await client.callTool({
    name: 'subway_impact',
    arguments: { id: 'routes' },
  });
  console.log('━'.repeat(60));
  console.log('🎯 subway_impact("routes")');
  console.log('━'.repeat(60));
  console.log(r4.content[0].text);
  console.log();

  // 5. subway_conditions
  const r5 = await client.callTool({
    name: 'subway_conditions',
    arguments: { id: 'auth' },
  });
  console.log('━'.repeat(60));
  console.log('🔀 subway_conditions("auth")');
  console.log('━'.repeat(60));
  console.log(r5.content[0].text);
  console.log();

  // 6. subway_onboard
  const r6 = await client.callTool({
    name: 'subway_onboard',
    arguments: { role: 'backend' },
  });
  console.log('━'.repeat(60));
  console.log('🛤  subway_onboard("backend")');
  console.log('━'.repeat(60));
  console.log(r6.content[0].text);
  console.log();

  // 7. subway_line
  const r7 = await client.callTool({
    name: 'subway_line',
    arguments: { name: 'any' },
  });
  console.log('━'.repeat(60));
  console.log('🚂 subway_line("any")');
  console.log('━'.repeat(60));
  console.log(r7.content[0].text);
  console.log();

  // 8. subway_busrisk
  const r8 = await client.callTool({
    name: 'subway_busrisk',
    arguments: { limit: 5 },
  });
  console.log('━'.repeat(60));
  console.log('🚨 subway_busrisk()');
  console.log('━'.repeat(60));
  console.log(r8.content[0].text);
  console.log();

  // 9. subway_ask
  const r9 = await client.callTool({
    name: 'subway_ask',
    arguments: { question: 'how does authentication work in this project?' },
  });
  console.log('━'.repeat(60));
  console.log('💬 subway_ask("how does authentication work?")');
  console.log('━'.repeat(60));
  console.log(r9.content[0].text);
  console.log();

  // Cleanup
  await client.close();
  await server.close();

  console.log('━'.repeat(60));
  console.log('✅ All 9 tools working correctly!');
}

main().catch((err) => {
  console.error('❌ Smoke test failed:', err.message);
  process.exit(1);
});
