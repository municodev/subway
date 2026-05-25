# Subway Tasks

## Fase 0 — Schema & Golden Sample ✅
- [x] Costruito il golden sample per il progetto App Delivery (WIND3)
- [x] Validato il modello condizionale + ruoli
- [x] Scritta la spec Synaptic Search

## Fase 1 — Viewer React (MVP ✅)
- [x] Canvas D3-force con pan e zoom
- [x] World Filter Pills
- [x] Station Detail con pesi, files, autori, sinapsi, note
- [x] Lines Panel, Pins Panel
- [x] Synaptic Search con dizionario sinonimi
- [x] Encoding visivo completo

## Fase 2 — CLI MVP ✅
- [x] `subway init` per TypeScript/JavaScript
- [x] Fase TRACE: entry point, navigation, condizioni, terminal nodes
- [x] Fase WEIGHT: git log, import graph, betweenness
- [x] Fase EMBED: embedding + vettoriale locale
- [x] Fase NARRATE: LLM descriptions, worlds, condizioni

## Fase 3 — MCP Server ✅
- [x] Implementati 9 tool MCP
  - [x] `subway_search` — Synaptic Search con Spreading Activation
  - [x] `subway_station` — Dettaglio completo di una stazione
  - [x] `subway_path` — Percorso tra due stazioni con condizioni
  - [x] `subway_impact` — Analisi impatto (diretto + 2-hop)
  - [x] `subway_conditions` — Condizioni per raggiungere una stazione
  - [x] `subway_onboard` — Percorso guidato per ruolo
  - [x] `subway_line` — Flusso end-to-end
  - [x] `subway_busrisk` — Stazioni con bus factor critico
  - [x] `subway_ask` — Risposte in linguaggio naturale
- [x] Trasporto stdio per compatibilità Claude Desktop / Cursor / Copilot
- [x] 40 test passanti
- [x] Binario `subway-mcp` in package.json

## Fase 4 — Skill (1 settimana)
- [ ] Scrivere la Skill completa con prompt strutturato
- [ ] Test su 3 progetti diversi
- [ ] Documentazione e guide di adozione

## Fase 5 — Linguaggi aggiuntivi (ongoing)
- [ ] Kotlin / Java
- [ ] Python / Django / FastAPI
- [ ] Swift / SwiftUI
- [ ] Flutter / Dart
- [ ] Go
- [ ] PHP
- [ ] Ruby on Rails

## Fase 6 — CI/CD e Living Map (1 settimana)
- [ ] GitHub Action ufficiale
- [ ] GitLab CI equivalente
- [ ] `subway diff` per PR review
- [ ] Notifica Slack/Teams
