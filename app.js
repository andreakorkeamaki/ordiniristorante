"use strict";

// MENU: modifica qui nomi, prezzi, ingredienti e categorie.
const MENU = [
  {
    id: "antipasti",
    name: "Antipasti e fritti",
    shortName: "Antipasti",
    products: [
      { id: "tris-bruschette", name: "Tris di bruschette miste", price: 5 },
      { id: "tagliere-sagretta", name: "Tagliere La Sagretta", price: 12 },
      {
        id: "tagliere-xl",
        name: "Tagliere XL",
        price: 20,
        description: "Mix di salumi, formaggi e bruschette",
      },
      { id: "hummus", name: "Hummus con pane bruscato", price: 9 },
      { id: "mix-formaggi", name: "Mix di formaggi", price: 10 },
      { id: "suppli", name: "Supplì artigianale", price: 2.5, description: "Al pezzo" },
      {
        id: "crocchette-napoletana",
        name: "Crocchette alla napoletana",
        price: 2.5,
        description: "Al pezzo",
      },
      { id: "olive-ascolane", name: "Olive ascolane", price: 5, description: "6 pezzi" },
      {
        id: "crocchette-cacio-pepe",
        name: "Crocchette cacio e pepe",
        price: 5,
        description: "4 pezzi",
      },
      {
        id: "mozzarelline",
        name: "Mozzarelline panate",
        price: 5,
        description: "6 pezzi",
      },
      {
        id: "triangoli-cheddar",
        name: "Triangoli di cheddar e nacho",
        price: 5,
        description: "5 pezzi",
        soldOut: true,
      },
      {
        id: "crocchette-jalapenos",
        name: "Crocchette di jalapeños e cheddar",
        price: 5,
        description: "5 pezzi",
      },
      { id: "patatine", name: "Patatine fritte", price: 5 },
      {
        id: "patatine-dolci",
        name: "Patatine dolci fritte",
        price: 5,
        soldOut: true,
      },
    ],
  },
  {
    id: "bianche",
    name: "Pinse bianche",
    shortName: "Bianche",
    products: [
      { id: "focaccia", name: "Focaccia", price: 6, description: "Olio, sale" },
      {
        id: "focaccia-crudo",
        name: "Focaccia + Crudo",
        price: 8,
        description: "Olio, sale, prosciutto crudo",
      },
      {
        id: "crostino",
        name: "Crostino",
        price: 8,
        description: "Mozzarella, prosciutto cotto, olio evo",
      },
      {
        id: "patate-salsiccia",
        name: "Patate e Salsiccia",
        price: 9,
        description: "Patate, salsiccia, mozzarella, olio evo",
      },
      {
        id: "cotto-patate",
        name: "Cotto e Patate",
        price: 9,
        description: "Mozzarella, prosciutto cotto, patate",
      },
      {
        id: "boscaiola",
        name: "Boscaiola",
        price: 9,
        description: "Mozzarella, salsiccia, funghi, olio evo",
      },
      {
        id: "quattro-formaggi",
        name: "Quattro Formaggi",
        price: 9,
        description: "Mix di quattro formaggi, gorgonzola",
      },
      {
        id: "speck-provola",
        name: "Speck e Provola",
        price: 9,
        description: "Mozzarella, speck, provola",
      },
      {
        id: "broccoli-salsiccia",
        name: "Broccoli e Salsiccia",
        price: 9,
        description: "Mozzarella, broccoli, salsiccia",
      },
      {
        id: "tonno-cipolla",
        name: "Tonno e Cipolla",
        price: 8,
        description: "Mozzarella, tonno, cipolla, olive",
      },
      {
        id: "gamberetti-zucchine",
        name: "Gamberetti e Zucchine",
        price: 10,
        description: "Mozzarella, gamberetti, zucchine",
      },
    ],
  },
  {
    id: "rosse",
    name: "Pinse rosse",
    shortName: "Rosse",
    products: [
      {
        id: "marinara",
        name: "Marinara",
        price: 6,
        description: "Pomodoro, aglio, origano, olio evo",
      },
      {
        id: "margherita",
        name: "Margherita",
        price: 7.5,
        description: "Pomodoro, mozzarella, basilico",
      },
      {
        id: "diavola",
        name: "Diavola",
        price: 9,
        description: "Pomodoro, mozzarella, salame piccante",
      },
      {
        id: "napoli",
        name: "Napoli",
        price: 8,
        description: "Pomodoro, mozzarella, capperi, olive, basilico, origano",
      },
      {
        id: "quattro-stagioni",
        name: "Quattro Stagioni",
        price: 10.5,
        description: "Pomodoro, mozzarella, prosciutto, funghi, carciofini, olive",
      },
      {
        id: "verdure-grigliate",
        name: "Verdure Grigliate",
        price: 8.5,
        description: "Pomodoro, verdure grigliate miste, mozzarella",
      },
      {
        id: "gorgonzola-diavola",
        name: "Gorgonzola e Diavola Rossa",
        price: 9,
        description: "Pomodoro, gorgonzola, salame piccante, mozzarella",
      },
      {
        id: "wurstel-patatine",
        name: "Würstel e Patatine",
        price: 9,
        description: "Pomodoro, würstel di pollo e tacchino, patatine fritte, mozzarella",
      },
    ],
  },
  {
    id: "speciali",
    name: "Pinse speciali",
    shortName: "Speciali",
    products: [
      {
        id: "crudo-rucola-pachino-bufala",
        name: "Crudo, Rucola, Pachino, Bufala",
        price: 12,
        description: "Mozzarella di bufala DOP, prosciutto crudo, rucola, pomodorini",
      },
      {
        id: "bresaola-rucola-grana",
        name: "Bresaola, Rucola, Grana",
        price: 12,
        description: "Mozzarella, bresaola IGP, rucola, grana stagionato 12 mesi, olio evo",
      },
      {
        id: "melanzane-bufala-pachino",
        name: "Melanzane, Bufala, Pachino, Basilico",
        price: 12,
        description: "Mozzarella di bufala DOP, melanzane grigliate, pachino, basilico fresco",
      },
      {
        id: "gorgonzola-pere-noci",
        name: "Gorgonzola, Pere, Noci",
        price: 13,
        description: "Mozzarella, gorgonzola DOP, pere, noci",
      },
      {
        id: "la-regina",
        name: "La Regina",
        price: 13,
        description:
          "Pomodoro, mozzarella di bufala DOP, pomodorini, prosciutto crudo, basilico fresco",
      },
      {
        id: "amatriciana",
        name: "Amatriciana",
        price: 13,
        description:
          "Pomodoro, pecorino romano, guanciale croccante di Amatrice, basilico fresco",
      },
      {
        id: "zucchine-guanciale-stracciatella",
        name: "Zucchine, Guanciale e Stracciatella",
        price: 13,
        description: "Zucchine, guanciale, stracciatella",
      },
      {
        id: "gamberetti-salsa-rosa",
        name: "Gamberetti, Insalata, Pomodoro, Salsa Rosa e Stracciatella",
        price: 13,
        description:
          "Pomodoro, salsa rosa, gamberetti, insalata iceberg, stracciatella di burrata",
      },
      {
        id: "insalata-pomodorini-tonno-bufala-mayo",
        name: "Insalata, Pomodorini, Tonno, Bufala, Mayo",
        price: 11,
        description: "Tonno, bufala DOP, pomodorini, insalata iceberg, maionese",
      },
      {
        id: "rucola-pomodorini-bufala-salmone",
        name: "Rucola, Pomodorini, Bufala, Salmone",
        price: 13,
        description: "Salmone affumicato, bufala DOP, pomodorini, rucola",
      },
      {
        id: "cubetti-melanzana-fritta-pomodorini-bufala",
        name: "Cubetti di Melanzana Fritta, Pomodorini e Bufala",
        price: 12,
        description: "Bufala DOP, melanzane fritte a cubetti, pomodorini",
      },
    ],
  },
  {
    id: "all-you-can-eat",
    name: "Formula All You Can Eat",
    shortName: "All You Can Eat",
    description:
      "Da effettuare per tutto il tavolo. Include: antipastino misto della casa, pinsa romana non stop servita al tavolo a scelta dello chef, patatine fritte e pinsa con la Nutella.",
    products: [
      {
        id: "all-you-can-eat-adulti",
        name: "All You Can Eat · Adulti",
        price: 16.9,
        description: "Prezzo per persona",
      },
      {
        id: "all-you-can-eat-bambini",
        name: "All You Can Eat · Bambini",
        price: 12.9,
        description: "Prezzo per persona",
      },
    ],
  },
  {
    id: "sapori-mare",
    name: "I Sapori di Mare",
    shortName: "Mare",
    products: [
      { id: "antipasto-mare-casa", name: "Antipasto di mare della casa", price: 15 },
      { id: "tris-mare", name: "Tris di mare", price: 15 },
      {
        id: "frittura-calamari-gamberi-piccola",
        name: "Frittura calamari e gamberi piccola",
        price: 9.9,
      },
      {
        id: "frittura-calamari-gamberi-grande",
        name: "Frittura calamari e gamberi grande",
        price: 16.9,
      },
      {
        id: "grigliata-mare",
        name: "Grigliata di mare",
        price: 23,
        description: "Non sempre disponibile",
      },
    ],
  },
  {
    id: "bimbi",
    name: "Per i più piccoli e non solo",
    shortName: "Bimbi",
    products: [
      { id: "cotoletta-patatine", name: "Cotoletta e patatine", price: 12 },
      { id: "hamburger-patatine", name: "Hamburger e patatine", price: 12 },
      { id: "pasta-ragu-bimbi", name: "Pasta al ragù bimbi", price: 7 },
    ],
  },
  {
    id: "dolci",
    name: "Dolci",
    shortName: "Dolci",
    products: [
      { id: "tiramisu", name: "Tiramisù fatto in casa", price: 5 },
      {
        id: "panna-cotta-frutti-bosco",
        name: "Panna cotta · Frutti di bosco",
        price: 5,
      },
      {
        id: "panna-cotta-nutella",
        name: "Panna cotta · Nutella",
        price: 5,
      },
      {
        id: "panna-cotta-nutella-rum",
        name: "Panna cotta · Nutella e rum",
        price: 5,
      },
      {
        id: "panna-cotta-caramello",
        name: "Panna cotta · Caramello",
        price: 5,
      },
      {
        id: "cheesecake-frutti-bosco",
        name: "Cheesecake · Frutti di bosco",
        price: 5,
      },
      {
        id: "cheesecake-nutella",
        name: "Cheesecake · Nutella",
        price: 5,
      },
      {
        id: "cheesecake-nutella-rum",
        name: "Cheesecake · Nutella e rum",
        price: 5,
      },
      {
        id: "cheesecake-caramello",
        name: "Cheesecake · Caramello",
        price: 5,
      },
      {
        id: "mattoncino",
        name: "Mattoncino · Yogurt, panna e pinoli",
        price: 5,
      },
      { id: "tartufo-bianco", name: "Tartufo bianco", price: 5, soldOut: true },
      { id: "tartufo-nero", name: "Tartufo nero", price: 5 },
      { id: "tartufo-pistacchio", name: "Tartufo pistacchio", price: 5 },
      { id: "macedonia", name: "Macedonia", price: 5 },
      { id: "dolce-giorno", name: "Dolce del giorno", price: 5 },
      {
        id: "pinsa-nutella",
        name: "Pinsa con la Nutella",
        price: 10,
        description: "Consigliata per 4-6 persone",
      },
    ],
  },
  {
    id: "bevande",
    name: "Bevande",
    shortName: "Bevande",
    products: [
      { id: "acqua-naturale", name: "Acqua naturale", price: 2 },
      { id: "acqua-frizzante", name: "Acqua frizzante", price: 2 },
      { id: "coca-cola", name: "Coca-Cola", price: 3 },
      { id: "coca-cola-zero", name: "Coca-Cola Zero", price: 3 },
      { id: "fanta", name: "Fanta", price: 3 },
      { id: "birra-piccola", name: "Birra piccola", price: 4 },
      { id: "birra-media", name: "Birra media", price: 6 },
      { id: "calice-vino", name: "Calice di vino", price: 5 },
      { id: "caffe", name: "Caffè", price: 1.5 },
    ],
  },
  {
    id: "extra",
    name: "Extra e modifiche",
    shortName: "Extra",
    products: [
      { id: "aggiunta-1", name: "Aggiunta da €1", price: 1 },
      { id: "aggiunta-2", name: "Aggiunta da €2", price: 2 },
    ],
  },
];

