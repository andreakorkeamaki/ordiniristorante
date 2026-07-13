# La Sagretta

Web app mobile-first per menu QR bilingue, comande di sala e asporto, cassa,
stampa e amministrazione. Next.js App Router e Supabase mantengono menu, servizi,
ordini e stati sincronizzati fra telefoni, tablet e PC anche su reti diverse.

## Funzioni e accessi

- `/menu`: menu pubblico IT/EN di sola lettura, con ricerca e avviso allergeni.
- `/staff`: accesso email/password; `/staff/forgot-password` e
  `/staff/reset-password` gestiscono recupero e cambio password, mentre
  `/auth/callback` scambia in sicurezza il codice della sessione.
- `/staff/tables`: tavoli del servizio corrente, ricerca, stato in tempo reale e
  ristampa della comanda; è disponibile a tutti i profili attivi.
- `/staff/table/[id]`: comanda al tavolo con coperti, note, extra, Presence,
  invio iniziale e aggiornamenti successivi; è disponibile a tutti i profili
  attivi.
- `/asporti`: elenco, ricerca e creazione degli asporti del servizio corrente;
  è riservata a cassa e amministratori.
- `/staff/order/[id]`: modifica della comanda asporto, con nome cliente e ora di
  ritiro; è riservata a cassa e amministratori.
- `/cassa`: apertura e chiusura del servizio, coda stampa, ordini attivi,
  scontrini, fallback manuali e riepilogo di fine servizio; è riservata a cassa
  e amministratori.
- `/admin`: categorie e prodotti riordinabili, disponibilità e visibilità del
  menu, extra, tavoli, impostazioni, modalità di stampa e prove PrintNode/browser;
  è riservata agli amministratori.
- `/admin/print-test`: anteprima e prova di stampa browser riservata agli
  amministratori.

Le route server principali sono `/api/health`, `/api/print-order`,
`/api/close-table`, `/api/close-service` e `/api/print-test-order`. Applicano i
controlli di sessione e ruolo prima di usare credenziali server-side.

L'amministrazione modifica i testi italiani, che restano la fonte editoriale.
Se cambia il nome di una categoria o di un prodotto, oppure gli ingredienti di
un prodotto, la traduzione inglese corrispondente viene svuotata per evitare di
pubblicare una traduzione non più allineata; il menu pubblico usa nel frattempo
il testo italiano come fallback.

Supabase è l’unica fonte di verità. Il browser non salva menu o comande in `localStorage`.

## Flusso operativo

1. Cassa o amministrazione apre un solo servizio alla volta, scegliendo pranzo
   o cena. Un servizio precedente deve essere chiuso prima di iniziare quello
   del giorno.
2. Un cameriere apre un tavolo; cassa o amministrazione può anche creare un
   asporto con ritiro nella data del servizio. Senza servizio aperto non si
   possono creare o modificare comande operative.
3. Il primo invio porta la bozza a `pending_cashier`, crea in modo atomico il job
   `new_order` e tenta subito la stampa. La comanda resta modificabile: le
   aggiunte successive richiedono l'azione esplicita **Invia aggiornamento** e
   generano un job `order_update`.
4. La cassa risolve i job non conclusi, gestisce ristampe consapevoli e può
   confermare manualmente una stampa già verificata. Un esito incerto non viene
   mai ristampato automaticamente.
5. La chiusura del tavolo crea e stampa uno scontrino persistente da una copia;
   l'ordine si chiude solo dopo la conferma PrintNode o un fallback browser
   confermato e auditato.
6. La chiusura sicura del servizio chiude automaticamente le comande con stampa
   iniziale completata e tutti i job in stato terminale. Bozze, comande mai
   stampate e job non risolti restano blocchi espliciti. Al termine viene
   archiviato un riepilogo per tavoli e asporti e ne viene inviata una copia.

Annullare dalla cassa un job `new_order` mai consegnato a PrintNode annulla anche
la comanda, evitando che blocchi la chiusura del servizio. Una comanda di
annullamento viene invece generata quando la cucina potrebbe aver già ricevuto
la stampa originale.

