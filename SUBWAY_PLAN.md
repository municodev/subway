# SUBWAY
## Piano di Sviluppo Definitivo
### *Every codebase is a nervous system. Every is a synapse.*

---

## 0. La Filosofia

Un progetto software non è una lista di file.
Non è un grafo di dipendenze.
Non è una documentazione.

Un progetto software è un **sistema nervoso**.
Ha un punto di partenza. Ha percorsi condizionali. Ha stazioni critiche.
Ha zone che nessuno tocca da anni e zone che cambiano ogni settimana.
Ha nodi che tengono insieme tutto — e che, se si rompono, si rompe tutto.

Subway sovrappone a questo sistema nervoso una **mappa navigabile, esplorabile e interrogabile**.

La mappa funziona su tre principi fondanti:

> **1. Ogni codebase è un gioco a livelli.**
> C'è un inizio. Ci sono percorsi condizionali. Ci sono stazioni `importance`. C'è una fine — successo o fallimento.

> **2. Ogni nodo ha un peso sinaptico.**
> I nodi più usati, più influenti, con maggiore `dependency` sono più grandi, più luminosi, più centrali. Chi non viene mai toccato sbiadisce. Chi tiene insieme tutto diventa inevitabile.

> **3. Cercare è accendere sinapsi.**
> Non si cerca in una lista. Si pronuncia una parola — e la mappa si illumina, esattamente come il cervello umano che riceve uno stimolo.

---

## 1. Il Vocabolario — Le Regole del Gioco

### WORLD (Mondo)
Un dominio logico con identità visiva propria.
Ogni World ha un colore dominante, un nome, una "atmosfera" riconoscibile.
Come i mondi di un videogioco: ognuno ha le sue regole, la sua estetica, la sua logica.

Esempi: `AUTH`, `CART`, `CHECKOUT`, `PAYMENT`, `CORE`, `INVENTORY`.

### STATION (Stazione)
Un nodo del percorso. Corrisponde a qualsiasi "stato" in cui il sistema può trovarsi:
una schermata, un componente, un fragment, una view, un servizio, un use case, un repository.

Ogni Station ha un **ruolo** nel gioco:

| Ruolo | Significato | Analogia videogioco |
|-------|-------------|---------------------|
| `start` | Punto di ingresso assoluto | Schermata titolo |
| `hub` | Snodo principale di smistamento | Selezione livello |
| `checkpoint` | Stato intermedio salvato | Checkpoint di salvataggio |
| `importance` | Componente critico, ad alto impatto | Boss di fine livello / Sfida principale |
| `terminal` | Stazione finale — non ha uscite forward | Schermata vittoria o Game Over |

Ogni Station `terminal` ha un tipo:
- `success` → operazione completata ✓
- `failure` → errore, rollback, schermata di errore ✗
- `partial` → completata con riserva, retry possibile ⚠

### SYNAPSE (Sinapsi / Transizione)
Il collegamento tra due stazioni. Non è un semplice arco — è una **transizione condizionale**.
Come nei videogiochi: non si passa al livello successivo senza soddisfare una condizione.

Ogni Synapse può portare:
- `forward` → progresso nel flusso (avanti nel gioco)
- `back` → ritorno indietro (errore, annullamento, retry)
- `both` → navigazione bidirezionale

Le condizioni che governano una Synapse:

| Tipo | Esempio |
|------|---------|
| `api_response` | `status === 200` / `error.type === "TIMEOUT"` |
| `user_role` | `user.role === "admin"` |
| `device_state` | `delivery === "EXPRESS"` |
| `config_flag` | `BuildConfig.FLAVOR === "prod"` |
| `data_value` | `cart.total > 100` |
| `always` | Transizione incondizionata |

### LINE (Linea / Run completa)
Una corsa completa dall'inizio alla fine, attraverso stazioni e condizioni specifiche.
Ogni Line racconta una storia concreta:
*"Cosa succede quando un utente completa un acquisto con spedizione espressa e tutto va bene?"*
*"Cosa succede quando il login OAuth con Google fallisce?"*

Le Lines sono il cuore dell'onboarding: permettono di vedere un flusso completo
animato stazione per stazione, come guardare qualcuno giocare a un livello.

---