const COVER_PRICE = 1.9;
const TABLE_COUNT = 31;
const STORAGE_KEY = "la-sagretta-orders-v1";
const PINSA_CATEGORIES = new Set(["bianche", "rosse", "speciali"]);
const QUICK_NOTES = [
  "Senza mozzarella",
  "Senza cipolla",
  "Ben cotta",
  "Poco cotta",
  "Senza glutine",
  "Allergia",
  "Da dividere",
  "Aggiungi ingrediente",
];

const app = document.querySelector("#app");
const readyCount = document.querySelector("#ready-count");
const toast = document.querySelector("#toast");
const confirmDialog = document.querySelector("#confirm-dialog");
const confirmTitle = document.querySelector("#confirm-title");
const confirmMessage = document.querySelector("#confirm-message");
const confirmButton = document.querySelector("#confirm-button");

let state = loadState();
let view = { name: "tables", tableId: null, categoryId: MENU[0].id };
let pendingConfirmation = null;
let toastTimer = null;

function createEmptyOrder(tableId) {
  return {
    tableId,
    covers: 0,
    status: "free",
    items: [],
    generalNote: "",
    updatedAt: null,
  };
}

function createInitialState() {
  return {
    tables: Object.fromEntries(
      Array.from({ length: TABLE_COUNT }, (_, index) => {
        const tableId = index + 1;
        return [tableId, createEmptyOrder(tableId)];
      }),
    ),
  };
}

