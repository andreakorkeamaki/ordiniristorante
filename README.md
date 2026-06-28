# La Sagretta

Web app mobile-first per menu QR, comande staff, cassa e amministrazione. Next.js App Router e Supabase mantengono menu, ordini e stati sincronizzati fra telefoni, tablet e PC anche su reti diverse.

## Funzioni

- `/menu`: menu pubblico di sola lettura, ricerca, allergeni e predisposizione IT/EN.
- `/staff`: accesso email/password.
- `/staff/tables`: 31 tavoli e stato aggiornato in tempo reale.
- `/staff/table/[id]`: comanda granulare, coperti, note, extra, Presence e invio alla cassa.
- `/cassa`: coda realtime, conferma, preview ticket 80 mm, stampa browser e chiusura tavolo.
- `/admin`: menu, disponibilità, extra, tavoli e impostazioni.

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
```

La publishable key è progettata per il client ed è protetta da RLS. Non aggiungere mai secret key o `service_role` a variabili `NEXT_PUBLIC_*`.

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

## Realtime e sicurezza

- Postgres Changes: categorie, prodotti, extra, tavoli, ordini, righe e print jobs.
- Presence: canale privato `table:<uuid>` con nome dell’operatore.
- RLS: accesso anonimo limitato al menu pubblico; permessi distinti per waiter, cashier e admin.
- Prezzi e descrizioni vengono copiati nelle righe ordine; le modifiche future al menu non alterano lo storico.
- Totali, snapshot e audit sono calcolati nel database.
- `send_order_to_cashier` aggiorna ordine e print job nella stessa transazione.

## Stampa

`src/lib/print-adapter.ts` espone `PrintAdapter`. L’implementazione iniziale restituisce `not_configured`: non simula una stampante.

La cassa offre:

- preview da 80 mm;
- tre copie PIZZERIA, CUCINA e CASSA;
- fallback “Stampa dal browser”;
- cambio stato solo tramite “Segna stampato”.

Per collegare in futuro tablet Android e stampante termica, creare una nuova implementazione di `PrintAdapter` e sostituire `unconfiguredPrintAdapter`.

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
2. configurare `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`;
3. impostare in Supabase **Authentication → URL Configuration** il dominio Vercel;
4. distribuire con il preset Next.js.

Non è necessario configurare una secret key su Vercel per le funzioni attuali.

## App precedente

La PWA statica originale è conservata nella cartella `legacy/` come riferimento. La vecchia cache service worker non viene registrata nella nuova app perché ordini e menu devono provenire da Supabase.