## 2. Il Peso Sinaptico — L'Importanza si Vede

Ogni Station ha quattro dimensioni di peso, tutte normalizzate tra 0 e 1.

```
influence   → quante altre stazioni dipendono da questa
              più è alta, più la Station è "necessaria" per il sistema

dependency   → rapporto tra dipendenze esterne e test coverage
              alta dependency = cambia spesso + poco testata = rischio

churn       → frequenza di modifica nel tempo (da git log)
              alta churn = zona calda, in evoluzione continua

centrality  → betweenness nel grafo — quanto "passaggio" riceve
              il nodo che tutti attraversano, anche indirettamente
```

Questi quattro valori si traducono direttamente in **segnali visivi**:

| Peso | Effetto visivo |
|------|----------------|
| `centrality × influence` (combinazione lineare) | Dimensione del nodo: `r = base * (0.65 + centrality*0.55 + influence*0.45)` |
| `dependency` | Colore del bordo: verde → giallo → rosso in base al valore di dependency |
| `churn` | Intensità dell'alone luminoso |
| `importance` role | Animazione pulsante lenta, sempre visibile |

Non serve leggere numeri. Non serve una legenda.
**L'importanza si vede.**

---

## 3. La Synaptic Search — Cercare come il Cervello

Questa è la feature che differenzia Subway da qualsiasi altro strumento.

### Il principio neuroscientivo: Spreading Activation

Quando il cervello umano riceve lo stimolo "albero", non esegue una ricerca.
**Accende un nodo** — e quell'attivazione si propaga lungo le sinapsi verso i nodi connessi,
con intensità proporzionale alla forza del collegamento.
"Foglie", "radici", "bosco", "legno" si illuminano di conseguenza, ognuno con la sua intensità.

Subway replica questo meccanismo sul grafo del codice.

### I tre meccanismi sovrapposti

**1. Semantic Embedding**
Ogni Station viene trasformata in un vettore numerico che codifica il suo *significato*,
non solo il suo nome. "GoogleProviderActivity" e "OAuth login" finiscono nello
stesso spazio semantico anche se non condividono una parola.
La ricerca trova il nodo semanticamente più vicino alla query — non quello con il nome più simile.

**2. Spreading Activation**
Una volta trovato il nodo primario (attivazione 1.0), l'energia si propaga:
- Ai nodi connessi direttamente → attivazione proporzionale alla `strength` della Synapse
- Ai nodi a due salti → attivazione ridotta (decadimento esponenziale)
- Ai nodi a tre salti → attivazione quasi nulla

Il decadimento è controllato da un parametro `decay_factor` (default: 0.5 per salto).
Nel renderer React MVP, il decadimento è implementato con un fattore fisso 0.42
per ogni hop, su massimo 2 hop.

```
Query: "errore di rete"

[NetworkClient]    ●●●●●  attivazione 0.94  ← nodo primario
      │
      ├──0.8──▶ [HttpConnector]     ●●●●○  attivazione 0.75
      │
      ├──0.6──▶ [RetryStrategy]     ●●●○○  attivazione 0.56
      │
      └──0.4──▶ [CheckoutFlow]      ●●○○○  attivazione 0.38
                      └──0.3──▶ [PaymentService]  ●○○○○  attivazione 0.12
```

**3. Visual Rendering**
L'attivazione diventa luce nella mappa.
Il nodo primario è il più luminoso, con alone massimo.
I nodi adiacenti pulsano in proporzione.
Il resto della mappa non sparisce — **sbiadisce**.
Il risultato è una costellazione che si accende in tempo reale,
non una lista da scorrere.

Nel renderer React, il rendering visivo segue queste regole:
- Nodi con attivazione > 60% mostrano la percentuale numerica sopra il nodo
- Nodi con attivazione > 45% hanno un alone colorato (glow) proporzionale all'attivazione
- Opacità nodo: `0.25 + activation * 0.75` per nodi attivati, `0.05` per inattivi
- Opacità sinapsi: attivazione massima tra from/to × 0.75, minimo 0.03
- Un contatore nell'input mostra il numero totale di nodi attivati

### Implementazione MVP — Synonym Dictionary

Prima di disporre di embedding semantici reali (Fase 4 del pipeline),
il renderer React implementa la Synaptic Search con un **dizionario di sinonimi
manuale** che cattura le relazioni semantiche più comuni del dominio, come ad esempio:

```javascript
const synonyms = {
  lento:   ["speed", "velocit", "performance", "timeout"],
  errore:  ["error", "failure", "failed", "exception", "crash"],
  rete:    ["network", "http", "api"],
  database:["room", "dao", "db", "cache", "offline"],
  firma:   ["sign", "photo", "foto", "document", "upload"],
  notifica:["firebase", "fcm", "messaging", "push"],
}
```

Il matching cerca il termine su label, descrizione, world e file path di ogni Station,
poi propaga l'attivazione per 2 hop con decadimento ×0.42.
Questo approccio è immediatamente funzionante e non richiede API esterne.
In futuro, il dizionario verrà sostituito da embedding vettoriali reali
senza modificare l'interfaccia utente.

### Query in qualsiasi linguaggio

La Synaptic Search capisce tre tipi di input:

**Tecnico** — il linguaggio del codice
```
"SessionRepository"      → nodo diretto + dipendenti
"@HttpClient"            → nodo + dove viene iniettato
"app-navigation.json"    → grafo di navigazione associato
```

**Funzionale** — il linguaggio del prodotto
```
"login"                  → AuthFlow, AuthProviderComponent, LoginService
"spedizione"             → Checkout world, condizione SHIPPING
"pagamento"              → PaymentProcessor, gateway, timeout
"configurazione"         → ConfigModule, Settings, System world
```

**Sintomatico** — il linguaggio del problema
```
"si rompe spesso"        → nodi con dependency alta + churn alto
"lento"                  → timeout config, NetworkClient, bottleneck
"nessuno sa come funziona" → nodi con un solo autore (bus factor = 1)
"cosa tocca il database" → DatabaseModule + tutti i Repository connessi
"utente non riesce ad accedere" → AuthFlow, error terminal nodes
```

Questo terzo tipo è il più potente per l'onboarding.
Un nuovo arrivato non conosce i nomi tecnici.
Descrive il sintomo — e Subway lo porta al nodo giusto.

---

## 4. La Struttura Visiva — Canvas, Pannelli e Modalità

Subway adotta un approccio a **tela unica** (single canvas) con pannelli contestuali,
anziché livelli di zoom discreti. La navigazione è fluida: un unico grafo D3-force
che supporta zoom (scroll), pan (drag), filtri per World e tre pannelli laterali
selezionabili dall'header.

### Il Canvas — Grafo Navigabile

Il grafo completo vive su un unico canvas. I nodi sono disposti da D3-force
simulation con forze di link, carica, centro e collisione.

- **Pan** — drag del mouse sul canvas
- **Zoom** — scroll continuo (0.22× — 2.8×)
- **Hover** — anello di selezione attorno al nodo
- **Click nodo** — apre il pannello Station Detail
- **Click sfondo** — deseleziona

**Segnali visivi permanenti:**
- Dimensione nodo: combinazione lineare di `centrality` e `influence`
- Colore bordo: gradiente `dependency` (verde → giallo → rosso)
- Puntino di dependency: nell'angolo alto-sinistra di ogni nodo
- `importance` role: anello pulsante esterno (durata 3.5s)
- `start` role: puntino centrale pieno + cerchio tratteggiato esterno
- `checkpoint` role: simbolo a rombo (quadrato ruotato 45°)
- `terminal/success`: alone verde fisso
- `terminal/failure`: alone rosso fisso
- Sincronizzazione FT: sinapsi critiche con glow sottile

**Domanda a cui risponde:** *"Qual è la forma complessiva del sistema?"*

### World Filter Pills

Nell'header, ogni World è rappresentato da un pill button con colore dominante.

- Click: il mondo selezionato resta a opacità 1.0, gli altri sbiadiscono (0.06)
- Click di nuovo: disattiva il filtro
- Le sinapsi tra mondi diversi scompaiono durante il filtro
- Il layout D3-force non viene ricalcolato — la posizione rimane stabile

**Domanda a cui risponde:** *"Come funziona questo dominio specifico?"*

### Station Detail — Pannello Laterale

Click su una Station → pannello laterale destro (310px) con:

1. **Header** — nome World, ruolo, pin toggle e chiusura
2. **Descrizione semantica** — generata da codice e annotata
3. **Pesi sinaptici** — 4 barre orizzontali (influence, dependency, churn, centrality) con percentuale
4. **Files** — percorsi dei file associati, con bordo colorato per World
5. **Autori** — badge con nome e conteggio commit totale
6. **Uscite** — sinapsi outgoing cliccabili: label destinazione + condizione + strength + badge criticità ⚡ e direzione ↩
7. **Entrate** — sinapsi incoming cliccabili
8. **Note** — textarea per annotazione libera, con salvataggio e cancellazione
   (le note persistono in memoria durante la sessione)

Click su una sinapsi uscente o entrante → naviga direttamente alla Station collegata,
aggiornando il pannello. Il nodo selezionato e i suoi vicini mantengono opacità piena;
il resto della mappa sbiadisce.

**Domanda a cui risponde:** *"Cos'è questo componente, cosa lo circonda e come interagisce?"*

### Lines Panel — Percorsi Completiti

Pannello laterale che elenca tutte le Line disponibili con:
- Nome + outcome colorato (success ✓ / failure ✗ / partial ⚠)
- Numero stazioni nel percorso
- Click: espande il percorso mostrando la sequenza di stazioni con pallini colorati
  e linee di connessione verticali
- Click su una stazione nella Line expande → apre Station Detail
- Se una Line è selezionata, il canvas evidenzia solo le stazioni e le sinapsi
  appartenenti a quel percorso; il resto sbiadisce (opacità 0.07)

**Line Playback (stretch goal)** — animazione step-by-step del percorso, con
highlight progressivo delle condizioni che si verificano a ogni transizione.

**Domanda a cui risponde:** *"Quali sono i flussi end-to-end del sistema?"*

### Pins Panel — Stazioni Salvate

Pannello laterale per le stazioni pinnate dall'utente:
- Pinnare una Station dal Detail panel (toggle 📌)
- Lista delle stazioni salvate con nome e World
- Click su una stazione pinnata → apre Station Detail
- Le stazioni pinnate mostrano un indicatore 📌 sul nodo nel grafo
- Le stazioni con nota hanno un indicatore 📝 nella lista

**Domanda a cui risponde:** *"Quali stazioni sto monitorando?"*

### Status Bar

Barra inferiore (28px) con:
- Suggerimenti interattivi: "Drag · Scroll zoom · Click node"
- Conteggio risultati durante la Synaptic Search
- Nome della Line selezionata
- Legenda dependency: ● bassa · ● media · ● alta · ● critica

### Modalità Speciali (future)

**Onboarding Mode** — percorso guidato per ruolo, con stazioni ordinate e spiegazioni.

**Impact Mode** — selezionando una Station, si illuminano le stazioni impattate
(rosso = diretto, arancione = indiretto, grigio = non impattato).

**Bus Factor Mode** — ogni nodo si colora in base al numero di autori unici.
Rosso = un solo autore.

**History Mode** — slider temporale per vedere l'evoluzione del grafo nel tempo.

---

## 5. Il Formato Universale — `subway.json`

Il cuore dell'intero sistema. Un file JSON aperto, versionato, leggibile
da qualsiasi renderer, tool o LLM. Generarlo è il lavoro di Subway.
Usarlo è immediato e universale.