function loadState() {
  const fallback = createInitialState();

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved.tables !== "object") return fallback;

    for (let tableId = 1; tableId <= TABLE_COUNT; tableId += 1) {
      const order = saved.tables[tableId];
      if (!order) continue;
      fallback.tables[tableId] = {
        ...createEmptyOrder(tableId),
        ...order,
        tableId,
        items: Array.isArray(order.items) ? order.items : [],
      };
    }
  } catch (error) {
    console.warn("Impossibile leggere gli ordini salvati.", error);
  }

  return fallback;
}

function saveState({ touchTableId = null } = {}) {
  if (touchTableId) {
    const order = state.tables[touchTableId];
    order.updatedAt = new Date().toISOString();
    if (order.status === "free" && hasOrderContent(order)) order.status = "in-progress";
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    showToast("Salvataggio non riuscito: memoria del browser non disponibile.");
    console.error(error);
  }

  updateReadyCount();
}

function hasOrderContent(order) {
  return order.items.length > 0 || order.covers > 0 || order.generalNote.trim() !== "";
}

function getTotals(order) {
  const subtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cover = order.covers * COVER_PRICE;
  return { subtotal, cover, total: subtotal + cover };
}

function getAllYouCanEatStatus(order) {
  const quantity = order.items
    .filter((item) => !item.parentItemId && item.categoryId === "all-you-can-eat")
    .reduce((sum, item) => sum + item.quantity, 0);
  const active = quantity > 0;

  return {
    active,
    quantity,
    valid: !active || (order.covers > 0 && quantity === order.covers),
  };
}

