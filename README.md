# La Sagretta

Web app mobile-first per menu QR, comande staff, cassa e amministrazione. Next.js App Router e Supabase mantengono menu, ordini e stati sincronizzati fra telefoni, tablet e PC anche su reti diverse.

## Funzioni

- `/menu`: menu pubblico di sola lettura, ricerca, allergeni e predisposizione IT/EN.
- `/staff`: accesso email/password e recupero credenziali.
- `/staff/tables`: tavoli e asporti aggiornati in tempo reale.
- `/staff/table/[id]`: comanda granulare, coperti, note, extra, Presence e invio alla cassa.
- `/staff/order/[id]`: comanda asporto con nome cliente e ora di ritiro.
- `/cassa`: coda realtime, preview ticket 80 mm, stampa browser e chiusura ordine.
- `/admin`: menu, disponibilità, extra, tavoli e impostazioni del locale.

Supabase è l’unica fonte di verità. Il browser non salva menu o comande in `localStorage`.

## Requisiti

- Node.js 20.9 o successivo
- npm
- Supabase CLI
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
`SUPABASE_SECRET_KEY` è usata soltanto dalle route server per registrare gli
esiti verificati con PrintNode. Non aggiungere mai secret key o `service_role`
a variabili `NEXT_PUBLIC_*`.
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

La migration crea schema, trigger, RPC, indici, RLS e publication Realtime. Il seed importa fedelmente il menu della PWA originale:

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

## Realtime e sicurezza

- Postgres Changes: categorie, prodotti, extra, tavoli, ordini, righe e print jobs.
- Presence: canale privato `table:<uuid>` con nome dell’operatore.
- RLS: accesso anonimo limitato al menu pubblico; permessi distinti per waiter, cashier e admin.
- Prezzi e descrizioni vengono copiati nelle righe ordine; le modifiche future al menu non alterano lo storico.
- Totali, snapshot e audit sono calcolati nel database.
- il passaggio `draft → pending_cashier` (submitted) crea una sola stampa
  `new_order` pending nella stessa transazione;
- `new_order` e `cancellation` hanno una chiave stabile per l’azione originale;
  aggiornamenti e ristampe hanno una chiave stabile per il singolo tentativo
  tracciato. Un doppio click recupera lo stesso job invece di crearne un altro.

## Stampa

`POST /api/print-order` legge ordine e righe sul server, genera un ticket RAW
ESC/POS da 80 mm e lo invia a PrintNode. L’API key e l’id stampante non vengono
mai inviati al browser. Ogni comanda, aggiornamento, annullamento o ristampa usa
sempre `copies = 3` sia nel database sia nel payload PrintNode. Lo scontrino usa
sempre `copies = 1`; questi valori sono vincoli database e non impostazioni UI.

La cassa offre:

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

La chiusura servizio prova prima la modalità sicura. Ordini aperti e job
operativi vengono conteggiati; job `printing` o `uncertain` bloccano anche la
modalità forzata. La forzatura richiede conferma rafforzata e motivazione
persistita, e non annulla localmente job che PrintNode potrebbe avere accettato.

## Verifiche

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

I test database pgTAP sono in `supabase/tests`.

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
continua a governare autorizzazioni e richieste; la secret key attesta soltanto
claim, invio e riconciliazione dei job PrintNode dopo i controlli della route.

Le migration che cambiano le RPC di stampa e il relativo deploy applicativo
devono essere promossi insieme, in assenza di job `printing`: prima si configura
la secret key, quindi si applica la migration e si promuove immediatamente il
build corrispondente. Versioni applicative e firme RPC non allineate bloccano
intenzionalmente l’invio alla stampante.

## App precedente

La PWA statica originale è conservata nella cartella `legacy/` come riferimento. La vecchia cache service worker non viene registrata nella nuova app perché ordini e menu devono provenire da Supabase.