## Requisiti

- Node.js 20.9 o successivo
- npm
- Supabase CLI
- Docker Desktop per lo stack Supabase e i pgTAP locali
- un progetto Supabase

## Configurazione MCP

Il progetto previsto usa il ref `lnckmyfillppaachcluz`:

```bash
codex mcp add supabase-appordini \
  --url "https://mcp.supabase.com/mcp?project_ref=lnckmyfillppaachcluz"
codex mcp login supabase-appordini
codex mcp get supabase-appordini
```

L’autenticazione richiede l’approvazione OAuth nel browser. Il server viene chiamato `supabase-appordini` per non sostituire altri collegamenti Supabase globali.

## Avvio locale

```bash
npm install
cp .env.example .env.local
npm run dev
```

Nel file `.env.local` inserire:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://lnckmyfillppaachcluz.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
NEXT_PUBLIC_MENU_ORIGIN=https://menu.example.it
NEXT_PUBLIC_APP_ORIGIN=https://ordini.example.it
PRINTNODE_API_KEY=printnode_server_only_api_key
PRINTNODE_PRINTER_ID=123456
```

La publishable key è progettata per il client ed è protetta da RLS. La
`SUPABASE_SECRET_KEY` è usata soltanto dalle route server, dopo i controlli di
sessione e ruolo, per le transizioni verificate dei job PrintNode e per il
riepilogo di chiusura. Non aggiungere mai secret key o `service_role` a
variabili `NEXT_PUBLIC_*`.
Anche `PRINTNODE_API_KEY` e `PRINTNODE_PRINTER_ID` sono variabili esclusivamente
server-side: non devono avere il prefisso `NEXT_PUBLIC_`.

Le due origini sono opzionali in locale. In produzione permettono di collegare
due sottodomini allo stesso progetto Vercel:

- `NEXT_PUBLIC_MENU_ORIGIN`: dominio del menu pubblico;
- `NEXT_PUBLIC_APP_ORIGIN`: dominio riservato a staff, cassa e amministrazione.

Le richieste staff aperte sul dominio menu vengono reindirizzate
all'applicazione; il percorso `/menu` aperto sul dominio applicazione torna al
dominio pubblico.

## Database

Le migration versionate creano schema, trigger, RPC, indici, RLS e publication
Realtime. Le entità operative principali sono:

- `restaurant_services`, per il singolo servizio pranzo/cena aperto;
- `orders`, `order_items` e `order_item_extras`, con snapshot di prezzi e
  descrizioni;
- `print_jobs` e `order_activity`, per idempotenza, retry e audit;
- `service_close_reports`, per lo snapshot immutabile di fine servizio;
- `menu_categories`, `menu_items`, `menu_extras`, `restaurant_tables` e
  `restaurant_settings`, per la configurazione amministrativa.

Il seed importa fedelmente il menu della PWA originale:

- 10 categorie
- 79 prodotti
- 2 extra
- 31 tavoli attivi
- coperto €1,90
- 3 prodotti inizialmente esauriti

Per un progetto locale:

```bash
supabase start
supabase db reset
supabase test db
```

Per collegare un nuovo checkout al progetto remoto:

```bash
supabase login --name appordini
supabase link --project-ref lnckmyfillppaachcluz
supabase migration list
supabase db push --dry-run
supabase db push --include-seed
supabase config push
```

Il progetto di sviluppo attuale ha già migration, seed e configurazione Auth applicati. Il signup pubblico è disabilitato globalmente; il provider email resta attivo perché login e recupero password devono funzionare. Non eseguire `db reset` su un database che contiene dati reali e non rieseguire manualmente una migration già registrata.

Per verificare il database remoto:

```bash
supabase migration list
supabase db lint --linked --schema public --level warning --fail-on error
supabase inspect db table-stats
supabase inspect db index-stats
supabase test db --linked supabase/tests/database_test.sql
```

Il runner pgTAP della CLI richiede Docker Desktop anche con `--linked`.

Il seed è idempotente e può essere rigenerato dal menu originale:

```bash
node scripts/generate-seed.mjs
```

## Primo amministratore

Il signup pubblico deve restare disabilitato. Dal Dashboard Supabase:

1. aprire **Authentication → Users**;
2. creare l’utente con email e password;
3. recuperare il suo UUID;
4. eseguire nel SQL Editor:

```sql
update public.profiles
set full_name = 'Nome amministratore',
    role = 'admin',
    active = true