function getAllYouCanEatWarning(order, status) {
  if (!status.active || status.valid) return "";
  if (order.covers === 0) return "imposta prima il numero di coperti.";

  if (status.quantity < order.covers) {
    const missing = order.covers - status.quantity;
    return missing === 1
      ? "manca 1 formula per coprire tutti i coperti."
      : `mancano ${missing} formule per coprire tutti i coperti.`;
  }

  const extra = status.quantity - order.covers;
  return extra === 1
    ? "c’è 1 formula in più rispetto ai coperti."
    : `ci sono ${extra} formule in più rispetto ai coperti.`;
}

function formatPrice(value) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function formatTime(isoDate) {
  if (!isoDate) return "Non ancora salvato";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoDate));
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2200);
}

function updateReadyCount() {
  const count = Object.values(state.tables).filter((order) => order.status === "ready").length;
  readyCount.textContent = count;
}

function setActiveNav(name) {
  document.querySelectorAll(".nav-button").forEach((button) => {
    const isReady = button.dataset.action === "show-ready";
    button.classList.toggle("active", (name === "ready") === isReady);
  });
}

function render() {
  updateReadyCount();
  setActiveNav(view.name);

  if (view.name === "order") {
    renderOrder(view.tableId);
  } else if (view.name === "ready") {
    renderReadyOrders();
  } else {
    renderTables();
  }

  app.focus({ preventScroll: true });
}

function renderTables() {
  view = { ...view, name: "tables", tableId: null };
  const cards = Object.values(state.tables)
    .map((order) => {
      const totals = getTotals(order);
      const statusClass =
        order.status === "ready" ? "ready" : order.status === "in-progress" ? "in-progress" : "";
      const statusLabel =
        order.status === "ready"
          ? "Pronto per la cassa"
          : order.status === "in-progress"
            ? "Ordine in corso"
            : "Libero";
      const pillClass =
        order.status === "ready"
          ? "status-ready"
          : order.status === "in-progress"
            ? "status-progress"
            : "status-free";
      const covers = order.covers
        ? `${order.covers} ${order.covers === 1 ? "coperto" : "coperti"}`
        : "Nessun coperto";
      const total = hasOrderContent(order) ? formatPrice(totals.total) : "—";

      return `
        <button class="table-card ${statusClass}" type="button" data-action="open-table" data-table-id="${order.tableId}">
          <span class="table-number">Tavolo ${order.tableId}</span>
          <span class="table-meta">${covers}</span>
          <span class="table-total">${total}</span>
          <span class="status-pill ${pillClass}">${statusLabel}</span>
        </button>
      `;
    })
    .join("");

  app.innerHTML = `
    <section class="page-heading">
      <h1>Tavoli</h1>
      <p>Tocca un tavolo per aprire o modificare la comanda.</p>
      <div class="legend" aria-label="Legenda stati">
        <span class="legend-item"><span class="legend-dot dot-free"></span>Libero</span>
        <span class="legend-item"><span class="legend-dot dot-progress"></span>In corso</span>
        <span class="legend-item"><span class="legend-dot dot-ready"></span>Pronto</span>
      </div>
    </section>
    <section class="tables-grid" aria-label="Elenco tavoli">${cards}</section>
  `;
}