```json
{
  "meta": {
    "project": "E-Commerce System",
    "version": "3.0",
    "generated": "2026-05-22T10:00:00Z",
    "entryPoint": "station_landing_page",
    "totalStations": 42,
    "totalSynapses": 118,
    "totalLines": 14,
    "totalWorlds": 6,
    "languages": ["typescript", "javascript"],
    "embeddings_model": "text-embedding-3-small"
  },
  "worlds": [
    {
      "id": "auth",
      "name": "Authentication",
      "color": "#f5a623",
      "description": "Gestisce identità e accesso. Entry point per tutti gli utenti dell'applicazione.",
      "stations": ["station_oauth", "station_login"]
    }
  ],
  "stations": [
    {
      "id": "station_login",
      "label": "PaymentService",
      "world": "auth",
      "role": "hub",
      "terminalType": null,
      "files": ["PaymentService.ts", "PaymentViewModel.ts"],
      "description": "Gestisce l'autenticazione degli utenti. Smista il flusso verso Dashboard, Billing o Admin in base al ruolo dell'utente.",
      "weight": {
        "influence": 0.91,
        "dependency": 0.43,
        "churn": 0.67,
        "centrality": 0.88
      },
      "authors": ["john.doe", "jane.smith"],
      "lastModified": "2026-04-10T14:22:00Z",
      "commitCount": 47,
      "embedding": [0.021, -0.143, 0.887, "..."]
    }
  ],
  "synapses": [
    {
      "from": "station_login",
      "to": "station_checkout_flow",
      "condition": {
        "description": "L'utente seleziona il checkout",
        "type": "data_value",
        "value": "user.action === 'CHECKOUT'"
      },
      "direction": "forward",
      "isCritical": true,
      "strength": 0.74
    }
  ],
  "lines": [
    {
      "id": "line_checkout_happy",
      "name": "Acquisto Prodotto — Happy Path",
      "world": "checkout",
      "color": "#4cc9f0",
      "path": [
        "station_landing_page",
        "station_oauth",
        "station_login",
        "station_checkout_flow",
        "station_payment_form",
        "station_invoice_generation",
        "station_checkout_success"
      ],
      "conditions": [
        "cart.total > 0",
        "user.isLoggedIn === true",
        "payment.status === 'SUCCESS'"
      ],
      "outcome": "success"
    }
  ]
}
```

---

## 6. Il Pipeline di Analisi

Cinque fasi indipendenti e componibili. Ogni fase può girare da sola.
L'intero pipeline è agnostico rispetto al linguaggio di programmazione.

```
REPO GIT
   │
   ▼
┌──────────────────────────────────────────────────────┐
│  FASE 1 · TRACE                                      │
│  Trova i percorsi navigabili                         │
│                                                      │
│  · Identifica entry point (main, app, index,         │
│    AppDelegate, MainActivity…)                       │
│  · Traccia percorsi di navigazione (intent,          │
│    NavController, router, segue, pushNamed…)         │
│  · Estrae condizioni (if/when/switch/guard)          │
│    che governano le transizioni                      │
│  · Identifica terminal nodes (success/error screen,  │
│    completion handler, toast finale)                 │
└────────────────────────┬─────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────┐
│  FASE 2 · WEIGHT                                     │
│  Calcola il peso sinaptico di ogni nodo              │
│                                                      │
│  · Git log → churn (commit frequency per file)       │
│  · Import/dependency graph → influence               │
│  · Test coverage report → dependency inversa         │
│  · Algoritmo betweenness → centrality                │
│  · Autori unici per file → bus factor                │
└────────────────────────┬─────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────┐
│  FASE 3 · CLUSTER                                    │
│  Raggruppa in Worlds, assegna ruoli                  │
│                                                      │
│  · Community detection (algoritmo Louvain)           │
│    sul grafo delle dipendenze                        │
│  · LLM assegna nome e descrizione ai World           │
│  · LLM identifica ruoli: importance, checkpoint,     │
│    terminal (success/failure)                        │
│  · LLM annota le condizioni sulle Synapses           │
└────────────────────────┬─────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────┐
│  FASE 4 · EMBED                                      │
│  Genera gli embedding semantici                      │
│                                                      │
│  · Ogni Station → vettore numerico (embedding)       │
│    usando nome + description + files + domain        │
│  · Vettori salvati in subway.json                    │
│  · Indice vettoriale locale per ricerca rapida       │
│  · Base della Synaptic Search                        │
└────────────────────────┬─────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────┐
│  FASE 5 · EMIT                                       │
│  Genera i deliverable                                │
│                                                      │
│  · subway.json (sorgente universale)                 │
│  · Static site viewer (React)                        │
│  · MCP server (tool per AI agent)                    │
│  · Markdown summary (per PR / wiki)                  │
└──────────────────────────────────────────────────────┘
```

---

## 7. La Synaptic Search — Algoritmo

L'algoritmo ha due versioni: una **MVP** basata su dizionario di sinonimi
(implementata nel renderer React) e una **futura** basata su embedding semantici.

### Versione MVP (Synonym-based)