where id = 'UUID_UTENTE';
```

Per cassa o camerieri usare rispettivamente `cashier` o `waiter`. Il trigger crea sempre un profilo inattivo e con ruolo `waiter`: il ruolo non viene mai letto dai metadati modificabili dall’utente.

Il recupero password parte da `/staff/forgot-password` e termina su `/staff/reset-password`. Il `site_url` Auth deve puntare al dominio Production; localhost e Preview Vercel restano soltanto negli URL di redirect aggiuntivi.

## Realtime, affidabilità e sicurezza

- Postgres Changes: categorie, prodotti, extra, tavoli, servizi, ordini, righe
  e print jobs.
- Presence: canale privato `table:<uuid>` con nome dell’operatore.
- RLS: accesso anonimo limitato al menu pubblico; permessi distinti per waiter, cashier e admin.
- Prezzi e descrizioni vengono copiati nelle righe ordine; le modifiche future al menu non alterano lo storico.
- Totali, snapshot e audit sono calcolati nel database.
- Il passaggio `draft → pending_cashier` crea una sola stampa
  `new_order` pending nella stessa transazione;
- `new_order` e `cancellation` hanno una chiave stabile per l’azione originale;
  aggiornamenti e ristampe hanno una chiave stabile per il singolo tentativo
  tracciato. Un doppio click recupera lo stesso job invece di crearne un altro.
- Le pagine operative interrogano `/api/health` all'apertura e ogni 15 secondi.
  Se browser, backend o Supabase non sono affidabili, mantengono visibile
  l'ultimo snapshot ma bloccano tutte le scritture.
- La nuova app non registra un service worker offline e rimuove registrazioni e
  cache della PWA precedente: nessuna comanda può essere accettata soltanto in
  locale.

## Stampa

`POST /api/print-order` legge ordine e righe sul server, genera un ticket RAW
ESC/POS da 80 mm e lo invia a PrintNode. L’API key e l’id stampante non vengono
mai inviati al browser. I job di comanda, aggiornamento, annullamento e ristampa
mantengono `copies = 3` come vincolo e metadato nel database. La modalità scelta
in amministrazione determina però il payload reale:

- `department_split` (predefinita): un solo payload PrintNode contiene tre fogli
  separati, **Pizzeria**, **Cucina** e **Completa / Cassa**, quindi PrintNode usa
  quantità `1`;
- `legacy_three_copies`: PrintNode riceve il ticket completo con quantità `3`,
  producendo tre copie identiche.

Scontrini e riepiloghi di fine servizio usano sempre una sola copia. Le prove
di stampa dall'amministrazione usano la modalità selezionata senza modificare
ordini reali.

La cassa offre:

- apertura di pranzo/cena e chiusura sicura o forzata del servizio;
- stato PrintNode, stampante e computer Dell;
- lista completa dei job operativi pending, printing e failed, senza limite
  globale; lo storico è caricato separatamente;
- preview da 80 mm con il numero di copie salvato nel job;
- ticket distinti per nuovo ordine, aggiornamento, annullamento e ristampa;
- etichetta `RISTAMPA` sulle ristampe;
- badge `In attesa`, `In stampa`, `Stampata`, `Errore` e `Da verificare`;
- conferma manuale auditata per singolo job o per tutte le stampe del tavolo;
- retry esplicito con avviso doppione, motivo, operatore e tentativo collegato;
- dettagli tecnici separati dal messaggio operativo mostrato allo staff.
- avviso persistente e ristampa esplicita se il riepilogo di fine servizio non
  è stato consegnato con certezza.

Il client PrintNode deve essere installato e connesso sul Dell e la stampante
termica deve accettare job RAW ESC/POS. Se PrintNode, Dell o stampante non sono
disponibili, il job resta operativo e stampabile manualmente dalla cassa.
Se PrintNode accetta il job ma il database o la rete non confermano
l’aggiornamento, il job resta `printing` e passa a `Da verificare`: non viene
ristampato automaticamente. Lo stato `done` di PrintNode significa che il job è
stato consegnato alla coda del sistema operativo, non che il foglio sia
fisicamente uscito; per questo la cassa mantiene sempre la conferma manuale.

`POST /api/close-table` crea prima un job `receipt` persistente e solo dopo tenta
la stampa. Il job usa claim atomico, chiave idempotente stabile, recupero tramite
`source`, riconciliazione PrintNode e retry collegati. Il tavolo rimane aperto
finché lo scontrino non è `printed`; il fallback browser richiede una conferma
manuale auditata che conferma lo scontrino e chiude l’ordine nella stessa
transazione.

La chiusura servizio prova prima la modalità sicura. Sono blocchi le bozze, le
comande senza `new_order` stampato e i job `pending`, `printing`, `failed` o da
verificare. I job `printing` o `uncertain` bloccano anche la modalità forzata.
La forzatura richiede conferma rafforzata e motivazione persistita; può
annullare soltanto job `pending` o `failed` mai consegnati, e non modifica
localmente job che PrintNode potrebbe avere accettato.

Alla chiusura, `POST /api/close-service` salva una sola riga in
`service_close_reports`, calcola tavoli serviti, coperti, asporti e totali dallo
snapshot degli ordini chiusi, quindi invia un report RAW ESC/POS da una copia.
Il report è idempotente; un errore o un esito incerto resta visibile in cassa e
la ristampa richiede una nuova azione esplicita.

## Verifiche

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

I test unitari e delle route API sono eseguiti da Vitest; Playwright verifica
menu pubblico, accesso staff e recupero password su profili mobile e tablet. È
possibile puntare gli E2E a un server già avviato con `PLAYWRIGHT_BASE_URL`.

I test database pgTAP sono in `supabase/tests`. La workflow
`.github/workflows/database-tests.yml` avvia uno stack Supabase isolato, esegue
il lint SQL e pgTAP per ogni pull request che modifica `supabase/**`. La workflow
`.github/workflows/application-tests.yml` esegue installazione pulita, lint,
typecheck, Vitest, build ed E2E per ogni pull request.

Prima del commit eseguire anche:

```bash
git diff --check
```

## Vercel

1. importare la repository in Vercel;
2. configurare `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SECRET_KEY`, `PRINTNODE_API_KEY` e `PRINTNODE_PRINTER_ID`;
3. collegare allo stesso progetto i sottodomini menu e applicazione;
4. configurare `NEXT_PUBLIC_MENU_ORIGIN` e `NEXT_PUBLIC_APP_ORIGIN`;
5. impostare in Supabase **Authentication → URL Configuration** il sottodominio applicazione;
6. aggiungere il sottodominio applicazione agli URL di redirect consentiti;
7. distribuire con il preset Next.js.

La secret key Supabase deve restare server-side. La sessione dell’operatore
continua a governare autorizzazioni e richieste; la secret key attesta claim,
invio e riconciliazione dei job PrintNode e persistenza dei riepiloghi soltanto
dopo i controlli della route.

Le migration che cambiano le RPC di stampa e il relativo deploy applicativo
devono essere promossi insieme, in assenza di job `printing`: prima si configura
la secret key, quindi si applica la migration e si promuove immediatamente il
build corrispondente. Versioni applicative e firme RPC non allineate bloccano
intenzionalmente l’invio alla stampante.

## App precedente

La PWA statica originale è conservata nella cartella `legacy/` come riferimento.
La nuova app espone il manifest installabile, ma non registra il vecchio service
worker né una cache offline: ordini, menu e autorizzazioni devono sempre
provenire da Supabase.