function renderOrder(tableId, { preserveScroll = false } = {}) {
  const previousScroll = preserveScroll ? window.scrollY : 0;
  const order = state.tables[tableId];
  if (!order) {
    renderTables();
    return;
  }

  view = { ...view, name: "order", tableId };
  const category = MENU.find((entry) => entry.id === view.categoryId) || MENU[0];
  const totals = getTotals(order);
  const allYouCanEat = getAllYouCanEatStatus(order);
  const mainItems = order.items.filter((item) => !item.parentItemId);
  const totalQuantity = mainItems.reduce((sum, item) => sum + item.quantity, 0);

  const tabs = MENU.map(
    (entry) => `
      <button
        class="category-tab ${entry.id === category.id ? "active" : ""}"
        type="button"
        data-action="select-category"
        data-category-id="${entry.id}"
      >${escapeHtml(entry.shortName)}</button>
    `,
  ).join("");

  const statusLabel =
    order.status === "ready"
      ? "Pronto per la cassa"
      : order.status === "in-progress"
        ? "Ordine in corso"
        : "Libero";
  const statusClass =
    order.status === "ready"
      ? "status-ready"
      : order.status === "in-progress"
        ? "status-progress"
        : "status-free";

  app.innerHTML = `
    <section class="order-top">
      <button class="back-button" type="button" data-action="show-tables">← Tutti i tavoli</button>
      <div class="order-title-row">
        <h1>Tavolo ${tableId}</h1>
        <span class="status-pill ${statusClass}">${statusLabel}</span>
      </div>
      <div class="covers-control">
        <label for="covers">Coperti</label>
        <div class="stepper">
          <button type="button" data-action="covers-minus" aria-label="Riduci coperti">−</button>
          <input id="covers" inputmode="numeric" min="0" max="99" type="number" value="${order.covers}" data-action="covers-input" />
          <button type="button" data-action="covers-plus" aria-label="Aumenta coperti">+</button>
        </div>
      </div>
    </section>

    <nav class="category-tabs" aria-label="Categorie menu">${tabs}</nav>
    ${renderMenuCategory(category, order)}

    <section class="order-panel">
      <div class="order-panel-header">
        <h2 class="section-title">Comanda</h2>
        <span class="item-count">${totalQuantity} ${totalQuantity === 1 ? "prodotto" : "prodotti"}</span>
      </div>
      <div class="order-list">
        ${mainItems.length ? mainItems.map((item) => renderOrderItem(item, order)).join("") : '<div class="empty-order">La comanda è vuota.<br />Tocca un prodotto per aggiungerlo.</div>'}
      </div>

      ${
        allYouCanEat.active && !allYouCanEat.valid
          ? `<div class="ready-general-note"><strong>Formula per tutto il tavolo:</strong> ${getAllYouCanEatWarning(order, allYouCanEat)}</div>`
          : ""
      }

      <label class="field-label general-note">
        Nota generale dell’ordine
        <textarea class="note-input" data-action="general-note" placeholder="Es. portare tutto insieme…">${escapeHtml(order.generalNote)}</textarea>
      </label>

      <div class="totals">
        <div class="total-row"><span>Subtotale</span><strong>${formatPrice(totals.subtotal)}</strong></div>
        <div class="total-row"><span>Coperto (${order.covers} × ${formatPrice(COVER_PRICE)})</span><strong>${formatPrice(totals.cover)}</strong></div>
        <div class="total-row final"><span>Totale</span><strong>${formatPrice(totals.total)}</strong></div>
      </div>

      <div class="order-actions">
        <button class="button button-primary" type="button" data-action="save-order">Salva ordine</button>
        <button class="button button-ready" type="button" data-action="mark-ready" ${mainItems.length && allYouCanEat.valid ? "" : "disabled"}>Segna pronto per cassa</button>
        <button class="button button-danger" type="button" data-action="clear-table" ${hasOrderContent(order) ? "" : "disabled"}>Svuota tavolo</button>
      </div>
    </section>
  `;

  if (preserveScroll) window.scrollTo(0, previousScroll);
}