```
INPUT: query testuale

STEP 1 — Synonym expansion
  q = query.lowercase()
  terms = [q] + synonyms[q]  // estensione con sinonimi del dominio
  // Se un sinonimo contiene la query o viceversa, espande ulteriormente

STEP 2 — Score each station
  for each station:
    corpus = label + description + world + files (lowercase)
    for each term in terms:
      if term in label:         score = max(score, 0.96)
      else if term in world:    score = max(score, 0.72)
      else if term in corpus:   score = max(score, 0.78)
  // score > 0 → nodo attivato

STEP 3 — Spread activation (2 hop)
  for hop = 0..1:
    snap = copy(activations)
    for each synapse:
      if snap[from] > threshold (0.08):
        spread = snap[from] × synapse.strength × 0.42
        activations[to] = max(activations[to], spread)

STEP 4 — Render
  for each station:
    a = activations[id] || 0
    if a > 0:
      opacity = 0.25 + a × 0.75
      if a > 0.45: glow = a × max_glow (alone colorato)
      if a > 0.60: show percentage label (es. "94%")
    else:
      opacity = 0.05  // sbiadito, mai invisibile
```

### Versione Futura (Embedding-based)

Quando il pipeline Fase 4 sarà operativo:

```
INPUT: query testuale

STEP 1 — Embed query
  query_vector = embed(query)

STEP 2 — Find primary node
  primary = argmax(cosine_similarity(query_vector, station.embedding))
  primary.activation = similarity_score  // tipicamente 0.85–0.99

STEP 3 — Spread activation
  queue = [primary]; visited = {}
  while queue not empty:
    node = queue.pop()
    for each synapse from node:
      neighbor = synapse.target
      activation = node.activation × synapse.strength × decay_factor
      if activation > threshold (default: 0.1):
        neighbor.activation = max(neighbor.activation, activation)
        queue.push(neighbor)

STEP 4 — Render
  for each station:
    if activation > 0:
      size    = base_size × (1 + activation)
      opacity = 0.2 + (activation × 0.8)
      glow    = activation × max_glow
    else:
      opacity = 0.05  // sbiadito, non scompare
```

---

## 8. Le Modalità di Consegna

### CLI

```bash
npx subway init                    # analisi completa, genera subway.json
npx subway serve                   # viewer locale → localhost:4242
npx subway play "auth"             # anima il percorso del World "auth"
npx subway impact "PaymentService" # cosa si rompe se cambio questo?
npx subway search "errore connessione" # synaptic search da terminale
npx subway onboard --role=frontend # percorso per nuovo dev Frontend
npx subway diff HEAD~1             # cosa è cambiato nel grafo?
```

### MCP Server

Interrogabile da Claude, Cursor, Copilot o qualsiasi tool MCP-compatibile.

```
subway_ask(question)           → risposta contestuale in linguaggio naturale
subway_station(id)             → dettaglio completo di una Station
subway_search(query)           → synaptic search, ritorna nodi attivati
subway_path(from, to)          → percorso tra due stazioni con condizioni
subway_impact(id)              → cosa viene impattato da una modifica
subway_conditions(id)          → condizioni per raggiungere una stazione
subway_onboard(role)           → percorso guidato per ruolo
subway_line(name)              → racconta un flusso end-to-end
subway_busrisk()               → stazioni con bus factor critico
```

### Static Viewer

Applicazione React generata staticamente.
Zero server. Zero database. Solo `subway.json` + HTML.
Deploy ovunque: GitHub Pages, Netlify, S3, intranet aziendale.
Il team apre un link. La mappa è lì.

### Skill per AI Agent

Una Skill strutturata che insegna a qualsiasi LLM a:
1. Analizzare un repository e generare un `subway.json` valido
2. Rispondere a domande sul progetto usando il grafo
3. Simulare la Synaptic Search in assenza del viewer visivo
4. Costruire percorsi di onboarding personalizzati per ruolo

### GitHub / GitLab Action

```yaml
# .github/workflows/subway.yml
on:
  push:
    branches: [main]

jobs:
  subway:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npx subway init --ci
      - run: npx subway deploy --target=github-pages
```

Ad ogni merge su main, la mappa si aggiorna.
La conoscenza del progetto è sempre attuale.
Sempre disponibile. Sempre viva.

---

## 9. Stack Tecnico

