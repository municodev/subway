import { useState, useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";

// ─── SUBWAY DATA ──────────────────────────────────────────────────────────────

const WORLDS = [
  { id: "world_core",         name: "Core",         color: "#e94560" },
  { id: "world_auth",         name: "Auth",         color: "#f5a623" },
  { id: "world_installation", name: "Installation", color: "#4cc9f0" },
  { id: "world_assurance",    name: "Assurance",    color: "#7bed9f" },
  { id: "world_sme",          name: "SME",          color: "#a29bfe" },
  { id: "world_wholesale",    name: "Wholesale",    color: "#fd79a8" },
  { id: "world_infra",        name: "Infra",        color: "#b2bec3" },
];

const STATIONS = [
  { id:"station_main_activity",      label:"MainActivity",           world:"world_core",         role:"start",      terminalType:null,      files:["ui/MainActivity.kt","viewmodel/AppUpdateViewModel.kt"],                                                                                       description:"Schermata titolo. Gestisce il controllo aggiornamenti obbligatori via Firebase Remote Config e smista verso MicrosoftActivity. Punto di partenza assoluto dell'intera applicazione.",                                                    weight:{influence:0.95,fragility:0.28,churn:0.31,centrality:0.99}, authors:["marco.rossi","giulia.bianchi"],  commitCount:34 },
  { id:"station_update_check",       label:"AppUpdateViewModel",     world:"world_core",         role:"checkpoint", terminalType:null,      files:["viewmodel/AppUpdateViewModel.kt","domain/ICheckAppUpdateUC.kt"],                                                                              description:"Checkpoint obbligatorio all'avvio. Interroga Firebase Remote Config per versione minima supportata. Se aggiornamento obbligatorio blocca l'accesso.",                                                                                   weight:{influence:0.45,fragility:0.35,churn:0.22,centrality:0.61}, authors:["marco.rossi"],                   commitCount:12 },
  { id:"station_microsoft_auth",     label:"MicrosoftActivity",      world:"world_auth",         role:"hub",        terminalType:null,      files:["ui/MicrosoftActivity.kt","viewmodel/MicrosoftAuthViewModel.kt","res/raw/msal_config.json"],                                                   description:"Autenticazione aziendale tramite Microsoft Azure AD usando MSAL. Mostra webview di login Microsoft, ottiene il token OAuth2. Il client_id è configurato per flavor tramite BuildConfig.",                                               weight:{influence:0.88,fragility:0.52,churn:0.44,centrality:0.82}, authors:["giulia.bianchi","luca.ferrari"], commitCount:28 },
  { id:"station_login",              label:"LoginActivity",          world:"world_auth",         role:"hub",        terminalType:null,      files:["ui/LoginActivity.kt","viewmodel/LoginViewModel.kt","domain/IGetSelectedSystemUC.kt","domain/IValidateOrderUC.kt"],                            description:"Snodo centrale di smistamento operativo. Valida l'ordine, identifica il tipo di operazione e il partner tecnologico. Determina quale Activity-flusso lanciare con quale NavGraph. È il cervello che decide dove andare.",               weight:{influence:0.97,fragility:0.61,churn:0.78,centrality:0.94}, authors:["marco.rossi","giulia.bianchi","anna.conti"], commitCount:67 },
  { id:"station_error_auth",         label:"AuthErrorScreen",        world:"world_auth",         role:"terminal",   terminalType:"failure", files:["ui/fragment/auth/AuthErrorFragment.kt"],                                                                                                      description:"Capolinea di fallimento autenticazione. Token MSAL non valido o scaduto, oppure ordine non assegnato al tecnico. Offre retry o logout completo.",                                                                                     weight:{influence:0.12,fragility:0.18,churn:0.15,centrality:0.22}, authors:["giulia.bianchi"],                commitCount:8  },
  { id:"station_installation_hub",   label:"InstallationActivity",   world:"world_installation", role:"hub",        terminalType:null,      files:["ui/InstallationActivity.kt","res/navigation/nav_installation.xml","res/navigation/nav_installation_ftth.xml"],                                description:"Contenitore del flusso di installazione. Riceve il NavGraph ID via Intent e inizializza dinamicamente il NavHostFragment corretto. Supporta sia tecnologia standard che FTTH.",                                                        weight:{influence:0.72,fragility:0.48,churn:0.55,centrality:0.78}, authors:["marco.rossi","anna.conti","paolo.verdi"], commitCount:51 },
  { id:"station_ftth_config",        label:"FTTHConfigFragment",     world:"world_installation", role:"checkpoint", terminalType:null,      files:["ui/fragment/installation/FTTHConfigFragment.kt","viewmodel/FTTHConfigViewModel.kt","domain/IConfigureFTTHUC.kt","repository/FTTHRepository.kt"], description:"Checkpoint FTTH. Gestisce configurazione parametri ONT (Optical Network Terminal), verifica sincronizzazione fibra e acquisisce dati attestato. Timeout configurabile.",                                                           weight:{influence:0.58,fragility:0.71,churn:0.62,centrality:0.55}, authors:["paolo.verdi"],                   commitCount:39 },
  { id:"station_modem_config",       label:"ModemConfigFragment",    world:"world_installation", role:"checkpoint", terminalType:null,      files:["ui/fragment/installation/ModemConfigFragment.kt","viewmodel/ModemConfigViewModel.kt","domain/IConfigureModemUC.kt","repository/ModemRepository.kt"], description:"Configurazione modem del cliente. Scansione seriale via Barcode, recupero profilo di configurazione dal gateway WindTre, verifica connettività post-configurazione. Dati cachati su Room per offline.", weight:{influence:0.64,fragility:0.55,churn:0.48,centrality:0.61}, authors:["anna.conti","marco.rossi"],      commitCount:43 },
  { id:"station_sim_config",         label:"SIMConfigFragment",      world:"world_installation", role:"checkpoint", terminalType:null,      files:["ui/fragment/installation/SIMConfigFragment.kt","viewmodel/SIMConfigViewModel.kt","domain/IActivateSIMUC.kt"],                                  description:"Attivazione e verifica SIM mobile abbinata alla linea fissa. Scansione barcode SIM, invio al gateway, polling dello stato fino a conferma. Solo per ordini Consumer e SME con SIM abbinata.",                                       weight:{influence:0.41,fragility:0.49,churn:0.37,centrality:0.44}, authors:["anna.conti"],                    commitCount:22 },
  { id:"station_barcode_scan",       label:"BarcodeScanFragment",    world:"world_installation", role:"checkpoint", terminalType:null,      files:["ui/fragment/shared/BarcodeScanFragment.kt","viewmodel/BarcodeScanViewModel.kt","util/MLKitHelper.kt"],                                         description:"Componente condiviso di scansione via Google MLKit. Usato da Modem, SIM e Wholesale. Gestisce permessi camera runtime, lifecycle scanner, parsing formati EAN13/QR/Code128.",                                                       weight:{influence:0.71,fragility:0.32,churn:0.29,centrality:0.68}, authors:["giulia.bianchi"],                commitCount:19 },
  { id:"station_photo_sign",         label:"PhotoSignFragment",      world:"world_installation", role:"checkpoint", terminalType:null,      files:["ui/fragment/shared/PhotoSignFragment.kt","viewmodel/PhotoSignViewModel.kt","domain/IUploadDocumentUC.kt"],                                      description:"Acquisizione digitale di foto dell'impianto e firma del cliente. Le foto vengono compresse con Glide e caricate sul document gateway. Prerequisiti obbligatori per chiusura ordine.",                                               weight:{influence:0.55,fragility:0.44,churn:0.41,centrality:0.58}, authors:["luca.ferrari","anna.conti"],     commitCount:31 },
  { id:"station_order_close_success",label:"OrderCloseSuccess",      world:"world_installation", role:"terminal",   terminalType:"success", files:["ui/fragment/installation/OrderCloseFragment.kt","domain/ICloseOrderUC.kt"],                                                                    description:"Capolinea successo installazione. Invia chiusura ordine con tutti i dati (barcode modem, SIM, foto, firma). Mostra conferma con numero di protocollo.",                                                                           weight:{influence:0.08,fragility:0.38,churn:0.33,centrality:0.31}, authors:["marco.rossi","giulia.bianchi"],  commitCount:25 },
  { id:"station_error_installation", label:"InstallationError",      world:"world_installation", role:"terminal",   terminalType:"failure", files:["ui/fragment/installation/InstallationErrorFragment.kt"],                                                                                       description:"Capolinea fallimento installazione. Timeout FTTH, modem irraggiungibile, errore upload documenti. Mostra codice errore e offre retry step, escalation supporto, o chiusura KO.",                                                 weight:{influence:0.11,fragility:0.21,churn:0.19,centrality:0.28}, authors:["anna.conti"],                    commitCount:14 },
  { id:"station_assurance_hub",      label:"AssuranceActivity",      world:"world_assurance",    role:"hub",        terminalType:null,      files:["ui/AssuranceActivity.kt","res/navigation/nav_assurance.xml"],                                                                                  description:"Contenitore del flusso di diagnostica e risoluzione guasti. Navigazione dinamica come InstallationActivity. Usa Kotlin Flow per aggiornamenti in tempo reale durante i test.",                                                    weight:{influence:0.68,fragility:0.42,churn:0.51,centrality:0.71}, authors:["luca.ferrari","marco.rossi"],    commitCount:44 },
  { id:"station_speed_test",         label:"SpeedTestFragment",      world:"world_assurance",    role:"boss",       terminalType:null,      files:["ui/fragment/assurance/SpeedTestFragment.kt","viewmodel/SpeedTestViewModel.kt","domain/IRunSpeedTestUC.kt","di/Qualifiers.kt","di/NetworkModule.kt"], description:"Boss del World Assurance. Misura download, upload e latenza con @SpeedTestOkHttpClient dedicato (timeout estesi, interceptor specifici). Risultati in streaming via Kotlin Flow. Il confronto con le soglie SLA determina chiusura o escalation.", weight:{influence:0.76,fragility:0.88,churn:0.72,centrality:0.74}, authors:["luca.ferrari"], commitCount:58 },
  { id:"station_network_diag",       label:"NetworkDiagFragment",    world:"world_assurance",    role:"checkpoint", terminalType:null,      files:["ui/fragment/assurance/NetworkDiagFragment.kt","viewmodel/NetworkDiagViewModel.kt","domain/IRunNetworkDiagUC.kt"],                               description:"Diagnostica approfondita: ping, traceroute, DNS, stato linea lato centrale. Risultati aggregati in report che categorizza automaticamente il guasto. Usa Kotlin Flow per step progressivi.",                                       weight:{influence:0.62,fragility:0.58,churn:0.61,centrality:0.65}, authors:["luca.ferrari","giulia.bianchi"], commitCount:47 },
  { id:"station_ticket_close_success",label:"TicketCloseSuccess",    world:"world_assurance",    role:"terminal",   terminalType:"success", files:["ui/fragment/assurance/TicketCloseFragment.kt","domain/ICloseTicketUC.kt"],                                                                     description:"Capolinea successo assurance. Guasto risolto, test nei parametri SLA, ticket chiuso con esito positivo. Invia report diagnostica con timestamp e risultati.",                                                                      weight:{influence:0.07,fragility:0.25,churn:0.21,centrality:0.24}, authors:["luca.ferrari"],                  commitCount:11 },
  { id:"station_error_assurance",    label:"AssuranceError",         world:"world_assurance",    role:"terminal",   terminalType:"failure", files:["ui/fragment/assurance/AssuranceErrorFragment.kt"],                                                                                             description:"Capolinea fallimento assurance. Guasto infrastrutturale non risolvibile sul campo. Il ticket rimane aperto e viene escalato automaticamente al secondo livello WindTre.",                                                          weight:{influence:0.09,fragility:0.19,churn:0.16,centrality:0.20}, authors:["luca.ferrari"],                  commitCount:7  },
  { id:"station_sme_hub",            label:"SmeActivity",            world:"world_sme",          role:"hub",        terminalType:null,      files:["ui/SmeActivity.kt","res/navigation/nav_sme_installation.xml","res/navigation/nav_sme_assurance.xml"],                                           description:"Activity duale per clienti business SME. Riceve NAV_GRAPH via Intent e inflata dinamicamente il grafo corretto: installazione SME o assistenza SME. Stesso contenitore, due flussi diversi.",                                    weight:{influence:0.59,fragility:0.47,churn:0.53,centrality:0.62}, authors:["anna.conti","paolo.verdi"],     commitCount:36 },
  { id:"station_wholesale_hub",      label:"WholesaleActivity",      world:"world_wholesale",    role:"hub",        terminalType:null,      files:["ui/WholesaleActivity.kt","res/navigation/nav_wholesale.xml"],                                                                                   description:"Flusso partner wholesale. Accessibile solo con BuildConfig.FLAVOR in ['prod','bs'] e ruolo WHOLESALE nel token Azure. Gestisce attivazioni per operatori partner con flusso semplificato.",                                       weight:{influence:0.44,fragility:0.39,churn:0.34,centrality:0.48}, authors:["paolo.verdi"],                   commitCount:21 },
  { id:"station_room_db",            label:"Room Database",          world:"world_infra",        role:"boss",       terminalType:null,      files:["database/AppDatabase.kt","database/dao/OrderDao.kt","database/dao/ModemDao.kt","database/dao/SIMDao.kt","di/DatabaseModule.kt"],                description:"Boss infrastrutturale. Gestisce caching offline di ordini, modem, test di rete, documenti in attesa di upload. ATTENZIONE: modificare lo schema senza migration rompe l'app in produzione.",                                       weight:{influence:0.83,fragility:0.79,churn:0.35,centrality:0.81}, authors:["marco.rossi","giulia.bianchi"],  commitCount:29 },
  { id:"station_retrofit_api",       label:"Retrofit / OkHttp",      world:"world_infra",        role:"boss",       terminalType:null,      files:["di/NetworkModule.kt","di/Qualifiers.kt","client/api/OrderApiService.kt","client/api/SpeedTestApiService.kt","client/interceptor/AuthInterceptor.kt"], description:"Boss networking. Due istanze OkHttp: @DefaultOkHttpClient (timeout 30s, auth interceptor) e @SpeedTestOkHttpClient (timeout 120s). Cambiare URL base qui impatta TUTTI i servizi.",  weight:{influence:0.91,fragility:0.67,churn:0.42,centrality:0.88}, authors:["marco.rossi","giulia.bianchi","luca.ferrari"], commitCount:38 },
  { id:"station_firebase",           label:"Firebase",               world:"world_infra",        role:"checkpoint", terminalType:null,      files:["google-services.json","viewmodel/AppUpdateViewModel.kt","util/FirebaseMessagingService.kt"],                                                     description:"Tre servizi attivi: Remote Config (versione minima, feature flags), Cloud Messaging (notifiche push nuovi ordini), Crashlytics e Analytics (monitoraggio produzione).",                                                           weight:{influence:0.55,fragility:0.41,churn:0.28,centrality:0.52}, authors:["giulia.bianchi"],                commitCount:17 },
  { id:"station_hilt_di",            label:"Hilt / DI",              world:"world_infra",        role:"boss",       terminalType:null,      files:["di/AppModule.kt","di/NetworkModule.kt","di/RepositoryModule.kt","di/DatabaseModule.kt","di/Qualifiers.kt","AppDeliveryApplication.kt"],         description:"Boss silenzioso. Governa creazione e lifecycle di tutti i componenti. Aggiungere un Repository senza registrarlo qui causa crash a runtime, non a compile time. Bus factor: 1.",                                                   weight:{influence:0.97,fragility:0.73,churn:0.38,centrality:0.92}, authors:["marco.rossi"],                   commitCount:45 },
];

const SYNAPSES = [
  { id:"syn_001", from:"station_main_activity",       to:"station_update_check",          condition:{description:"Avvio obbligatorio",                                        type:"always"},          direction:"forward", isCritical:true,  strength:1.00 },
  { id:"syn_002", from:"station_update_check",        to:"station_microsoft_auth",        condition:{description:"Versione supportata da Remote Config",                      type:"config_flag"},     direction:"forward", isCritical:true,  strength:0.92 },
  { id:"syn_003", from:"station_update_check",        to:"station_main_activity",         condition:{description:"Aggiornamento obbligatorio disponibile",                    type:"config_flag"},     direction:"back",    isCritical:false, strength:0.08 },
  { id:"syn_004", from:"station_microsoft_auth",      to:"station_login",                 condition:{description:"Token Azure AD ottenuto con successo",                      type:"api_response"},    direction:"forward", isCritical:true,  strength:0.89 },
  { id:"syn_005", from:"station_microsoft_auth",      to:"station_error_auth",            condition:{description:"Autenticazione Azure AD fallita",                           type:"api_response"},    direction:"forward", isCritical:false, strength:0.11 },
  { id:"syn_006", from:"station_login",               to:"station_installation_hub",      condition:{description:"order.type == 'INSTALLATION' && segment == 'CONSUMER'",     type:"data_value"},      direction:"forward", isCritical:true,  strength:0.38 },
  { id:"syn_007", from:"station_login",               to:"station_assurance_hub",         condition:{description:"order.type == 'ASSURANCE'",                                type:"data_value"},      direction:"forward", isCritical:true,  strength:0.31 },
  { id:"syn_008", from:"station_login",               to:"station_sme_hub",               condition:{description:"order.segment == 'SME'",                                   type:"data_value"},      direction:"forward", isCritical:false, strength:0.19 },
  { id:"syn_009", from:"station_login",               to:"station_wholesale_hub",         condition:{description:"token.roles.contains('WHOLESALE') && flavor in [prod,bs]",  type:"user_role"},       direction:"forward", isCritical:false, strength:0.07 },
  { id:"syn_010", from:"station_login",               to:"station_error_auth",            condition:{description:"Ordine non trovato o non assegnato",                        type:"api_response"},    direction:"forward", isCritical:false, strength:0.05 },
  { id:"syn_011", from:"station_installation_hub",    to:"station_ftth_config",           condition:{description:"order.technology == 'FTTH'",                               type:"data_value"},      direction:"forward", isCritical:false, strength:0.44 },
  { id:"syn_012", from:"station_installation_hub",    to:"station_modem_config",          condition:{description:"technology != 'FTTH' (FTTC, ADSL)",                        type:"data_value"},      direction:"forward", isCritical:false, strength:0.56 },
  { id:"syn_013", from:"station_ftth_config",         to:"station_modem_config",          condition:{description:"ont.syncStatus == 'OK'",                                   type:"device_state"},    direction:"forward", isCritical:true,  strength:0.78 },
  { id:"syn_014", from:"station_ftth_config",         to:"station_error_installation",    condition:{description:"Timeout sincronizzazione fibra",                            type:"device_state"},    direction:"forward", isCritical:false, strength:0.22 },
  { id:"syn_015", from:"station_modem_config",        to:"station_barcode_scan",          condition:{description:"modem.serialNumber == null",                               type:"device_state"},    direction:"forward", isCritical:false, strength:0.71 },
  { id:"syn_016", from:"station_barcode_scan",        to:"station_modem_config",          condition:{description:"Barcode acquisito",                                         type:"always"},          direction:"back",    isCritical:false, strength:0.95 },
  { id:"syn_017", from:"station_modem_config",        to:"station_sim_config",            condition:{description:"order.includesSIM == true",                                type:"data_value"},      direction:"forward", isCritical:false, strength:0.35 },
  { id:"syn_018", from:"station_modem_config",        to:"station_photo_sign",            condition:{description:"Modem configurato, no SIM abbinata",                        type:"data_value"},      direction:"forward", isCritical:true,  strength:0.65 },
  { id:"syn_019", from:"station_sim_config",          to:"station_photo_sign",            condition:{description:"simActivationResponse.status == 'ACTIVE'",                 type:"api_response"},    direction:"forward", isCritical:false, strength:0.88 },
  { id:"syn_020", from:"station_photo_sign",          to:"station_order_close_success",   condition:{description:"Foto caricata e firma acquisita",                           type:"data_value"},      direction:"forward", isCritical:true,  strength:0.82 },
  { id:"syn_021", from:"station_photo_sign",          to:"station_error_installation",    condition:{description:"Upload fallito dopo retry",                                 type:"api_response"},    direction:"forward", isCritical:false, strength:0.18 },
  { id:"syn_022", from:"station_assurance_hub",       to:"station_speed_test",            condition:{description:"ticket.type in ['PERFORMANCE','SLOW_CONNECTION']",          type:"data_value"},      direction:"forward", isCritical:false, strength:0.55 },
  { id:"syn_023", from:"station_assurance_hub",       to:"station_network_diag",          condition:{description:"ticket.type in ['NO_CONNECTION','INTERMITTENT']",           type:"data_value"},      direction:"forward", isCritical:false, strength:0.45 },
  { id:"syn_024", from:"station_speed_test",          to:"station_ticket_close_success",  condition:{description:"Valori download/upload nei parametri SLA",                  type:"data_value"},      direction:"forward", isCritical:false, strength:0.62 },
  { id:"syn_025", from:"station_speed_test",          to:"station_network_diag",          condition:{description:"Velocità sotto soglia SLA",                                 type:"data_value"},      direction:"forward", isCritical:false, strength:0.38 },
  { id:"syn_026", from:"station_network_diag",        to:"station_ticket_close_success",  condition:{description:"diagReport.faultResolved == true",                          type:"data_value"},      direction:"forward", isCritical:false, strength:0.58 },
  { id:"syn_027", from:"station_network_diag",        to:"station_error_assurance",       condition:{description:"Guasto infrastrutturale — escalation L2",                   type:"data_value"},      direction:"forward", isCritical:false, strength:0.42 },
  { id:"syn_028", from:"station_sme_hub",             to:"station_installation_hub",      condition:{description:"intent.NAV_GRAPH == nav_sme_installation",                  type:"config_flag"},     direction:"forward", isCritical:false, strength:0.55 },
  { id:"syn_029", from:"station_sme_hub",             to:"station_assurance_hub",         condition:{description:"intent.NAV_GRAPH == nav_sme_assurance",                     type:"config_flag"},     direction:"forward", isCritical:false, strength:0.45 },
  { id:"syn_030", from:"station_wholesale_hub",       to:"station_barcode_scan",          condition:{description:"Primo step: scansione device",                              type:"always"},          direction:"forward", isCritical:false, strength:0.88 },
  { id:"syn_031", from:"station_modem_config",        to:"station_room_db",               condition:{description:"Persiste stato modem per offline",                          type:"always"},          direction:"forward", isCritical:true,  strength:0.91 },
  { id:"syn_032", from:"station_network_diag",        to:"station_room_db",               condition:{description:"Salva risultati diagnostica",                               type:"always"},          direction:"forward", isCritical:false, strength:0.77 },
  { id:"syn_033", from:"station_speed_test",          to:"station_retrofit_api",          condition:{description:"Usa @SpeedTestOkHttpClient",                                type:"always"},          direction:"forward", isCritical:true,  strength:0.95 },
  { id:"syn_034", from:"station_modem_config",        to:"station_retrofit_api",          condition:{description:"Recupera profilo configurazione dal gateway",                type:"always"},          direction:"forward", isCritical:true,  strength:0.88 },
  { id:"syn_035", from:"station_photo_sign",          to:"station_retrofit_api",          condition:{description:"Upload foto e firma al document gateway",                    type:"always"},          direction:"forward", isCritical:true,  strength:0.85 },
  { id:"syn_036", from:"station_update_check",        to:"station_firebase",              condition:{description:"Consulta Remote Config",                                    type:"always"},          direction:"forward", isCritical:true,  strength:0.98 },
  { id:"syn_037", from:"station_hilt_di",             to:"station_retrofit_api",          condition:{description:"Fornisce istanze OkHttp via Qualifiers",                    type:"always"},          direction:"forward", isCritical:true,  strength:1.00 },
  { id:"syn_038", from:"station_hilt_di",             to:"station_room_db",               condition:{description:"Fornisce AppDatabase come singleton",                        type:"always"},          direction:"forward", isCritical:true,  strength:1.00 },
];

const LINES = [
  { id:"line_ftth_happy",      name:"FTTH — Happy Path",              world:"world_installation", color:"#4cc9f0", outcome:"success", path:["station_main_activity","station_update_check","station_microsoft_auth","station_login","station_installation_hub","station_ftth_config","station_modem_config","station_barcode_scan","station_photo_sign","station_order_close_success"] },
  { id:"line_install_std",     name:"Installazione Standard",         world:"world_installation", color:"#74b9ff", outcome:"success", path:["station_main_activity","station_update_check","station_microsoft_auth","station_login","station_installation_hub","station_modem_config","station_barcode_scan","station_photo_sign","station_order_close_success"] },
  { id:"line_install_sim",     name:"Installazione con SIM",          world:"world_installation", color:"#0984e3", outcome:"success", path:["station_main_activity","station_update_check","station_microsoft_auth","station_login","station_installation_hub","station_modem_config","station_barcode_scan","station_sim_config","station_photo_sign","station_order_close_success"] },
  { id:"line_ftth_fail",       name:"FTTH — Fibra non sincronizzata", world:"world_installation", color:"#e17055", outcome:"failure", path:["station_main_activity","station_update_check","station_microsoft_auth","station_login","station_installation_hub","station_ftth_config","station_error_installation"] },
  { id:"line_speed_ok",        name:"Assurance — Velocità OK",        world:"world_assurance",    color:"#7bed9f", outcome:"success", path:["station_main_activity","station_update_check","station_microsoft_auth","station_login","station_assurance_hub","station_speed_test","station_ticket_close_success"] },
  { id:"line_speed_diag",      name:"Assurance — Diagnostica",        world:"world_assurance",    color:"#fdcb6e", outcome:"partial", path:["station_main_activity","station_update_check","station_microsoft_auth","station_login","station_assurance_hub","station_speed_test","station_network_diag","station_ticket_close_success"] },
  { id:"line_escalation",      name:"Assurance — Escalation L2",      world:"world_assurance",    color:"#d63031", outcome:"failure", path:["station_main_activity","station_update_check","station_microsoft_auth","station_login","station_assurance_hub","station_network_diag","station_error_assurance"] },
  { id:"line_sme",             name:"SME — Installazione",            world:"world_sme",          color:"#a29bfe", outcome:"success", path:["station_main_activity","station_update_check","station_microsoft_auth","station_login","station_sme_hub","station_installation_hub","station_modem_config","station_barcode_scan","station_photo_sign","station_order_close_success"] },
  { id:"line_auth_fail",       name:"Auth — Azure AD Error",          world:"world_auth",         color:"#b2bec3", outcome:"failure", path:["station_main_activity","station_update_check","station_microsoft_auth","station_error_auth"] },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const worldMap   = Object.fromEntries(WORLDS.map(w => [w.id, w]));
const stationMap = Object.fromEntries(STATIONS.map(s => [s.id, s]));

function nodeRadius(s) {
  const base = 13;
  const imp  = s.weight.centrality * 0.55 + s.weight.influence * 0.45;
  return Math.round(base * (0.65 + imp * 1.55));
}

function fragColor(f) {
  if (f < 0.35) return "#00b894";
  if (f < 0.60) return "#fdcb6e";
  if (f < 0.80) return "#e17055";
  return "#ff4757";
}

function computeActivations(query) {
  if (!query.trim()) return {};
  const q = query.toLowerCase();
  const synonyms = {
    lento:["speed","velocit","performance","timeout"],
    errore:["error","failure","failed","exception","krash","crash"],
    rete:["network","retrofit","http","api","diag"],
    login:["auth","msal","azure","microsoft","token"],
    database:["room","dao","db","cache","offline"],
    fibra:["ftth","ont","fiber","fibra"],
    modem:["modem","router","device","hardware"],
    firma:["sign","photo","foto","document","upload"],
    notifica:["firebase","fcm","messaging","push"],
    partner:["wholesale","partner","open fiber","sielte"],
    business:["sme","business","aziendale"],
    guasto:["assurance","diagnostica","fault","guasto","broken"],
    sim:["sim","card","mobile"],
  };
  let terms = [q];
  Object.entries(synonyms).forEach(([k, v]) => {
    if (k.includes(q) || q.includes(k) || v.some(x => x.includes(q) || q.includes(x)))
      terms = [...new Set([...terms, k, ...v])];
  });

  const act = {};
  STATIONS.forEach(s => {
    const corpus = [s.label, s.description, s.world, ...(s.files || [])].join(" ").toLowerCase();
    let score = 0;
    terms.forEach(t => {
      if (s.label.toLowerCase().includes(t))        score = Math.max(score, 0.96);
      else if (s.world.replace("world_","").includes(t)) score = Math.max(score, 0.72);
      else if (corpus.includes(t))                  score = Math.max(score, 0.78);
    });
    if (score > 0) act[s.id] = score;
  });

  for (let hop = 0; hop < 2; hop++) {
    const snap = { ...act };
    SYNAPSES.forEach(syn => {
      const fa = snap[syn.from] || 0;
      if (fa > 0.08) {
        const spread = fa * (syn.strength || 0.5) * 0.42;
        act[syn.to] = Math.max(act[syn.to] || 0, spread);
      }
    });
  }
  return act;
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export default function SubwayRenderer() {
  const svgRef     = useRef(null);
  const nodesRef   = useRef(null);
  const linksRef   = useRef(null);
  const isDrag     = useRef(false);
  const dragOrig   = useRef(null);

  const [tick,        setTick]       = useState(0);
  const [transform,   setTransform]  = useState({ x: 0, y: 0, k: 1 });
  const [selected,    setSelected]   = useState(null);
  const [hovered,     setHovered]    = useState(null);
  const [search,      setSearch]     = useState("");
  const [pinned,      setPinned]     = useState(new Set());
  const [notes,       setNotes]      = useState({});
  const [noteText,    setNoteText]   = useState("");
  const [filterWorld, setFilterWorld]= useState(null);
  const [selectedLine,setSelectedLine]=useState(null);
  const [panel,       setPanel]      = useState("none"); // "detail"|"lines"|"pins"|"none"

  // D3 simulation
  useEffect(() => {
    const nodeData = STATIONS.map(s => ({ ...s, r: nodeRadius(s) }));
    const linkData = SYNAPSES.map(s => ({ ...s, source: s.from, target: s.to }));
    nodesRef.current = nodeData;
    linksRef.current = linkData;

    const sim = d3.forceSimulation(nodeData)
      .force("link",    d3.forceLink(linkData).id(d => d.id).distance(d => 90 + (1-(d.strength||.5))*90).strength(.2))
      .force("charge",  d3.forceManyBody().strength(d => -350 - d.r * 12))
      .force("center",  d3.forceCenter(500, 360))
      .force("collide", d3.forceCollide(d => d.r + 32).strength(.85))
      .alphaDecay(.018)
      .on("tick", () => setTick(t => t + 1));

    return () => sim.stop();
  }, []);

  // Wheel zoom
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const fn = e => {
      e.preventDefault();
      setTransform(t => ({ ...t, k: Math.max(.22, Math.min(2.8, t.k * (1 - e.deltaY * .0008))) }));
    };
    el.addEventListener("wheel", fn, { passive: false });
    return () => el.removeEventListener("wheel", fn);
  }, []);

  const activations  = useMemo(() => computeActivations(search), [search]);
  const isSearching  = search.trim().length > 0;
  const hitCount     = Object.keys(activations).length;

  const lineSet = useMemo(() => {
    if (!selectedLine) return null;
    return new Set(LINES.find(l => l.id === selectedLine)?.path || []);
  }, [selectedLine]);

  const linePairs = useMemo(() => {
    if (!selectedLine) return null;
    const path = LINES.find(l => l.id === selectedLine)?.path || [];
    const s = new Set();
    for (let i = 0; i < path.length - 1; i++) s.add(`${path[i]}__${path[i+1]}`);
    return s;
  }, [selectedLine]);

  const connectedIds = useMemo(() => {
    if (!selected && !hovered) return null;
    const focus = (selected || hovered).id;
    const ids = new Set([focus]);
    SYNAPSES.forEach(s => {
      if (s.from === focus) ids.add(s.to);
      if (s.to   === focus) ids.add(s.from);
    });
    return ids;
  }, [selected, hovered]);

  // Opacity helpers
  function nOpacity(s) {
    if (filterWorld && s.world !== filterWorld) return 0.06;
    if (lineSet && !lineSet.has(s.id)) return 0.07;
    if (isSearching) { const a = activations[s.id]||0; return a > 0 ? .25 + a*.75 : .05; }
    if (connectedIds && !connectedIds.has(s.id)) return 0.1;
    return 1;
  }
  function sOpacity(syn) {
    const fId = syn.source?.id || syn.from;
    const tId = syn.target?.id || syn.to;
    if (filterWorld) {
      const fs = stationMap[fId];
      if (fs?.world !== filterWorld) return 0;
    }
    if (linePairs) {
      const key = `${fId}__${tId}`;
      return linePairs.has(key) ? 1 : .02;
    }
    if (isSearching) {
      const fa = activations[fId]||0, ta = activations[tId]||0;
      const mx = Math.max(fa, ta);
      return mx > .2 ? mx * .75 : .03;
    }
    if (connectedIds) {
      return (connectedIds.has(fId) && connectedIds.has(tId)) ? .85 : .04;
    }
    return .28;
  }
  function sColor(syn) {
    if (selectedLine) {
      const line = LINES.find(l => l.id === selectedLine);
      const key  = `${syn.source?.id||syn.from}__${syn.target?.id||syn.to}`;
      if (linePairs?.has(key)) return line?.color || "#fff";
    }
    return worldMap[stationMap[syn.source?.id||syn.from]?.world]?.color || "#3a3a5a";
  }
  function synPath(syn) {
    const s = syn.source, t = syn.target;
    if (!s || !t || s.x == null || t.x == null) return "";
    const dx = t.x-s.x, dy = t.y-s.y, d = Math.hypot(dx,dy);
    if (d < 1) return "";
    const curve = d * .22;
    const mx = (s.x+t.x)/2 - dy*curve/d;
    const my = (s.y+t.y)/2 + dx*curve/d;
    const ang = Math.atan2(dy, dx);
    const sx = s.x + Math.cos(ang)*(s.r+2);
    const sy = s.y + Math.sin(ang)*(s.r+2);
    const ex = t.x - Math.cos(ang)*(t.r+8);
    const ey = t.y - Math.sin(ang)*(t.r+8);
    return `M${sx},${sy} Q${mx},${my} ${ex},${ey}`;
  }

  const handleNodeClick = (e, st) => {
    e.stopPropagation();
    setSelected(st);
    setNoteText(notes[st.id] || "");
    setPanel("detail");
  };
  const handleSvgClick = () => { setSelected(null); if (panel === "detail") setPanel("none"); };
  const onMouseDown = e => {
    if (e.target.closest(".sn")) return;
    isDrag.current = true;
    dragOrig.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
  };
  const onMouseMove = e => {
    if (!isDrag.current) return;
    setTransform(t => ({ ...t, x: e.clientX - dragOrig.current.x, y: e.clientY - dragOrig.current.y }));
  };
  const onMouseUp = () => { isDrag.current = false; };

  const togglePin = id => setPinned(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const saveNote  = () => { if (selected) setNotes(p => ({ ...p, [selected.id]: noteText })); };

  const nodes = nodesRef.current || [];
  const links = linksRef.current || [];

  const outcomeStyle = o => ({
    success: { bg:"#00b89422", color:"#00b894" },
    failure: { bg:"#ff475722", color:"#ff4757" },
    partial: { bg:"#fdcb6e22", color:"#fdcb6e" },
  }[o] || {bg:"#333",color:"#aaa"});

  return (
    <div style={{ background:"#050510", height:"100vh", display:"flex", flexDirection:"column", fontFamily:"ui-monospace,'Cascadia Code','SF Mono',Menlo,monospace", color:"#fff", overflow:"hidden" }}>

      {/* ── HEADER ── */}
      <header style={{ display:"flex", alignItems:"center", gap:10, padding:"0 18px", height:50, borderBottom:"1px solid #0f0f22", background:"#070714", flexShrink:0, zIndex:20 }}>

        <div style={{ display:"flex", alignItems:"center", gap:7 }}>
          <div style={{ width:24, height:24, borderRadius:5, background:"linear-gradient(135deg,#e94560,#a29bfe)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:900, letterSpacing:"-0.05em" }}>S</div>
          <span style={{ fontSize:12, fontWeight:800, letterSpacing:"0.12em" }}>SUBWAY</span>
          <span style={{ fontSize:10, color:"#2a2a44", marginLeft:2 }}>/ App Delivery</span>
        </div>

        {/* Search */}
        <div style={{ position:"relative", flex:1, maxWidth:400 }}>
          <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", fontSize:13, color: isSearching ? "#a29bfe" : "#2a2a44", transition:"color .2s" }}>⌕</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Synaptic search  —  cerca componente, file, concetto, sintomo..."
            style={{ width:"100%", padding:"6px 36px 6px 30px", background: isSearching ? "#0c0c1e" : "#090916", border:`1px solid ${isSearching ? "#a29bfe44" : "#0f0f22"}`, borderRadius:7, color:"#ccc", fontSize:11, outline:"none", boxSizing:"border-box", boxShadow: isSearching ? "0 0 20px #a29bfe1a" : "none", transition:"all .25s" }} />
          {isSearching && (
            <span style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", fontSize:9, color:"#a29bfe66" }}>{hitCount}</span>
          )}
          {search && (
            <button onClick={() => setSearch("")} style={{ position:"absolute", right: isSearching ? 36 : 8, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#333", cursor:"pointer", fontSize:13, lineHeight:1 }}>×</button>
          )}
        </div>

        {/* World pills */}
        <div style={{ display:"flex", gap:3 }}>
          {WORLDS.map(w => (
            <button key={w.id} onClick={() => setFilterWorld(filterWorld===w.id ? null : w.id)}
              style={{ padding:"3px 7px", borderRadius:4, fontSize:9, cursor:"pointer", border:"none", background: filterWorld===w.id ? w.color : "#0f0f22", color: filterWorld===w.id ? "#fff" : "#444", fontFamily:"inherit", fontWeight:700, letterSpacing:".06em", transition:"all .15s" }}>
              {w.name.toUpperCase()}
            </button>
          ))}
        </div>

        <div style={{ display:"flex", gap:5, marginLeft:4 }}>
          {[
            { key:"lines", label:"LINES",  badge: null,       active: panel==="lines" },
            { key:"pins",  label:"PINS",   badge: pinned.size||null, active: panel==="pins" },
          ].map(btn => (
            <button key={btn.key} onClick={() => setPanel(p => p===btn.key ? "none" : btn.key)}
              style={{ padding:"3px 9px", borderRadius:4, fontSize:9, cursor:"pointer", border:`1px solid ${btn.active ? "#2a2a44" : "#0f0f22"}`, background: btn.active ? "#0f0f22" : "transparent", color: btn.key==="pins" && pinned.size>0 ? "#fdcb6e" : "#555", fontFamily:"inherit", fontWeight:700 }}>
              {btn.label}{btn.badge ? ` ${btn.badge}` : ""}
            </button>
          ))}
          <button onClick={() => { setTransform({x:0,y:0,k:1}); setFilterWorld(null); setSelectedLine(null); setSearch(""); setSelected(null); setPanel("none"); }}
            style={{ padding:"3px 9px", borderRadius:4, fontSize:9, cursor:"pointer", border:"1px solid #0f0f22", background:"transparent", color:"#333", fontFamily:"inherit" }}>RESET</button>
        </div>
      </header>

      {/* ── BODY ── */}
      <div style={{ flex:1, display:"flex", overflow:"hidden", position:"relative" }}>

        {/* ── GRAPH ── */}
        <svg ref={svgRef} style={{ flex:1, display:"block", cursor: isDrag.current ? "grabbing" : "grab" }}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onClick={handleSvgClick}>

          <defs>
            {WORLDS.map(w => (
              <marker key={w.id} id={`arr-${w.id}`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                <path d="M0,0 L7,3.5 L0,7 Z" fill={w.color} opacity=".65"/>
              </marker>
            ))}
            <marker id="arr-default" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#1e1e3a"/>
            </marker>
            <filter id="glow-s"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            <filter id="glow-m"><feGaussianBlur stdDeviation="5"   result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            <filter id="glow-l"><feGaussianBlur stdDeviation="10"  result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          </defs>

          {/* dots grid */}
          <g opacity=".025">
            {Array.from({length:30}).map((_,i) => Array.from({length:40}).map((_,j) => (
              <circle key={`${i}-${j}`} cx={j*60} cy={i*60} r="1" fill="#7777ff"/>
            )))}
          </g>

          <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>

            {/* SYNAPSES */}
            {links.map((syn, i) => {
              const p  = synPath(syn);
              if (!p) return null;
              const op = sOpacity(syn);
              const co = sColor(syn);
              const srcW = stationMap[syn.source?.id || syn.from]?.world;
              const markId = srcW ? `arr-${srcW}` : "arr-default";
              return (
                <g key={syn.id || i} opacity={op} style={{transition:"opacity .3s"}}>
                  {syn.isCritical && op > .35 && (
                    <path d={p} fill="none" stroke={co} strokeWidth={4} opacity={.12} filter="url(#glow-s)"/>
                  )}
                  <path d={p} fill="none" stroke={co}
                    strokeWidth={syn.isCritical ? 1.6 : .9}
                    strokeDasharray={syn.direction==="back" ? "4 4" : syn.condition?.type==="always" ? "none" : "7 4"}
                    markerEnd={`url(#${markId})`}
                  />
                </g>
              );
            })}

            {/* STATIONS */}
            {nodes.map(st => {
              if (st.x == null) return null;
              const W    = worldMap[st.world] || { color:"#888" };
              const r    = st.r;
              const op   = nOpacity(st);
              const isSel = selected?.id === st.id;
              const isHov = hovered?.id === st.id;
              const isPinned = pinned.has(st.id);
              const hasNote  = !!notes[st.id];
              const act  = activations[st.id] || 0;
              const fc   = fragColor(st.weight.fragility);
              const isBoss  = st.role === "boss";
              const isStart = st.role === "start";
              const isOk    = st.role === "terminal" && st.terminalType === "success";
              const isFail  = st.role === "terminal" && st.terminalType === "failure";

              return (
                <g key={st.id} className="sn"
                  transform={`translate(${st.x},${st.y})`}
                  style={{ cursor:"pointer", opacity:op, transition:"opacity .25s" }}
                  onClick={e => handleNodeClick(e, st)}
                  onMouseEnter={() => setHovered(st)}
                  onMouseLeave={() => setHovered(null)}>

                  {/* Boss pulse */}
                  {isBoss && (
                    <circle r={r+14} fill="none" stroke={W.color} strokeWidth={1.5} opacity={.18} filter="url(#glow-m)">
                      <animate attributeName="r"       values={`${r+10};${r+20};${r+10}`} dur="3.5s" repeatCount="indefinite"/>
                      <animate attributeName="opacity" values=".25;.04;.25"               dur="3.5s" repeatCount="indefinite"/>
                    </circle>
                  )}

                  {/* Terminal halos */}
                  {isOk   && <circle r={r+7} fill="none" stroke="#00b894" strokeWidth={2}   opacity={.7} filter="url(#glow-s)"/>}
                  {isFail && <circle r={r+7} fill="none" stroke="#ff4757" strokeWidth={2}   opacity={.7} filter="url(#glow-s)"/>}
                  {isStart && <circle r={r+9} fill="none" stroke={W.color} strokeWidth={1} opacity={.35} strokeDasharray="4 4"/>}

                  {/* Selection / hover ring */}
                  {(isSel||isHov) && <circle r={r+5} fill="none" stroke={W.color} strokeWidth={isSel?2.5:1.5} opacity={.9} filter="url(#glow-s)"/>}

                  {/* Synaptic search glow */}
                  {isSearching && act > .45 && <circle r={r+18} fill={W.color} opacity={act*.12} filter="url(#glow-l)"/>}

                  {/* Body */}
                  <circle r={r} fill={`${W.color}16`} stroke={isSel ? W.color : fc} strokeWidth={isSel?2.5:isBoss?2:1.5} filter={(isBoss||isSel)?"url(#glow-s)":undefined}/>

                  {/* Inner core */}
                  {(isBoss||isStart) && <circle r={r*.38} fill={W.color} opacity={.38}/>}

                  {/* Role symbols */}
                  {isStart      && <circle r={3.5} fill={W.color} opacity={.95}/>}
                  {st.role==="checkpoint" && <rect x={-3} y={-3} width={6} height={6} fill={W.color} opacity={.6} transform="rotate(45)"/>}

                  {/* Fragility dot */}
                  <circle cx={r-2} cy={-r+2} r={3.5} fill={fc} opacity={.95}/>

                  {/* Pin */}
                  {isPinned && <text x={-r+1} y={-r+9} fontSize={8} style={{userSelect:"none",pointerEvents:"none"}}>📌</text>}

                  {/* Note dot */}
                  {hasNote && <circle cx={r-2} cy={r-2} r={3} fill="#fdcb6e" opacity={.9}/>}

                  {/* Activation % */}
                  {isSearching && act > .6 && (
                    <text y={-r-8} textAnchor="middle" fontSize={8} fill={W.color} opacity={act} fontWeight={700} style={{userSelect:"none",pointerEvents:"none"}}>
                      {Math.round(act*100)}%
                    </text>
                  )}

                  {/* Label */}
                  <text y={r+13} textAnchor="middle" fontSize={isSel||isHov ? 11 : 10}
                    fill={isSel ? W.color : "#99a"} fontWeight={isSel?700:400} style={{userSelect:"none",pointerEvents:"none"}}>
                    {st.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* ── RIGHT PANEL ── */}
        {panel !== "none" && (
          <div style={{ width:310, borderLeft:"1px solid #0f0f22", background:"#070714", display:"flex", flexDirection:"column", flexShrink:0, overflowY:"auto" }}>

            {/* DETAIL */}
            {panel === "detail" && selected && (() => {
              const W  = worldMap[selected.world];
              const out = SYNAPSES.filter(s => s.from === selected.id);
              const inc = SYNAPSES.filter(s => s.to   === selected.id);
              return (
                <div style={{ padding:18, display:"flex", flexDirection:"column", gap:16 }}>
                  {/* Top bar */}
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <div style={{ width:7, height:7, borderRadius:"50%", background:W?.color }}/>
                    <span style={{ fontSize:9, color:"#444", letterSpacing:".1em" }}>{W?.name?.toUpperCase()} · {selected.role?.toUpperCase()}</span>
                    <div style={{ marginLeft:"auto", display:"flex", gap:6, alignItems:"center" }}>
                      <button onClick={() => togglePin(selected.id)} title="Pin" style={{ background:"none", border:"none", cursor:"pointer", fontSize:13, opacity: pinned.has(selected.id)?1:.35, transition:"opacity .15s" }}>📌</button>
                      <button onClick={() => { setPanel("none"); setSelected(null); }} style={{ background:"none", border:"none", cursor:"pointer", color:"#444", fontSize:16, lineHeight:1 }}>×</button>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize:16, fontWeight:800, color:W?.color, marginBottom:8 }}>{selected.label}</div>
                    <p style={{ fontSize:11, color:"#777", lineHeight:1.8, margin:0 }}>{selected.description}</p>
                  </div>

                  {/* Weights */}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                    {[
                      {k:"influence", label:"INFLUENCE", c:"#74b9ff"},
                      {k:"fragility", label:"FRAGILITY",  c: fragColor(selected.weight.fragility)},
                      {k:"churn",     label:"CHURN",      c:"#fdcb6e"},
                      {k:"centrality",label:"CENTRALITY", c:"#a29bfe"},
                    ].map(({k,label,c}) => (
                      <div key={k} style={{ background:"#0b0b1c", borderRadius:5, padding:"7px 9px" }}>
                        <div style={{ fontSize:8, color:"#333", letterSpacing:".1em", marginBottom:3 }}>{label}</div>
                        <div style={{ height:2, background:"#111", borderRadius:1, marginBottom:3 }}>
                          <div style={{ height:"100%", width:`${selected.weight[k]*100}%`, background:c, borderRadius:1 }}/>
                        </div>
                        <div style={{ fontSize:11, color:c, fontWeight:700 }}>{Math.round(selected.weight[k]*100)}%</div>
                      </div>
                    ))}
                  </div>

                  {/* Files */}
                  <div>
                    <div style={{ fontSize:9, color:"#333", letterSpacing:".1em", marginBottom:7 }}>FILES</div>
                    {selected.files?.map(f => (
                      <div key={f} style={{ padding:"4px 8px", marginBottom:3, background:"#0b0b1c", borderRadius:4, fontSize:10, color:"#5c7eb8", borderLeft:`2px solid ${W?.color}44` }}>{f}</div>
                    ))}
                  </div>

                  {/* Authors */}
                  <div>
                    <div style={{ fontSize:9, color:"#333", letterSpacing:".1em", marginBottom:5 }}>AUTORI · {selected.commitCount} commit</div>
                    <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                      {selected.authors?.map(a => (
                        <span key={a} style={{ padding:"2px 6px", background:"#0f0f22", borderRadius:3, fontSize:9, color:"#666" }}>{a}</span>
                      ))}
                    </div>
                  </div>

                  {/* Outgoing */}
                  {out.length > 0 && (
                    <div>
                      <div style={{ fontSize:9, color:"#333", letterSpacing:".1em", marginBottom:7 }}>USCITE ({out.length})</div>
                      {out.map(syn => {
                        const tgt = stationMap[syn.to];
                        const TW  = worldMap[tgt?.world];
                        return (
                          <div key={syn.id} onClick={() => { setSelected(tgt); setNoteText(notes[tgt?.id]||""); }}
                            style={{ padding:"7px 9px", marginBottom:4, background:"#0b0b1c", borderRadius:5, cursor:"pointer", borderLeft:`3px solid ${TW?.color||"#222"}`, transition:"background .15s" }}
                            onMouseEnter={e=>e.currentTarget.style.background="#0f0f22"} onMouseLeave={e=>e.currentTarget.style.background="#0b0b1c"}>
                            <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:2 }}>
                              <span style={{ fontSize:10, color:"#ccc", fontWeight:700 }}>{tgt?.label}</span>
                              {syn.direction==="back"   && <span style={{ fontSize:8, color:"#e17055" }}>↩</span>}
                              {syn.isCritical           && <span style={{ fontSize:8, color:"#ff4757" }}>⚡</span>}
                            </div>
                            {syn.condition?.type !== "always" && (
                              <div style={{ fontSize:9, color:"#3a3a5a", fontStyle:"italic" }}>if {syn.condition?.description}</div>
                            )}
                            <div style={{ fontSize:8, color:"#2a2a44", marginTop:2 }}>strength {Math.round((syn.strength||0)*100)}%</div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Incoming */}
                  {inc.length > 0 && (
                    <div>
                      <div style={{ fontSize:9, color:"#333", letterSpacing:".1em", marginBottom:7 }}>ENTRATE ({inc.length})</div>
                      {inc.map(syn => {
                        const src = stationMap[syn.from];
                        const SW  = worldMap[src?.world];
                        return (
                          <div key={syn.id} onClick={() => { setSelected(src); setNoteText(notes[src?.id]||""); }}
                            style={{ padding:"7px 9px", marginBottom:4, background:"#0b0b1c", borderRadius:5, cursor:"pointer", borderLeft:`3px solid ${SW?.color||"#222"}`, transition:"background .15s" }}
                            onMouseEnter={e=>e.currentTarget.style.background="#0f0f22"} onMouseLeave={e=>e.currentTarget.style.background="#0b0b1c"}>
                            <span style={{ fontSize:10, color:"#ccc", fontWeight:700 }}>{src?.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Note */}
                  <div>
                    <div style={{ fontSize:9, color:"#333", letterSpacing:".1em", marginBottom:7 }}>NOTA {notes[selected.id] && <span style={{color:"#fdcb6e"}}>●</span>}</div>
                    <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
                      placeholder="Aggiungi una nota..."
                      rows={3}
                      style={{ width:"100%", background:"#0b0b1c", border:"1px solid #0f0f22", borderRadius:5, color:"#aaa", fontSize:11, padding:"7px 9px", fontFamily:"inherit", resize:"vertical", boxSizing:"border-box", outline:"none" }}/>
                    <div style={{ display:"flex", gap:6, marginTop:5 }}>
                      <button onClick={saveNote}
                        style={{ flex:1, padding:"5px 0", background:`${W?.color}1a`, border:`1px solid ${W?.color}33`, borderRadius:4, color:W?.color, fontSize:10, cursor:"pointer", fontFamily:"inherit" }}>
                        Salva
                      </button>
                      {notes[selected.id] && (
                        <button onClick={() => { setNotes(p => { const n={...p}; delete n[selected.id]; return n; }); setNoteText(""); }}
                          style={{ padding:"5px 10px", background:"transparent", border:"1px solid #1a1a2e", borderRadius:4, color:"#444", fontSize:10, cursor:"pointer" }}>
                          Elimina
                        </button>
                      )}
                    </div>
                    {notes[selected.id] && (
                      <div style={{ marginTop:10, padding:"8px 10px", background:"#0b0b1c", borderRadius:5, borderLeft:"2px solid #fdcb6e44" }}>
                        <div style={{ fontSize:9, color:"#444", marginBottom:4 }}>NOTA SALVATA</div>
                        <div style={{ fontSize:11, color:"#aaa", lineHeight:1.7, whiteSpace:"pre-wrap" }}>{notes[selected.id]}</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* LINES */}
            {panel === "lines" && (
              <div style={{ padding:18 }}>
                <div style={{ fontSize:9, color:"#333", letterSpacing:".12em", marginBottom:14 }}>LINES — PERCORSI COMPLETI ({LINES.length})</div>
                {LINES.map(line => {
                  const os = outcomeStyle(line.outcome);
                  const isSel = selectedLine === line.id;
                  return (
                    <div key={line.id} onClick={() => setSelectedLine(isSel ? null : line.id)}
                      style={{ padding:"10px 11px", marginBottom:7, borderRadius:6, cursor:"pointer", background: isSel ? `${line.color}14` : "#0b0b1c", border:`1px solid ${isSel ? line.color+"55" : "#0f0f22"}`, transition:"all .15s" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:5 }}>
                        <div style={{ width:12, height:3, borderRadius:2, background:line.color, flexShrink:0 }}/>
                        <span style={{ fontSize:10, color:"#ddd", fontWeight:700 }}>{line.name}</span>
                      </div>
                      <div style={{ display:"flex", gap:5, alignItems:"center", marginBottom: isSel ? 10 : 0 }}>
                        <span style={{ fontSize:9, padding:"1px 6px", borderRadius:3, background:os.bg, color:os.color }}>{line.outcome}</span>
                        <span style={{ fontSize:9, color:"#2a2a44" }}>{line.path.length} stazioni</span>
                      </div>
                      {isSel && (
                        <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
                          {line.path.map((sid, idx) => {
                            const st = stationMap[sid];
                            const SW = worldMap[st?.world];
                            return (
                              <div key={sid} style={{ display:"flex", alignItems:"center", gap:6 }}
                                onClick={e => { e.stopPropagation(); setSelected(st); setNoteText(notes[sid]||""); setPanel("detail"); }}>
                                {idx > 0 && <div style={{ width:1, height:10, background:line.color+"55", marginLeft:3, flexShrink:0 }}/>}
                                {idx === 0 && <div style={{ width:7, flexShrink:0 }}/>}
                                <div style={{ width:6, height:6, borderRadius:"50%", background:SW?.color||"#888", flexShrink:0 }}/>
                                <span style={{ fontSize:10, color:"#aaa" }}>{st?.label}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* PINS */}
            {panel === "pins" && (
              <div style={{ padding:18 }}>
                <div style={{ fontSize:9, color:"#333", letterSpacing:".12em", marginBottom:14 }}>PINNATI ({pinned.size})</div>
                {pinned.size === 0 && (
                  <p style={{ fontSize:11, color:"#2a2a44", lineHeight:1.8 }}>Nessuna stazione pinnata.<br/>Apri il dettaglio e premi 📌</p>
                )}
                {Array.from(pinned).map(id => {
                  const st = stationMap[id];
                  const SW = worldMap[st?.world];
                  return (
                    <div key={id} onClick={() => { setSelected(st); setNoteText(notes[id]||""); setPanel("detail"); }}
                      style={{ padding:"10px 11px", marginBottom:6, borderRadius:6, background:"#0b0b1c", cursor:"pointer", borderLeft:`3px solid ${SW?.color||"#888"}`, display:"flex", alignItems:"center", gap:10, transition:"background .15s" }}
                      onMouseEnter={e=>e.currentTarget.style.background="#0f0f22"} onMouseLeave={e=>e.currentTarget.style.background="#0b0b1c"}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:11, color:"#ddd", fontWeight:700, marginBottom:2 }}>{st?.label}</div>
                        <div style={{ fontSize:9, color:"#444" }}>{SW?.name}</div>
                        {notes[id] && <div style={{ fontSize:9, color:"#fdcb6e55", marginTop:3 }}>📝 nota</div>}
                      </div>
                      <button onClick={e => { e.stopPropagation(); togglePin(id); }}
                        style={{ background:"none", border:"none", cursor:"pointer", color:"#2a2a44", fontSize:13 }}>×</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── STATUS BAR ── */}
      <div style={{ height:28, borderTop:"1px solid #0f0f22", background:"#070714", display:"flex", alignItems:"center", padding:"0 18px", gap:14, flexShrink:0 }}>
        <span style={{ fontSize:9, color:"#1e1e38" }}>Drag · Scroll zoom · Click node</span>
        {isSearching && <span style={{ fontSize:9, color:"#a29bfe66" }}>⌕ {hitCount} nodi attivati per "{search}"</span>}
        {selectedLine && <span style={{ fontSize:9, color: LINES.find(l=>l.id===selectedLine)?.color || "#fff" }}>▶ {LINES.find(l=>l.id===selectedLine)?.name}</span>}
        <div style={{ display:"flex", gap:10, marginLeft:"auto" }}>
          {[["#00b894","bassa"],["#fdcb6e","media"],["#e17055","alta"],["#ff4757","critica"]].map(([c,l]) => (
            <span key={l} style={{ fontSize:9, color:c, opacity:.7 }}>● {l}</span>
          ))}
          <span style={{ fontSize:9, color:"#1e1e38", marginLeft:4 }}>fragility</span>
        </div>
      </div>

      <style>{`
        input::placeholder, textarea::placeholder { color: #1e1e38; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: #070714; }
        ::-webkit-scrollbar-thumb { background: #111128; border-radius: 2px; }
      `}</style>
    </div>
  );
}