function renderMenuCategory(category, order) {
  if (category.id === "extra") {
    const pinse = order.items.filter(
      (item) => !item.parentItemId && PINSA_CATEGORIES.has(item.categoryId),
    );

    return `
      <section class="menu-section">
        <h2 class="section-title">Aggiunte ingredienti</h2>
        <div class="extra-box">
          <label class="field-label">
            Associa l’aggiunta a una pinsa
            <select id="extra-parent" ${pinse.length ? "" : "disabled"}>
              ${
                pinse.length
                  ? pinse
                      .map(
                        (item) =>
                          `<option value="${item.lineId}">${escapeHtml(item.name)}${item.quantity > 1 ? ` (riga ×${item.quantity})` : ""}</option>`,
                      )
                      .join("")
                  : '<option>Nessuna pinsa nella comanda</option>'
              }
            </select>
          </label>
          <div class="products-grid">
            ${category.products
              .map(
                (product) => `
                  <button
                    class="product-button"
                    type="button"
                    data-action="add-extra"
                    data-product-id="${product.id}"
                    ${pinse.length ? "" : "disabled"}
                  >
                    <span class="product-name">${escapeHtml(product.name)}</span>
                    <span class="product-price">+ ${formatPrice(product.price)}</span>
                  </button>
                `,
              )
              .join("")}
          </div>
          ${pinse.length ? "" : '<p class="table-meta">Aggiungi prima una pinsa bianca, rossa o speciale.</p>'}
        </div>
      </section>
    `;
  }

  return `
    <section class="menu-section">
      <h2 class="section-title">${escapeHtml(category.name)}</h2>
      ${category.description ? `<div class="ready-general-note">${escapeHtml(category.description)}</div>` : ""}
      <div class="products-grid">
        ${category.products
          .map(
            (product) => `
              <button
                class="product-button"
                type="button"
                data-action="add-product"
                data-product-id="${product.id}"
                data-category-id="${category.id}"
                ${product.soldOut ? "disabled" : ""}
              >
                <span class="product-name">${escapeHtml(product.name)}</span>
                <span class="product-price">${product.soldOut ? "Esaurito" : formatPrice(product.price)}</span>
                ${product.description ? `<span class="product-description">${escapeHtml(product.description)}</span>` : ""}
              </button>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderOrderItem(item, order) {
  const extras = order.items.filter((extra) => extra.parentItemId === item.lineId);
  const hasNote = item.note && item.note.trim();

  return `
    <article class="order-item">
      <div class="item-main">
        <span class="item-name">${escapeHtml(item.name)}</span>
        <span class="item-line-total">${formatPrice(item.price * item.quantity)}</span>
        <span class="item-unit-price">${formatPrice(item.price)} cad.</span>
      </div>
      <div class="item-actions">
        <button class="icon-button" type="button" data-action="item-minus" data-line-id="${item.lineId}" aria-label="Riduci ${escapeHtml(item.name)}">−</button>
        <span class="quantity">${item.quantity}</span>
        <button class="icon-button" type="button" data-action="item-plus" data-line-id="${item.lineId}" aria-label="Aumenta ${escapeHtml(item.name)}">+</button>
        <button class="icon-button delete-button" type="button" data-action="delete-item" data-line-id="${item.lineId}" aria-label="Elimina ${escapeHtml(item.name)}">×</button>
      </div>
      <button class="note-toggle" type="button" data-action="toggle-note" data-line-id="${item.lineId}">
        ${hasNote ? "Modifica nota" : "+ Aggiungi nota"}
      </button>
      <div class="item-note-wrap" data-note-wrap="${item.lineId}" ${hasNote ? "" : "hidden"}>
        <div class="quick-notes">
          ${QUICK_NOTES.map(
            (note) =>
              `<button class="quick-note" type="button" data-action="quick-note" data-line-id="${item.lineId}" data-note="${escapeHtml(note)}">${escapeHtml(note)}</button>`,
          ).join("")}
        </div>
        <input
          class="note-input"
          type="text"
          value="${escapeHtml(item.note || "")}"
          placeholder="Scrivi una nota…"
          data-action="item-note"
          data-line-id="${item.lineId}"
        />
      </div>
      ${extras.map((extra) => renderExtraItem(extra)).join("")}
    </article>
  `;
}

function renderExtraItem(extra) {
  return `
    <div class="item-extra">
      <div class="item-main">
        <span class="item-name">↳ ${escapeHtml(extra.name)}</span>
        <span class="item-line-total">${formatPrice(extra.price * extra.quantity)}</span>
      </div>
      <div class="item-actions">
        <button class="icon-button" type="button" data-action="item-minus" data-line-id="${extra.lineId}" aria-label="Riduci aggiunta">−</button>
        <span class="quantity">${extra.quantity}</span>
        <button class="icon-button" type="button" data-action="item-plus" data-line-id="${extra.lineId}" aria-label="Aumenta aggiunta">+</button>
        <button class="icon-button delete-button" type="button" data-action="delete-item" data-line-id="${extra.lineId}" aria-label="Elimina aggiunta">×</button>
      </div>
    </div>
  `;
}

function renderReadyOrders() {
  view = { ...view, name: "ready", tableId: null };
  const orders = Object.values(state.tables)
    .filter((order) => order.status === "ready")
    .sort((a, b) => new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0));

  app.innerHTML = `
    <section class="page-heading">
      <h1>Ordini pronti</h1>
      <p>Comande da riscrivere alla cassa, dalla meno recente.</p>
    </section>
    ${
      orders.length
        ? `<section class="ready-list">${orders.map((order) => renderReadyCard(order)).join("")}</section>`
        : `
          <section class="empty-state">
            <span class="empty-state-mark">✓</span>
            <h2>Tutto tranquillo</h2>
            <p>Non ci sono ordini pronti per la cassa.</p>
          </section>
        `
    }
  `;
}