| Componente | Tecnologia | Motivazione |
|------------|------------|-------------|
| CLI | Node.js + TypeScript | Universale, distribuzione npm immediata |
| AST parsing | tree-sitter | 40+ linguaggi con la stessa API |
| Graph engine | graphology | Leggero, browser + Node, algoritmi built-in |
| Community detection | Louvain (graphology-communities) | Standard de facto per graph clustering |
| Embedding | Vercel AI SDK (agnostico) | OpenAI / Anthropic / Ollama / locale |
| Vector search | hnswlib-node | Ricerca approssimata velocissima, locale |
| LLM narration | Vercel AI SDK | Agnostico: swappabile senza cambiare codice |
| Renderer | React + D3-force | Controllo totale sul layout fisico del grafo |
| Static site | Vite | Build rapido, zero configurazione |
| MCP server | @modelcontextprotocol/sdk | Standard ufficiale MCP |

---

## 10. Roadmap

### Fase 0 — Schema & Golden Sample ✅
- [x] Costruito il golden sample per il progetto App Delivery (WIND3)
  con 7 Worlds, 23 Stations, 38 Synapses, 9 Lines
- [x] Validato che il modello condizionale + ruoli copra tutti i casi reali
- [x] Scritta la spec della Synaptic Search con tre registri linguistici
- [ ] Pubblicare JSON Schema `subway.json` v3.0 formale

### Fase 1 — Viewer React (MVP ✅)
- [x] Canvas unico D3-force con pan e zoom continuo
- [x] World Filter Pills (sostituiscono System View e World View)
- [x] Station Detail con pesi, files, autori, sinapsi, note
- [x] Lines Panel con espansione percorso e highlight sul grafo
- [x] Pins Panel per salvare e annotare stazioni
- [x] Synaptic Search con dizionario sinonimi MVP
- [x] Encoding visivo completo: dimensione, colore bordo (dependency),
      alone (churn), pulsazione (importance), aloni terminali, simboli ruolo
- [x] Status bar con suggerimenti interattivi e legenda dependency

### Fase 2 — CLI MVP (3 settimane)
- [x] `subway init` per TypeScript/JavaScript
- [x] Fase TRACE: entry point, navigation, condizioni, terminal nodes
- [x] Fase WEIGHT: git log, import graph, betweenness
- [ ] Fase EMBED: generazione embedding + indice vettoriale locale
- [ ] Fase NARRATE: LLM per descriptions, Worlds, condizioni
- [ ] Output: `subway.json` v3.0 valido

### Fase 3 — MCP Server (2 settimane)
- [ ] Implementare i 9 tool MCP
- [ ] `subway_search` con Spreading Activation
- [ ] Pubblicare come pacchetto npm
- [ ] Test con Claude Desktop e Cursor

### Fase 4 — Skill (1 settimana)
- [ ] Scrivere la Skill completa con prompt strutturato
- [ ] Test su 3 progetti diversi (mobile, backend, frontend)
- [ ] Documentazione e guide di adozione

### Fase 5 — Linguaggi aggiuntivi (ongoing)
- [ ] Kotlin / Java
- [ ] Python / Django / FastAPI
- [ ] Swift / SwiftUI
- [ ] Flutter / Dart
- [ ] Go
- [ ] PHP (monoliti enterprise legacy)
- [ ] Ruby on Rails

### Fase 6 — CI/CD e Living Map (1 settimana)
- [ ] GitHub Action ufficiale
- [ ] GitLab CI equivalente
- [ ] `subway diff` per PR review automatico
- [ ] Notifica su Slack/Teams quando un nodo `importance` viene modificato

---

## 11. Il Test Finale

Subway funziona se, dopo 5 minuti con la mappa aperta:

1. Un nuovo dev sa **da dove parte** il flusso che deve toccare
2. Sa **sotto quali condizioni** arriva alla schermata che deve modificare
3. Sa **cosa succede** se queste condizioni non si verificano
4. Sa **chi altro** viene impattato dalla sua modifica
5. Può fare la prima PR **senza chiedere nulla a nessuno**

E funziona ancora meglio se, digitando una parola nel campo di ricerca,
**la mappa si accende** — e lui sa già dove guardare.

---

*Subway — Every codebase is a game. Every search is a synapse.*