function renderReadyCard(order) {
  const totals = getTotals(order);
  const mainItems = order.items.filter((item) => !item.parentItemId);

  return `
    <article class="ready-card">
      <header class="ready-card-header">
        <h2>Tavolo ${order.tableId}</h2>
        <span class="ready-time">Salvato<br />${formatTime(order.updatedAt)}</span>
      </header>
      <div class="ready-card-body">
        <p class="ready-covers">${order.covers} ${order.covers === 1 ? "coperto" : "coperti"}</p>
        <ul class="ready-items">
          ${mainItems
            .map((item) => {
              const extras = order.items.filter((extra) => extra.parentItemId === item.lineId);
              return `
                <li class="ready-item">
                  <span class="ready-quantity">${item.quantity}×</span>
                  <strong>${escapeHtml(item.name)}</strong>
                  <span>${formatPrice(item.price * item.quantity)}</span>
                  ${item.note ? `<span class="ready-note">Nota: ${escapeHtml(item.note)}</span>` : ""}
                  ${extras
                    .map(
                      (extra) =>
                        `<span class="ready-extra">+ ${extra.quantity}× ${escapeHtml(extra.name)} (${formatPrice(extra.price * extra.quantity)})</span>`,
                    )
                    .join("")}
                </li>
              `;
            })
            .join("")}
        </ul>
        ${order.generalNote ? `<div class="ready-general-note"><strong>Nota ordine:</strong> ${escapeHtml(order.generalNote)}</div>` : ""}
        <div class="totals">
          <div class="total-row"><span>Subtotale</span><strong>${formatPrice(totals.subtotal)}</strong></div>
          <div class="total-row"><span>Coperto</span><strong>${formatPrice(totals.cover)}</strong></div>
          <div class="total-row final"><span>Totale</span><strong>${formatPrice(totals.total)}</strong></div>
        </div>
        <div class="ready-actions">
          <button class="button button-secondary" type="button" data-action="open-table" data-table-id="${order.tableId}">Torna al tavolo</button>
          <button class="button button-danger" type="button" data-action="close-table" data-table-id="${order.tableId}">Segna come chiuso</button>
        </div>
      </div>
    </article>
  `;
}

function addProduct(tableId, categoryId, productId) {
  const order = state.tables[tableId];
  const category = MENU.find((entry) => entry.id === categoryId);
  const product = category?.products.find((entry) => entry.id === productId);
  if (!product) return;

  const existing = order.items.find(
    (item) => !item.parentItemId && item.productId === product.id && !item.note,
  );
  if (existing) {
    existing.quantity += 1;
  } else {
    order.items.push({
      lineId: uid(),
      productId: product.id,
      categoryId,
      name: product.name,
      price: product.price,
      quantity: 1,
      note: "",
      parentItemId: null,
    });
  }

  saveState({ touchTableId: tableId });
  showToast(`${product.name} aggiunto`);
  renderOrder(tableId, { preserveScroll: true });
}

function addExtra(tableId, productId, parentItemId) {
  const order = state.tables[tableId];
  const category = MENU.find((entry) => entry.id === "extra");
  const product = category.products.find((entry) => entry.id === productId);
  const parent = order.items.find((item) => item.lineId === parentItemId);
  if (!product || !parent) return;

  const existing = order.items.find(
    (item) => item.parentItemId === parentItemId && item.productId === productId,
  );
  if (existing) {
    existing.quantity += 1;
  } else {
    order.items.push({
      lineId: uid(),
      productId: product.id,
      categoryId: "extra",
      name: product.name,
      price: product.price,
      quantity: 1,
      note: "",
      parentItemId,
    });
  }

  saveState({ touchTableId: tableId });
  showToast(`${product.name} associata a ${parent.name}`);
  renderOrder(tableId, { preserveScroll: true });
}

function changeQuantity(tableId, lineId, delta) {
  const order = state.tables[tableId];
  const item = order.items.find((entry) => entry.lineId === lineId);
  if (!item) return;

  item.quantity += delta;
  if (item.quantity <= 0) removeItem(order, lineId);
  saveState({ touchTableId: tableId });
  renderOrder(tableId, { preserveScroll: true });
}

function removeItem(order, lineId) {
  order.items = order.items.filter(
    (entry) => entry.lineId !== lineId && entry.parentItemId !== lineId,
  );
}

function clearTable(tableId) {
  state.tables[tableId] = createEmptyOrder(tableId);
  saveState();
}

function askConfirmation({ title, message, confirmLabel, onConfirm }) {
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmButton.textContent = confirmLabel;
  pendingConfirmation = onConfirm;
  confirmDialog.showModal();
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;

  if (action === "show-tables") {
    view.name = "tables";
    render();
    return;
  }

  if (action === "show-ready") {
    view.name = "ready";
    render();
    return;
  }

  if (action === "open-table") {
    view = { ...view, name: "order", tableId: Number(target.dataset.tableId) };
    render();
    return;
  }

  if (action === "select-category") {
    view.categoryId = target.dataset.categoryId;
    renderOrder(view.tableId, { preserveScroll: true });
    document.querySelector(".menu-section")?.scrollIntoView({ block: "start" });
    return;
  }

  if (action === "add-product") {
    addProduct(view.tableId, target.dataset.categoryId, target.dataset.productId);
    return;
  }

  if (action === "add-extra") {
    const parentItemId = document.querySelector("#extra-parent")?.value;
    if (parentItemId) addExtra(view.tableId, target.dataset.productId, parentItemId);
    return;
  }

  if (action === "covers-minus" || action === "covers-plus") {
    const order = state.tables[view.tableId];
    order.covers = Math.max(0, order.covers + (action === "covers-plus" ? 1 : -1));
    saveState({ touchTableId: view.tableId });
    renderOrder(view.tableId, { preserveScroll: true });
    return;
  }

  if (action === "item-minus" || action === "item-plus") {
    changeQuantity(view.tableId, target.dataset.lineId, action === "item-plus" ? 1 : -1);
    return;
  }

  if (action === "delete-item") {
    const order = state.tables[view.tableId];
    removeItem(order, target.dataset.lineId);
    saveState({ touchTableId: view.tableId });
    renderOrder(view.tableId, { preserveScroll: true });
    return;
  }

  if (action === "toggle-note") {
    const wrapper = document.querySelector(`[data-note-wrap="${target.dataset.lineId}"]`);
    wrapper.hidden = !wrapper.hidden;
    if (!wrapper.hidden) wrapper.querySelector("input")?.focus();
    return;
  }

  if (action === "quick-note") {
    const input = document.querySelector(
      `[data-action="item-note"][data-line-id="${target.dataset.lineId}"]`,
    );
    if (!input) return;
    input.value = input.value.trim()
      ? `${input.value.trim()}, ${target.dataset.note}`
      : target.dataset.note;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
    return;
  }

  if (action === "save-order") {
    saveState({ touchTableId: view.tableId });
    showToast("Ordine salvato sul telefono");
    renderOrder(view.tableId, { preserveScroll: true });
    return;
  }

  if (action === "mark-ready") {
    const order = state.tables[view.tableId];
    if (!getAllYouCanEatStatus(order).valid) {
      showToast("La formula All You Can Eat deve comprendere tutti i coperti.");
      return;
    }
    order.status = "ready";
    saveState({ touchTableId: view.tableId });
    showToast(`Tavolo ${view.tableId} pronto per la cassa`);
    view.name = "tables";
    render();
    return;
  }

  if (action === "clear-table") {
    const tableId = view.tableId;
    askConfirmation({
      title: `Svuotare il Tavolo ${tableId}?`,
      message: "La comanda, i coperti e tutte le note verranno cancellati da questo telefono.",
      confirmLabel: "Svuota tavolo",
      onConfirm: () => {
        clearTable(tableId);
        showToast(`Tavolo ${tableId} svuotato`);
        view.name = "tables";
        render();
      },
    });
    return;
  }

  if (action === "close-table") {
    const tableId = Number(target.dataset.tableId);
    askConfirmation({
      title: `Chiudere il Tavolo ${tableId}?`,
      message: "L’ordine verrà considerato trascritto alla cassa e il tavolo sarà svuotato.",
      confirmLabel: "Segna come chiuso",
      onConfirm: () => {
        clearTable(tableId);
        showToast(`Tavolo ${tableId} chiuso`);
        renderReadyOrders();
      },
    });
  }
});

document.addEventListener("input", (event) => {
  const target = event.target;
  const action = target.dataset.action;
  if (!action || view.name !== "order") return;

  const order = state.tables[view.tableId];

  if (action === "covers-input") {
    const value = Number.parseInt(target.value, 10);
    order.covers = Number.isFinite(value) ? Math.min(99, Math.max(0, value)) : 0;
    saveState({ touchTableId: view.tableId });
    return;
  }

  if (action === "item-note") {
    const item = order.items.find((entry) => entry.lineId === target.dataset.lineId);
    if (!item) return;
    item.note = target.value;
    saveState({ touchTableId: view.tableId });
    return;
  }

  if (action === "general-note") {
    order.generalNote = target.value;
    saveState({ touchTableId: view.tableId });
  }
});

document.addEventListener("change", (event) => {
  if (event.target.dataset.action === "covers-input" && view.name === "order") {
    renderOrder(view.tableId, { preserveScroll: true });
  }
});

confirmDialog.addEventListener("close", () => {
  if (confirmDialog.returnValue === "confirm" && pendingConfirmation) {
    pendingConfirmation();
  }
  pendingConfirmation = null;
});

window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY) {
    state = loadState();
    render();
  }
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("Service worker non registrato.", error);
    });
  });
}

render();
