'use strict';

const API_BASE_URL = 'https://api.pokemontcg.io/v2';
const FEATURED_SET_LIMIT = 18;
const MAX_SCAN_RESULTS = 10;
const LEGACY_STORAGE_KEYS = {
  collection: 'pokemontcg.collection',
  apiKey: 'pokemontcg.apiKey'
};
const STORAGE_KEYS = {
  collection: 'pokefolio.collection.v2',
  wishlist: 'pokefolio.wishlist.v1',
  decks: 'pokefolio.decks.v1',
  settings: 'pokefolio.settings.v1',
  apiKey: 'pokefolio.apiKey.v1',
  accounts: 'pokefolio.accounts.v1',
  session: 'pokefolio.session.v1',
  emailConfig: 'pokefolio.email-config.v1'
};
const DEFAULT_SETTINGS = {
  theme: 'dark',
  currency: 'EUR',
  valuationMode: 'average',
  exchangeRates: {
    USD: 0.92,
    GBP: 1.16
  },
  priceIntervalDays: 7,
  lastPriceUpdate: null,
  notes: ''
};
const DEFAULT_EMAIL_CONFIG = {
  serviceId: '',
  templateId: '',
  publicKey: '',
  senderName: 'Pokefolio'
};
const CONDITION_OPTIONS = [
  { value: 'mint', label: 'Mint' },
  { value: 'nearMint', label: 'Near Mint' },
  { value: 'lightPlay', label: 'Light Play' },
  { value: 'moderatePlay', label: 'Moderate Play' },
  { value: 'heavyPlay', label: 'Heavy Play' },
  { value: 'damaged', label: 'Damaged' }
];
const LANGUAGE_OPTIONS = [
  'Deutsch',
  'Englisch',
  'Japanisch',
  'Französisch',
  'Italienisch',
  'Spanisch',
  'Portugiesisch',
  'Koreanisch'
];
const REGULATION_MARKS = ['D', 'E', 'F', 'G', 'H'];
const PRIORITY_LABELS = {
  high: 'Must Have',
  medium: 'Wichtig',
  low: 'Nice to Have'
};
const CATEGORY_LABELS = {
  main: 'Hauptdeck',
  side: 'Sideboard',
  extra: 'Extra'
};

const SEARCH_CACHE_TTL_MS = 1000 * 60 * 5;
const MAX_SEARCH_CACHE_ENTRIES = 20;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_HASH_SALT = 'pokefolio-password-salt';

const cardCache = new Map();
const searchCache = new Map();

let activeSearchAbortController = null;

const dom = {};
const state = {
  apiKey: '',
  settings: { ...DEFAULT_SETTINGS },
  collection: [],
  wishlist: [],
  decks: [],
  accounts: [],
  currentUserId: null,
  emailConfig: { ...DEFAULT_EMAIL_CONFIG },
  emailClientInitialized: false,
  accountVerificationResult: null,
  sets: [],
  series: [],
  typeOptions: [],
  rarityOptions: [],
  supertypeOptions: [],
  activeSection: 'search',
  selectedDeckId: null,
  searchResults: [],
  isSearching: false,
  scanner: {
    stream: null,
    isActive: false
  }
};

init().catch((error) => {
  console.error('Fehler bei der Initialisierung', error);
  showGlobalFeedback(`Beim Start ist ein Fehler aufgetreten: ${getErrorMessage(error)}`, 'error');
});

async function init() {
  cacheDom();
  loadState();
  await handleVerificationFromUrl();
  applyTheme();
  populateStaticOptions();
  bindGlobalEvents();
  renderAll();
  await loadReferenceData();
  renderCollection();
  renderWishlist();
  renderDeckList();
  renderDeckDetail();
  renderDashboard();
  maybeSchedulePriceRefresh();
}

function cacheDom() {
  dom.body = document.body;
  dom.navButtons = document.querySelectorAll('.nav-button[data-section]');
  dom.views = document.querySelectorAll('.view[data-section]');

  dom.apiKeyInput = document.getElementById('apiKeyInput');
  dom.saveApiKeyButton = document.getElementById('saveApiKeyButton');
  dom.clearApiKeyButton = document.getElementById('clearApiKeyButton');
  dom.apiKeyFeedback = document.getElementById('apiKeyFeedback');

  dom.searchForm = document.getElementById('searchForm');
  dom.resetSearchButton = document.getElementById('resetSearchButton');
  dom.searchFeedback = document.getElementById('searchFeedback');
  dom.resultsGrid = document.getElementById('resultsGrid');
  dom.setsGrid = document.getElementById('setsGrid');
  dom.scannerFeedback = document.getElementById('scannerFeedback');
  dom.scannerResults = document.getElementById('scannerResults');
  dom.scannerVideo = document.getElementById('scannerVideo');
  dom.scannerCanvas = document.getElementById('scannerCanvas');
  dom.startScannerButton = document.getElementById('startScannerButton');
  dom.captureCardButton = document.getElementById('captureCardButton');
  dom.stopScannerButton = document.getElementById('stopScannerButton');

  dom.setFilter = document.getElementById('setFilter');
  dom.seriesFilter = document.getElementById('seriesFilter');
  dom.typeFilter = document.getElementById('typeFilter');
  dom.supertypeFilter = document.getElementById('supertypeFilter');
  dom.rarityFilter = document.getElementById('rarityFilter');
  dom.regulationFilter = document.getElementById('regulationFilter');
  dom.artistFilter = document.getElementById('artistFilter');
  dom.yearFilter = document.getElementById('yearFilter');
  dom.sortOrder = document.getElementById('sortOrder');

  dom.collectionFilterForm = document.getElementById('collectionFilterForm');
  dom.collectionSetFilter = document.getElementById('collectionSetFilter');
  dom.collectionSeriesFilter = document.getElementById('collectionSeriesFilter');
  dom.collectionRarityFilter = document.getElementById('collectionRarityFilter');
  dom.collectionTypeFilter = document.getElementById('collectionTypeFilter');
  dom.collectionConditionFilter = document.getElementById('collectionConditionFilter');
  dom.collectionLanguageFilter = document.getElementById('collectionLanguageFilter');
  dom.collectionSort = document.getElementById('collectionSort');
  dom.collectionSummary = document.getElementById('collectionSummary');
  dom.collectionFeedback = document.getElementById('collectionFeedback');
  dom.collectionEmptyState = document.getElementById('collectionEmptyState');
  dom.collectionGrid = document.getElementById('collectionGrid');

  dom.dashboardOverview = document.getElementById('dashboardOverview');
  dom.setProgressList = document.getElementById('setProgressList');
  dom.rarityDistribution = document.getElementById('rarityDistribution');
  dom.conditionDistribution = document.getElementById('conditionDistribution');
  dom.alertsList = document.getElementById('alertsList');

  dom.wishlistFeedback = document.getElementById('wishlistFeedback');
  dom.wishlistEmptyState = document.getElementById('wishlistEmptyState');
  dom.wishlistGrid = document.getElementById('wishlistGrid');

  dom.deckFeedback = document.getElementById('deckFeedback');
  dom.deckList = document.getElementById('deckList');
  dom.deckDetail = document.getElementById('deckDetail');
  dom.createDeckButton = document.getElementById('createDeckButton');

  dom.exportCollectionCsvButton = document.getElementById('exportCollectionCsvButton');
  dom.exportWishlistCsvButton = document.getElementById('exportWishlistCsvButton');
  dom.exportDeckListButton = document.getElementById('exportDeckListButton');
  dom.exportJsonButton = document.getElementById('exportJsonButton');
  dom.importJsonInput = document.getElementById('importJsonInput');
  dom.exportFeedback = document.getElementById('exportFeedback');

  dom.settingsForm = document.getElementById('settingsForm');
  dom.themeSelect = document.getElementById('themeSelect');
  dom.currencySelect = document.getElementById('currencySelect');
  dom.valuationModeSelect = document.getElementById('valuationModeSelect');
  dom.usdRateInput = document.getElementById('usdRateInput');
  dom.gbpRateInput = document.getElementById('gbpRateInput');
  dom.priceIntervalInput = document.getElementById('priceIntervalInput');
  dom.settingsNotes = document.getElementById('settingsNotes');
  dom.settingsFeedback = document.getElementById('settingsFeedback');
  dom.updatePricesButton = document.getElementById('updatePricesButton');
  dom.resetSettingsButton = document.getElementById('resetSettingsButton');
  dom.clearDataButton = document.getElementById('clearDataButton');
  dom.accountRegistrationForm = document.getElementById('accountRegistrationForm');
  dom.accountRegistrationFeedback = document.getElementById('accountRegistrationFeedback');
  dom.registrationEmail = document.getElementById('registrationEmail');
  dom.registrationPassword = document.getElementById('registrationPassword');
  dom.registrationPasswordConfirm = document.getElementById('registrationPasswordConfirm');
  dom.accountLoginForm = document.getElementById('accountLoginForm');
  dom.accountLoginFeedback = document.getElementById('accountLoginFeedback');
  dom.loginEmail = document.getElementById('loginEmail');
  dom.loginPassword = document.getElementById('loginPassword');
  dom.accountLogoutButton = document.getElementById('accountLogoutButton');
  dom.resendVerificationButton = document.getElementById('resendVerificationButton');
  dom.accountStatus = document.getElementById('accountStatus');
  dom.emailConfigForm = document.getElementById('emailConfigForm');
  dom.emailServiceId = document.getElementById('emailServiceId');
  dom.emailTemplateId = document.getElementById('emailTemplateId');
  dom.emailPublicKey = document.getElementById('emailPublicKey');
  dom.emailSenderName = document.getElementById('emailSenderName');
  dom.emailConfigFeedback = document.getElementById('emailConfigFeedback');

  dom.cardEditorDialog = document.getElementById('cardEditorDialog');
  dom.cardEditorForm = document.getElementById('cardEditorForm');
  dom.cardEditorTitle = document.getElementById('cardEditorTitle');
  dom.cardEditorImage = document.getElementById('cardEditorImage');
  dom.cardEditorName = document.getElementById('cardEditorName');
  dom.cardEditorInfo = document.getElementById('cardEditorInfo');
  dom.cardEditorPrices = document.getElementById('cardEditorPrices');
  dom.cardEditorCardId = document.getElementById('cardEditorCardId');
  dom.cardEditorMode = document.getElementById('cardEditorMode');
  dom.cardQuantityInput = document.getElementById('cardQuantityInput');
  dom.cardConditionSelect = document.getElementById('cardConditionSelect');
  dom.cardLanguageSelect = document.getElementById('cardLanguageSelect');
  dom.cardEditionSelect = document.getElementById('cardEditionSelect');
  dom.purchasePriceInput = document.getElementById('purchasePriceInput');
  dom.purchaseDateInput = document.getElementById('purchaseDateInput');
  dom.targetPriceInput = document.getElementById('targetPriceInput');
  dom.prioritySelect = document.getElementById('prioritySelect');
  dom.cardNotesInput = document.getElementById('cardNotesInput');

  dom.deckPickerDialog = document.getElementById('deckPickerDialog');
  dom.deckPickerForm = document.getElementById('deckPickerForm');
  dom.deckPickerCardInfo = document.getElementById('deckPickerCardInfo');
  dom.deckPickerSelect = document.getElementById('deckPickerSelect');
  dom.deckPickerQuantity = document.getElementById('deckPickerQuantity');
  dom.deckPickerCategory = document.getElementById('deckPickerCategory');
  dom.deckPickerCardId = document.getElementById('deckPickerCardId');

  dom.deckEditorDialog = document.getElementById('deckEditorDialog');
  dom.deckEditorForm = document.getElementById('deckEditorForm');
  dom.deckEditorTitle = document.getElementById('deckEditorTitle');
  dom.deckNameInput = document.getElementById('deckNameInput');
  dom.deckFormatSelect = document.getElementById('deckFormatSelect');
  dom.deckNotesInput = document.getElementById('deckNotesInput');
  dom.deckEditorId = document.getElementById('deckEditorId');

  dom.cardResultTemplate = document.getElementById('cardResultTemplate');
  dom.collectionItemTemplate = document.getElementById('collectionItemTemplate');
  dom.wishlistItemTemplate = document.getElementById('wishlistItemTemplate');
  dom.deckListItemTemplate = document.getElementById('deckListItemTemplate');
  dom.alertTemplate = document.getElementById('alertTemplate');

  dom.dialogCloseButtons = document.querySelectorAll('[data-dialog-close]');
}

function loadState() {
  state.apiKey = loadApiKey();
  state.settings = loadSettings();
  state.collection = loadCollection();
  state.wishlist = loadWishlist();
  state.decks = loadDecks();
  state.accounts = loadAccounts();
  state.currentUserId = loadSession();
  state.emailConfig = loadEmailConfig();

  if (dom.apiKeyInput) {
    dom.apiKeyInput.value = state.apiKey;
    if (state.apiKey) {
      setFeedback(dom.apiKeyFeedback, 'Eigener API-Schlüssel aktiv.', 'success');
    }
  }

  dom.themeSelect.value = state.settings.theme;
  dom.currencySelect.value = state.settings.currency;
  dom.valuationModeSelect.value = state.settings.valuationMode;
  dom.usdRateInput.value = state.settings.exchangeRates.USD ?? '';
  dom.gbpRateInput.value = state.settings.exchangeRates.GBP ?? '';
  dom.priceIntervalInput.value = state.settings.priceIntervalDays ?? '';
  dom.settingsNotes.value = state.settings.notes ?? '';
  dom.emailServiceId.value = state.emailConfig.serviceId ?? '';
  dom.emailTemplateId.value = state.emailConfig.templateId ?? '';
  dom.emailPublicKey.value = state.emailConfig.publicKey ?? '';
  dom.emailSenderName.value = state.emailConfig.senderName ?? '';
}

function populateStaticOptions() {
  if (dom.cardConditionSelect) {
    dom.cardConditionSelect.innerHTML = CONDITION_OPTIONS
      .map((option) => `<option value="${option.value}">${option.label}</option>`)
      .join('');
  }
  if (dom.collectionConditionFilter) {
    dom.collectionConditionFilter.innerHTML = '<option value="">Alle</option>' + CONDITION_OPTIONS
      .map((option) => `<option value="${option.value}">${option.label}</option>`)
      .join('');
  }
  if (dom.cardLanguageSelect) {
    dom.cardLanguageSelect.innerHTML = LANGUAGE_OPTIONS
      .map((language) => `<option value="${language}">${language}</option>`)
      .join('');
  }
  if (dom.collectionLanguageFilter) {
    dom.collectionLanguageFilter.innerHTML = '<option value="">Alle</option>' + LANGUAGE_OPTIONS
      .map((language) => `<option value="${language}">${language}</option>`)
      .join('');
  }
  if (dom.regulationFilter) {
    dom.regulationFilter.innerHTML = '<option value="">Alle</option>' + REGULATION_MARKS
      .map((mark) => `<option value="${mark}">${mark}</option>`)
      .join('');
  }
}

function bindGlobalEvents() {
  dom.navButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const section = button.dataset.section;
      if (section) {
        switchSection(section);
      }
    });
  });

  dom.dialogCloseButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      const dialog = event.currentTarget.closest('dialog');
      dialog?.close();
    });
  });

  dom.saveApiKeyButton?.addEventListener('click', () => {
    state.apiKey = dom.apiKeyInput.value.trim();
    saveApiKey(state.apiKey);
    setFeedback(dom.apiKeyFeedback, state.apiKey ? 'API-Schlüssel gespeichert.' : 'Bitte einen gültigen Schlüssel eingeben.', state.apiKey ? 'success' : 'error');
  });

  dom.clearApiKeyButton?.addEventListener('click', () => {
    dom.apiKeyInput.value = '';
    state.apiKey = '';
    saveApiKey('');
    setFeedback(dom.apiKeyFeedback, 'API-Schlüssel entfernt. Öffentliche Limits gelten.', 'success');
  });

  dom.searchForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await handleSearchSubmit(new FormData(dom.searchForm));
  });

  dom.searchForm?.addEventListener('reset', () => {
    setTimeout(() => {
      state.searchResults = [];
      renderCardResults([]);
      setFeedback(dom.searchFeedback, 'Filter zurückgesetzt. Starte eine neue Suche.');
    }, 0);
  });

  dom.resultsGrid?.addEventListener('click', handleCardActionClick);
  dom.scannerResults?.addEventListener('click', handleCardActionClick);
  dom.collectionGrid?.addEventListener('click', handleCollectionActionClick);
  dom.wishlistGrid?.addEventListener('click', handleWishlistActionClick);
  dom.deckDetail?.addEventListener('click', handleDeckDetailActionClick);

  dom.collectionFilterForm?.addEventListener('change', () => {
    renderCollection();
    renderDashboard();
  });

  dom.createDeckButton?.addEventListener('click', () => openDeckEditor());
  dom.deckList?.addEventListener('click', handleDeckListClick);

  dom.cardEditorForm?.addEventListener('submit', handleCardEditorSubmit);
  dom.deckPickerForm?.addEventListener('submit', handleDeckPickerSubmit);
  dom.deckEditorForm?.addEventListener('submit', handleDeckEditorSubmit);

  dom.updatePricesButton?.addEventListener('click', () => updateAllPrices());
  dom.resetSettingsButton?.addEventListener('click', () => resetSettings());
  dom.clearDataButton?.addEventListener('click', () => clearAllData());

  dom.themeSelect?.addEventListener('change', () => updateSetting('theme', dom.themeSelect.value));
  dom.currencySelect?.addEventListener('change', () => updateCurrency(dom.currencySelect.value));
  dom.valuationModeSelect?.addEventListener('change', () => updateSetting('valuationMode', dom.valuationModeSelect.value));
  dom.usdRateInput?.addEventListener('change', () => updateExchangeRate('USD', parseFloat(dom.usdRateInput.value)));
  dom.gbpRateInput?.addEventListener('change', () => updateExchangeRate('GBP', parseFloat(dom.gbpRateInput.value)));
  dom.priceIntervalInput?.addEventListener('change', () => updateSetting('priceIntervalDays', parseInt(dom.priceIntervalInput.value, 10) || DEFAULT_SETTINGS.priceIntervalDays));
  dom.settingsNotes?.addEventListener('input', () => updateSetting('notes', dom.settingsNotes.value));

  dom.exportCollectionCsvButton?.addEventListener('click', exportCollectionCsv);
  dom.exportWishlistCsvButton?.addEventListener('click', exportWishlistCsv);
  dom.exportDeckListButton?.addEventListener('click', exportDeckLists);
  dom.exportJsonButton?.addEventListener('click', exportBackupJson);
  dom.importJsonInput?.addEventListener('change', importBackupJson);

  dom.startScannerButton?.addEventListener('click', startScanner);
  dom.captureCardButton?.addEventListener('click', captureCard);
  dom.stopScannerButton?.addEventListener('click', stopScanner);

  dom.accountRegistrationForm?.addEventListener('submit', handleAccountRegistrationSubmit);
  dom.accountLoginForm?.addEventListener('submit', handleAccountLoginSubmit);
  dom.accountLogoutButton?.addEventListener('click', handleAccountLogout);
  dom.emailConfigForm?.addEventListener('submit', handleEmailConfigSubmit);
  dom.resendVerificationButton?.addEventListener('click', handleResendVerification);

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.settings.theme === 'system') {
      applyTheme();
    }
  });
}

function renderAll() {
  switchSection(state.activeSection);
  renderCardResults(state.searchResults);
  renderCollection();
  renderWishlist();
  renderDeckList();
  renderDeckDetail();
  renderDashboard();
  renderAccountSection();
  renderDeckPickerOptions();
}

async function loadReferenceData() {
  try {
    setFeedback(dom.searchFeedback, 'Lade Sets und Filter …');
    const [setsResponse, typesResponse, raritiesResponse, supertypesResponse] = await Promise.all([
      apiFetch('/sets', { orderBy: '-releaseDate', pageSize: 250 }),
      apiFetch('/types'),
      apiFetch('/rarities'),
      apiFetch('/supertypes')
    ]);

    state.sets = Array.isArray(setsResponse?.data) ? setsResponse.data : [];
    state.series = Array.from(new Set(state.sets.map((set) => set.series).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'de'));
    state.typeOptions = typesResponse?.data ?? [];
    state.rarityOptions = raritiesResponse?.data ?? [];
    state.supertypeOptions = supertypesResponse?.data ?? [];

    populateSetAndSeriesFilters();
    populateTypeFilters();
    populateRarityFilters();
    populateSupertypeFilter();

    renderSetList(state.sets.slice(0, FEATURED_SET_LIMIT));
    setFeedback(dom.searchFeedback, 'Daten geladen. Starte eine Suche oder nutze den Scanner.');
  } catch (error) {
    console.error('Referenzdaten konnten nicht geladen werden', error);
    setFeedback(dom.searchFeedback, `Fehler beim Laden der Referenzdaten: ${getErrorMessage(error)}`, 'error');
  }
}

function populateSetAndSeriesFilters() {
  if (dom.setFilter) {
    dom.setFilter.innerHTML = '<option value="">Alle Sets</option>' + state.sets
      .map((set) => `<option value="${set.id}">${escapeHtml(`${set.name} (${set.series})`)}</option>`)
      .join('');
  }
  if (dom.collectionSetFilter) {
    dom.collectionSetFilter.innerHTML = '<option value="">Alle</option>' + state.sets
      .map((set) => `<option value="${set.id}">${escapeHtml(`${set.name} (${set.series})`)}</option>`)
      .join('');
  }
  if (dom.seriesFilter) {
    dom.seriesFilter.innerHTML = '<option value="">Alle Serien</option>' + state.series
      .map((series) => `<option value="${escapeHtml(series)}">${escapeHtml(series)}</option>`)
      .join('');
  }
  if (dom.collectionSeriesFilter) {
    dom.collectionSeriesFilter.innerHTML = '<option value="">Alle</option>' + state.series
      .map((series) => `<option value="${escapeHtml(series)}">${escapeHtml(series)}</option>`)
      .join('');
  }
}

function populateTypeFilters() {
  const typeOptions = state.typeOptions
    .map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`)
    .join('');
  if (dom.typeFilter) {
    dom.typeFilter.innerHTML = '<option value="">Alle Typen</option>' + typeOptions;
  }
  if (dom.collectionTypeFilter) {
    dom.collectionTypeFilter.innerHTML = '<option value="">Alle</option>' + typeOptions;
  }
}

function populateRarityFilters() {
  const rarityOptions = state.rarityOptions
    .map((rarity) => `<option value="${escapeHtml(rarity)}">${escapeHtml(rarity)}</option>`)
    .join('');
  if (dom.rarityFilter) {
    dom.rarityFilter.innerHTML = '<option value="">Alle Seltenheiten</option>' + rarityOptions;
  }
  if (dom.collectionRarityFilter) {
    dom.collectionRarityFilter.innerHTML = '<option value="">Alle</option>' + rarityOptions;
  }
}

function populateSupertypeFilter() {
  if (!dom.supertypeFilter) {
    return;
  }
  dom.supertypeFilter.innerHTML = '<option value="">Alle</option>' + state.supertypeOptions
    .map((supertype) => `<option value="${escapeHtml(supertype)}">${escapeHtml(supertype)}</option>`)
    .join('');
}

async function handleSearchSubmit(formData) {
  if (activeSearchAbortController) {
    activeSearchAbortController.abort();
    activeSearchAbortController = null;
  }
  state.isSearching = false;

  const clauses = [];
  const query = (formData.get('query') || '').toString().trim();
  const setId = (formData.get('set') || '').toString();
  const series = (formData.get('series') || '').toString();
  const type = (formData.get('type') || '').toString();
  const supertype = (formData.get('supertype') || '').toString();
  const rarity = (formData.get('rarity') || '').toString();
  const regulation = (formData.get('regulation') || '').toString();
  const artist = (formData.get('artist') || '').toString().trim();
  const year = (formData.get('year') || '').toString().trim();
  const sort = (formData.get('sort') || 'name').toString();

  if (query) {
    const escaped = escapeQueryValue(query);
    clauses.push(`(name:*\"${escaped}\"* OR subtypes:*\"${escaped}\"* OR abilities.text:*\"${escaped}\"*)`);
  }
  if (setId) {
    clauses.push(`set.id:${setId}`);
  }
  if (series) {
    clauses.push(`set.series:\"${escapeQueryValue(series)}\"`);
  }
  if (type) {
    clauses.push(`types:${escapeQueryValue(type)}`);
  }
  if (supertype) {
    clauses.push(`supertype:\"${escapeQueryValue(supertype)}\"`);
  }
  if (rarity) {
    clauses.push(`rarity:\"${escapeQueryValue(rarity)}\"`);
  }
  if (regulation) {
    clauses.push(`regulationMark:${escapeQueryValue(regulation)}`);
  }
  if (artist) {
    clauses.push(`artist:*\"${escapeQueryValue(artist)}\"*`);
  }
  if (year) {
    const numericYear = Number.parseInt(year, 10);
    if (!Number.isNaN(numericYear)) {
      const start = `${numericYear}-01-01`;
      const end = `${numericYear}-12-31`;
      clauses.push(`set.releaseDate:[${start} TO ${end}]`);
    }
  }

  const params = new URLSearchParams({
    pageSize: '48',
    orderBy: sort
  });

  if (clauses.length) {
    params.set('q', clauses.join(' AND '));
  }

  const cacheKey = `/cards?${params.toString()}`;
  const cachedEntry = getSearchCacheEntry(cacheKey);

  if (cachedEntry) {
    const cachedCards = cachedEntry.cards;
    cachedCards.forEach((card) => cardCache.set(card.id, card));
    state.searchResults = cachedCards;
    renderCardResults(cachedCards);
    const message = cachedCards.length
      ? `${cachedCards.length} Karten aus Zwischenspeicher${cachedEntry.isFresh ? '' : ' – aktualisiere …'}.`
      : cachedEntry.isFresh
        ? 'Keine passenden Karten gefunden.'
        : 'Keine passenden Karten gefunden. Suche wird aktualisiert …';
    setFeedback(dom.searchFeedback, message, cachedCards.length ? 'success' : 'error');
    if (cachedEntry.isFresh) {
      return;
    }
  } else {
    setFeedback(dom.searchFeedback, 'Suche Karten …');
  }

  const controller = new AbortController();
  activeSearchAbortController = controller;
  state.isSearching = true;

  try {
    const response = await apiFetch('/cards', params, { signal: controller.signal });
    const cards = Array.isArray(response?.data) ? response.data : [];
    cards.forEach((card) => cardCache.set(card.id, card));
    rememberSearchResult(cacheKey, cards);
    state.searchResults = cards;
    renderCardResults(cards);
    setFeedback(dom.searchFeedback, cards.length ? `${cards.length} Karten gefunden.` : 'Keine passenden Karten gefunden.', cards.length ? 'success' : 'error');
  } catch (error) {
    if (error?.name === 'AbortError') {
      return;
    }
    console.error('Suche fehlgeschlagen', error);
    setFeedback(dom.searchFeedback, `Suche fehlgeschlagen: ${getErrorMessage(error)}`, 'error');
  } finally {
    if (activeSearchAbortController === controller) {
      activeSearchAbortController = null;
      state.isSearching = false;
    }
  }
}

function getSearchCacheEntry(cacheKey) {
  const entry = searchCache.get(cacheKey);
  if (!entry) {
    return null;
  }
  const isFresh = Date.now() - entry.timestamp <= SEARCH_CACHE_TTL_MS;
  return {
    cards: entry.cards.slice(),
    isFresh
  };
}

function rememberSearchResult(cacheKey, cards) {
  const normalizedCards = Array.isArray(cards) ? cards.slice() : [];
  searchCache.set(cacheKey, {
    cards: normalizedCards,
    timestamp: Date.now()
  });
  if (searchCache.size > MAX_SEARCH_CACHE_ENTRIES) {
    let oldestKey = null;
    let oldestTimestamp = Infinity;
    searchCache.forEach((value, key) => {
      if (value.timestamp < oldestTimestamp) {
        oldestTimestamp = value.timestamp;
        oldestKey = key;
      }
    });
    if (oldestKey) {
      searchCache.delete(oldestKey);
    }
  }
}

function renderCardResults(cards) {
  if (!dom.resultsGrid) {
    return;
  }
  dom.resultsGrid.innerHTML = '';
  if (!cards.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Noch keine Ergebnisse. Starte eine Suche oder nutze den Scanner.';
    dom.resultsGrid.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  cards.forEach((card) => {
    fragment.append(createCardElement(card));
  });
  dom.resultsGrid.append(fragment);
}

function renderSetList(sets) {
  if (!dom.setsGrid) {
    return;
  }
  dom.setsGrid.innerHTML = '';
  if (!sets.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Keine Sets gefunden.';
    dom.setsGrid.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  sets.forEach((set) => {
    const element = document.createElement('article');
    element.className = 'set-card';

    const img = document.createElement('img');
    img.src = set.images?.symbol || set.images?.logo || '';
    img.alt = `${set.name} Symbol`;
    element.append(img);

    const info = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = set.name;
    info.append(title);

    const details = document.createElement('p');
    const date = formatDate(set.releaseDate);
    const total = set.total ? `${set.total} Karten` : 'Unbekannte Anzahl';
    details.textContent = `${set.series} · ${total}${date ? ` · ${date}` : ''}`;
    info.append(details);

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'secondary';
    action.textContent = 'Im Suchfilter wählen';
    action.addEventListener('click', () => {
      if (dom.setFilter) {
        dom.setFilter.value = set.id;
      }
      dom.searchForm?.dispatchEvent(new Event('submit'));
    });
    info.append(action);

    element.append(info);
    fragment.append(element);
  });
  dom.setsGrid.append(fragment);
}

function createCardElement(card) {
  const template = dom.cardResultTemplate;
  if (!template) {
    throw new Error('Kartenvorlage fehlt');
  }

  const element = template.content.firstElementChild.cloneNode(true);
  element.dataset.cardId = card.id;
  const image = element.querySelector('.card-image');
  image.src = card.images?.small || card.images?.large || '';
  image.alt = `${card.name} (${card.set?.name ?? 'Pokémon TCG'})`;

  element.querySelector('.card-title').textContent = card.name;
  element.querySelector('.card-subtitle').textContent = card.set ? `${card.set.series} · ${card.set.name}` : 'Pokémon TCG Karte';

  const metaList = element.querySelector('.card-meta');
  metaList.innerHTML = '';
  const metaParts = [];
  if (card.number) metaParts.push(`Nr. ${card.number}`);
  if (card.rarity) metaParts.push(card.rarity);
  if (card.supertype) metaParts.push(card.supertype);
  if (card.regulationMark) metaParts.push(`Reg. ${card.regulationMark}`);
  if (card.artist) metaParts.push(card.artist);
  metaParts.forEach((part) => {
    const li = document.createElement('li');
    li.textContent = part;
    metaList.append(li);
  });

  const priceElement = element.querySelector('.card-price');
  const priceInfo = extractMarketPrices(card);
  if (priceInfo.aggregated.average !== null) {
    priceElement.textContent = `Ø ${formatCurrency(priceInfo.aggregated[state.settings.valuationMode])}`;
  } else {
    priceElement.textContent = 'Keine Preisdaten verfügbar';
  }

  const badges = element.querySelector('.card-badges');
  badges.innerHTML = '';
  if (card.rarity) {
    badges.append(createBadge(card.rarity));
  }
  if (card.types?.length) {
    badges.append(createBadge(card.types.join(', ')));
  }

  const detailsLink = element.querySelector('.details-link');
  if (detailsLink) {
    detailsLink.href = createDetailsUrl(card.id);
  }

  return element;
}

function createBadge(text) {
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = text;
  return badge;
}

function handleCardActionClick(event) {
  const actionButton = event.target.closest('button[data-action]');
  if (!actionButton) {
    return;
  }
  const cardElement = actionButton.closest('[data-card-id]');
  if (!cardElement) {
    return;
  }
  const cardId = cardElement.dataset.cardId;
  const card = cardCache.get(cardId);
  if (!card) {
    setFeedback(dom.searchFeedback, 'Kartendaten konnten nicht geladen werden.', 'error');
    return;
  }

  switch (actionButton.dataset.action) {
    case 'add-to-collection':
      openCardEditor(card, 'collection');
      break;
    case 'add-to-wishlist':
      openCardEditor(card, 'wishlist');
      break;
    case 'add-to-deck':
      openDeckPicker(card);
      break;
    default:
      break;
  }
}

function handleCollectionActionClick(event) {
  const actionButton = event.target.closest('button[data-action]');
  if (!actionButton) {
    return;
  }
  const cardElement = actionButton.closest('[data-card-id]');
  if (!cardElement) {
    return;
  }
  const entryId = cardElement.dataset.cardId;
  const entry = state.collection.find((item) => item.id === entryId);
  if (!entry) {
    return;
  }

  switch (actionButton.dataset.action) {
    case 'edit-entry':
      openCardEditor(entry, 'collection-edit');
      break;
    case 'update-price':
      updateEntryPrice(entry);
      break;
    case 'add-to-deck':
      getCardDetails(entry.id).then((card) => {
        if (card) {
          openDeckPicker(card);
        }
      });
      break;
    case 'remove-entry':
      removeCollectionEntry(entry.id);
      break;
    default:
      break;
  }
}

function handleWishlistActionClick(event) {
  const actionButton = event.target.closest('button[data-action]');
  if (!actionButton) {
    return;
  }
  const cardElement = actionButton.closest('[data-card-id]');
  if (!cardElement) {
    return;
  }
  const entryId = cardElement.dataset.cardId;
  const entry = state.wishlist.find((item) => item.id === entryId);
  if (!entry) {
    return;
  }

  switch (actionButton.dataset.action) {
    case 'move-to-collection':
      getCardDetails(entry.id).then((card) => {
        if (card) {
          openCardEditor({ ...card, wishlistEntry: entry }, 'collection-from-wishlist');
        }
      });
      break;
    case 'edit-wishlist':
      openCardEditor(entry, 'wishlist-edit');
      break;
    case 'remove-wishlist':
      removeWishlistEntry(entry.id);
      break;
    default:
      break;
  }
}

function handleDeckListClick(event) {
  const deckItem = event.target.closest('.deck-item');
  if (!deckItem) {
    return;
  }
  const deckId = deckItem.dataset.deckId;
  const actionButton = event.target.closest('button[data-action]');
  if (actionButton) {
    if (actionButton.dataset.action === 'edit-deck') {
      const deck = state.decks.find((item) => item.id === deckId);
      if (deck) {
        openDeckEditor(deck);
      }
      return;
    }
    if (actionButton.dataset.action === 'delete-deck') {
      deleteDeck(deckId);
      return;
    }
  }

  selectDeck(deckId);
}

function handleDeckDetailActionClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }
  const deckId = state.selectedDeckId;
  const deck = state.decks.find((item) => item.id === deckId);
  if (!deck) {
    return;
  }

  const cardId = button.dataset.cardId;
  const category = button.dataset.category;
  switch (button.dataset.action) {
    case 'remove-deck-card':
      updateDeckCardQuantity(deck, cardId, category, 0);
      break;
    case 'increase-deck-card':
      updateDeckCardQuantity(deck, cardId, category, (getDeckCard(deck, cardId, category)?.quantity ?? 0) + 1);
      break;
    case 'decrease-deck-card':
      updateDeckCardQuantity(deck, cardId, category, (getDeckCard(deck, cardId, category)?.quantity ?? 0) - 1);
      break;
    default:
      break;
  }
}

function handleCardEditorSubmit(event) {
  event.preventDefault();
  const mode = dom.cardEditorDialog.dataset.mode || 'collection';
  const cardId = dom.cardEditorDialog.dataset.cardId;
  const quantity = Math.max(1, parseInt(dom.cardQuantityInput.value, 10) || 1);
  const condition = dom.cardConditionSelect.value;
  const language = dom.cardLanguageSelect.value;
  const edition = dom.cardEditionSelect.value;
  const purchasePrice = parseFloat(dom.purchasePriceInput.value);
  const purchaseDate = dom.purchaseDateInput.value || null;
  const targetPrice = parseFloat(dom.targetPriceInput.value);
  const priority = dom.prioritySelect.value || 'medium';
  const notes = dom.cardNotesInput.value.trim();

  const payload = {
    cardId,
    quantity,
    condition,
    language,
    edition,
    purchasePrice: Number.isFinite(purchasePrice) ? purchasePrice : null,
    purchaseDate,
    targetPrice: Number.isFinite(targetPrice) ? targetPrice : null,
    priority,
    notes
  };

  switch (mode) {
    case 'collection':
      addToCollection(cardId, payload);
      break;
    case 'collection-edit':
      updateCollectionEntry(cardId, payload);
      break;
    case 'collection-from-wishlist':
      moveWishlistEntryToCollection(cardId, payload);
      break;
    case 'wishlist':
      addToWishlist(cardId, payload);
      break;
    case 'wishlist-edit':
      updateWishlistEntry(cardId, payload);
      break;
    default:
      break;
  }

  dom.cardEditorDialog.close('save');
}

function handleDeckPickerSubmit(event) {
  event.preventDefault();
  const deckId = dom.deckPickerSelect.value;
  if (!deckId) {
    setFeedback(dom.deckFeedback, 'Bitte zuerst ein Deck auswählen oder erstellen.', 'error');
    return;
  }
  const deck = state.decks.find((item) => item.id === deckId);
  if (!deck) {
    setFeedback(dom.deckFeedback, 'Deck konnte nicht gefunden werden.', 'error');
    return;
  }

  const cardId = dom.deckPickerCardId.value;
  const quantity = Math.max(1, Math.min(4, parseInt(dom.deckPickerQuantity.value, 10) || 1));
  const category = dom.deckPickerCategory.value || 'main';

  getCardDetails(cardId).then((card) => {
    if (card) {
      addCardToDeck(deck, card, quantity, category);
      dom.deckPickerDialog.close('save');
    }
  });
}

function handleDeckEditorSubmit(event) {
  event.preventDefault();
  const deckId = dom.deckEditorId.value;
  const name = dom.deckNameInput.value.trim();
  const format = dom.deckFormatSelect.value;
  const notes = dom.deckNotesInput.value.trim();
  if (!name) {
    return;
  }

  if (deckId) {
    const deck = state.decks.find((item) => item.id === deckId);
    if (deck) {
      deck.name = name;
      deck.format = format;
      deck.notes = notes;
      deck.updatedAt = new Date().toISOString();
      saveDecks();
      renderDeckList();
      renderDeckDetail();
      setFeedback(dom.deckFeedback, 'Deck aktualisiert.', 'success');
    }
  } else {
    const newDeck = {
      id: crypto.randomUUID(),
      name,
      format,
      notes,
      cards: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    state.decks.push(newDeck);
    saveDecks();
    renderDeckList();
    selectDeck(newDeck.id);
    setFeedback(dom.deckFeedback, 'Deck erstellt. Füge nun Karten hinzu.', 'success');
  }

  renderDeckPickerOptions();
  dom.deckEditorDialog.close('save');
}

function switchSection(section) {
  state.activeSection = section;
  dom.views.forEach((view) => {
    const isActive = view.dataset.section === section;
    view.classList.toggle('is-active', isActive);
    view.hidden = !isActive;
  });
  dom.navButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.section === section);
  });
  if (section === 'deck') {
    renderDeckDetail();
  }
}

function openCardEditor(cardOrEntry, mode) {
  if (!dom.cardEditorDialog) {
    return;
  }
  const entry = state.collection.find((item) => item.id === cardOrEntry.id);
  const wishlistEntry = state.wishlist.find((item) => item.id === cardOrEntry.id) || cardOrEntry.wishlistEntry;

  const cardPromise = cardCache.has(cardOrEntry.id)
    ? Promise.resolve(cardCache.get(cardOrEntry.id))
    : getCardDetails(cardOrEntry.id);

  cardPromise.then((cardData) => {
    if (!cardData) {
      setFeedback(dom.searchFeedback, 'Kartendaten konnten nicht geladen werden.', 'error');
      return;
    }
    cardCache.set(cardData.id, cardData);

    dom.cardEditorDialog.dataset.cardId = cardData.id;
    dom.cardEditorDialog.dataset.mode = mode;
    dom.cardEditorCardId.value = cardData.id;
    dom.cardEditorMode.value = mode;

    dom.cardEditorImage.src = cardData.images?.small || cardData.images?.large || '';
    dom.cardEditorImage.alt = `${cardData.name} (${cardData.set?.name ?? 'Pokémon TCG'})`;
    dom.cardEditorName.textContent = cardData.name;
    dom.cardEditorInfo.textContent = cardData.set ? `${cardData.set.series} · ${cardData.set.name} · ${cardData.number ?? ''}` : '';

    const priceInfo = extractMarketPrices(cardData);
    dom.cardEditorPrices.textContent = priceInfo.aggregated.average !== null
      ? `Ø ${formatCurrency(priceInfo.aggregated[state.settings.valuationMode])}`
      : 'Keine Preisdaten verfügbar';

    const defaults = {
      quantity: 1,
      condition: 'nearMint',
      language: 'Deutsch',
      edition: 'standard',
      purchasePrice: '',
      purchaseDate: '',
      targetPrice: '',
      priority: 'medium',
      notes: ''
    };

    if (mode === 'collection-edit' && entry) {
      defaults.quantity = entry.quantity ?? 1;
      defaults.condition = entry.condition ?? 'nearMint';
      defaults.language = entry.language ?? 'Deutsch';
      defaults.edition = entry.edition ?? 'standard';
      defaults.purchasePrice = entry.purchasePrice ?? '';
      defaults.purchaseDate = entry.purchaseDate ?? '';
      defaults.targetPrice = entry.targetPrice ?? '';
      defaults.priority = entry.priority ?? 'medium';
      defaults.notes = entry.notes ?? '';
    } else if (mode === 'wishlist-edit' && wishlistEntry) {
      defaults.quantity = wishlistEntry.quantity ?? 1;
      defaults.targetPrice = wishlistEntry.targetPrice ?? '';
      defaults.priority = wishlistEntry.priority ?? 'medium';
      defaults.notes = wishlistEntry.notes ?? '';
    } else if (mode === 'collection-from-wishlist' && wishlistEntry) {
      defaults.quantity = wishlistEntry.quantity ?? 1;
      defaults.targetPrice = wishlistEntry.targetPrice ?? '';
      defaults.priority = wishlistEntry.priority ?? 'medium';
      defaults.notes = wishlistEntry.notes ?? '';
    }

    dom.cardQuantityInput.value = defaults.quantity;
    dom.cardConditionSelect.value = defaults.condition;
    dom.cardLanguageSelect.value = defaults.language;
    dom.cardEditionSelect.value = defaults.edition;
    dom.purchasePriceInput.value = defaults.purchasePrice;
    dom.purchaseDateInput.value = defaults.purchaseDate;
    dom.targetPriceInput.value = defaults.targetPrice;
    dom.prioritySelect.value = defaults.priority;
    dom.cardNotesInput.value = defaults.notes;

    configureCardEditorFields(mode);
    dom.cardEditorTitle.textContent = getCardEditorTitle(mode);
    dom.cardEditorDialog.showModal();
  });
}

function configureCardEditorFields(mode) {
  const showCollectionFields = mode.startsWith('collection');
  const purchaseGroup = dom.purchasePriceInput.closest('label');
  const dateGroup = dom.purchaseDateInput.closest('label');
  const conditionGroup = dom.cardConditionSelect.closest('label');
  const languageGroup = dom.cardLanguageSelect.closest('label');
  const editionGroup = dom.cardEditionSelect.closest('label');

  if (showCollectionFields) {
    conditionGroup.hidden = false;
    languageGroup.hidden = false;
    editionGroup.hidden = false;
    purchaseGroup.hidden = false;
    dateGroup.hidden = false;
  } else {
    conditionGroup.hidden = true;
    languageGroup.hidden = true;
    editionGroup.hidden = true;
    purchaseGroup.hidden = true;
    dateGroup.hidden = true;
  }

  dom.prioritySelect.closest('label').hidden = !mode.includes('wishlist');
}

function getCardEditorTitle(mode) {
  switch (mode) {
    case 'collection-edit':
      return 'Sammlungseintrag bearbeiten';
    case 'collection-from-wishlist':
      return 'Wunschliste in Sammlung übernehmen';
    case 'wishlist':
      return 'Zur Wunschliste hinzufügen';
    case 'wishlist-edit':
      return 'Wunschlisteneintrag bearbeiten';
    default:
      return 'Karte zur Sammlung hinzufügen';
  }
}

function addToCollection(cardId, payload) {
  getCardDetails(cardId).then((card) => {
    if (!card) {
      setFeedback(dom.collectionFeedback, 'Kartendaten konnten nicht geladen werden.', 'error');
      return;
    }
    const existing = state.collection.find((entry) => entry.id === cardId);
    if (existing) {
      existing.quantity += payload.quantity;
      existing.condition = payload.condition;
      existing.language = payload.language;
      existing.edition = payload.edition;
      if (payload.purchasePrice !== null) {
        addPurchaseHistory(existing, payload.purchasePrice, payload.quantity, payload.purchaseDate);
        existing.purchasePrice = payload.purchasePrice;
        existing.purchaseDate = payload.purchaseDate;
      }
      if (payload.targetPrice !== null) {
        existing.targetPrice = payload.targetPrice;
        existing.targetPriceCurrency = state.settings.currency;
      }
      if (payload.notes) {
        existing.notes = payload.notes;
      }
      existing.priority = payload.priority ?? existing.priority;
      existing.updatedAt = new Date().toISOString();
      saveCollection();
      renderCollection();
      renderDashboard();
      setFeedback(dom.collectionFeedback, `${existing.name} aktualisiert.`, 'success');
      return;
    }

    const { aggregated, sources } = extractMarketPrices(card);
    const entry = {
      id: card.id,
      name: card.name,
      number: card.number ?? '',
      setId: card.set?.id ?? '',
      setName: card.set?.name ?? '',
      setSeries: card.set?.series ?? '',
      rarity: card.rarity ?? '',
      supertype: card.supertype ?? '',
      subtypes: card.subtypes ?? [],
      types: card.types ?? [],
      regulationMark: card.regulationMark ?? '',
      artist: card.artist ?? '',
      images: card.images ?? {},
      url: createDetailsUrl(card.id),
      quantity: payload.quantity,
      condition: payload.condition,
      language: payload.language,
      edition: payload.edition,
      purchasePrice: payload.purchasePrice ?? null,
      purchaseDate: payload.purchaseDate,
      purchaseHistory: payload.purchasePrice !== null ? [{
        price: payload.purchasePrice,
        quantity: payload.quantity,
        date: payload.purchaseDate
      }] : [],
      targetPrice: payload.targetPrice ?? null,
      targetPriceCurrency: payload.targetPrice !== null ? state.settings.currency : null,
      priority: payload.priority ?? 'medium',
      notes: payload.notes ?? '',
      market: aggregated,
      marketSources: sources,
      priceHistory: aggregated.average !== null ? [{
        timestamp: new Date().toISOString(),
        ...aggregated
      }] : [],
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    state.collection.push(entry);
    saveCollection();
    renderCollection();
    renderDashboard();
    setFeedback(dom.collectionFeedback, `${entry.name} wurde zur Sammlung hinzugefügt.`, 'success');
  });
}

function updateCollectionEntry(cardId, payload) {
  const entry = state.collection.find((item) => item.id === cardId);
  if (!entry) {
    return;
  }
  entry.quantity = payload.quantity;
  entry.condition = payload.condition;
  entry.language = payload.language;
  entry.edition = payload.edition;
  if (payload.purchasePrice !== null) {
    entry.purchasePrice = payload.purchasePrice;
    entry.purchaseDate = payload.purchaseDate;
    addPurchaseHistory(entry, payload.purchasePrice, payload.quantity, payload.purchaseDate);
  }
  if (payload.targetPrice !== null) {
    entry.targetPrice = payload.targetPrice;
    entry.targetPriceCurrency = state.settings.currency;
  } else {
    entry.targetPrice = null;
    entry.targetPriceCurrency = null;
  }
  entry.priority = payload.priority ?? entry.priority;
  entry.notes = payload.notes;
  entry.updatedAt = new Date().toISOString();
  saveCollection();
  renderCollection();
  renderDashboard();
  setFeedback(dom.collectionFeedback, 'Sammlungseintrag gespeichert.', 'success');
}

function addPurchaseHistory(entry, price, quantity, date) {
  entry.purchaseHistory = entry.purchaseHistory || [];
  entry.purchaseHistory.push({
    price,
    quantity,
    date: date || null
  });
}

function removeCollectionEntry(cardId) {
  if (!confirm('Soll dieser Eintrag wirklich entfernt werden?')) {
    return;
  }
  const index = state.collection.findIndex((entry) => entry.id === cardId);
  if (index === -1) {
    return;
  }
  const [removed] = state.collection.splice(index, 1);
  saveCollection();
  renderCollection();
  renderDashboard();
  setFeedback(dom.collectionFeedback, `${removed.name} wurde entfernt.`, 'success');
}

function addToWishlist(cardId, payload) {
  getCardDetails(cardId).then((card) => {
    if (!card) {
      setFeedback(dom.wishlistFeedback, 'Kartendaten konnten nicht geladen werden.', 'error');
      return;
    }
    const existing = state.wishlist.find((entry) => entry.id === cardId);
    const { aggregated, sources } = extractMarketPrices(card);

    if (existing) {
      existing.quantity = payload.quantity;
      existing.targetPrice = payload.targetPrice ?? existing.targetPrice;
      existing.targetPriceCurrency = payload.targetPrice !== null ? state.settings.currency : existing.targetPriceCurrency;
      existing.priority = payload.priority ?? existing.priority;
      existing.notes = payload.notes;
      existing.market = aggregated;
      existing.marketSources = sources;
      existing.updatedAt = new Date().toISOString();
      saveWishlist();
      renderWishlist();
      renderDashboard();
      setFeedback(dom.wishlistFeedback, `${existing.name} aktualisiert.`, 'success');
      return;
    }

    const entry = {
      id: card.id,
      name: card.name,
      number: card.number ?? '',
      setId: card.set?.id ?? '',
      setName: card.set?.name ?? '',
      setSeries: card.set?.series ?? '',
      rarity: card.rarity ?? '',
      supertype: card.supertype ?? '',
      subtypes: card.subtypes ?? [],
      types: card.types ?? [],
      regulationMark: card.regulationMark ?? '',
      images: card.images ?? {},
      url: createDetailsUrl(card.id),
      quantity: payload.quantity,
      targetPrice: payload.targetPrice ?? null,
      targetPriceCurrency: payload.targetPrice !== null ? state.settings.currency : null,
      priority: payload.priority ?? 'medium',
      notes: payload.notes ?? '',
      market: aggregated,
      marketSources: sources,
      priceHistory: aggregated.average !== null ? [{
        timestamp: new Date().toISOString(),
        ...aggregated
      }] : [],
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    state.wishlist.push(entry);
    saveWishlist();
    renderWishlist();
    renderDashboard();
    setFeedback(dom.wishlistFeedback, `${entry.name} zur Wunschliste hinzugefügt.`, 'success');
  });
}

function updateWishlistEntry(cardId, payload) {
  const entry = state.wishlist.find((item) => item.id === cardId);
  if (!entry) {
    return;
  }
  entry.quantity = payload.quantity;
  entry.targetPrice = payload.targetPrice ?? entry.targetPrice;
  entry.targetPriceCurrency = payload.targetPrice !== null ? state.settings.currency : entry.targetPriceCurrency;
  entry.priority = payload.priority ?? entry.priority;
  entry.notes = payload.notes ?? entry.notes;
  entry.updatedAt = new Date().toISOString();
  saveWishlist();
  renderWishlist();
  renderDashboard();
  setFeedback(dom.wishlistFeedback, 'Wunschlisteneintrag gespeichert.', 'success');
}

function removeWishlistEntry(cardId) {
  const index = state.wishlist.findIndex((entry) => entry.id === cardId);
  if (index === -1) {
    return;
  }
  const [removed] = state.wishlist.splice(index, 1);
  saveWishlist();
  renderWishlist();
  renderDashboard();
  setFeedback(dom.wishlistFeedback, `${removed.name} von der Wunschliste entfernt.`, 'success');
}

function moveWishlistEntryToCollection(cardId, payload) {
  addToCollection(cardId, payload);
  removeWishlistEntry(cardId);
}

function renderCollection() {
  if (!dom.collectionGrid) {
    return;
  }
  const filters = {
    setId: dom.collectionSetFilter?.value || '',
    series: dom.collectionSeriesFilter?.value || '',
    rarity: dom.collectionRarityFilter?.value || '',
    type: dom.collectionTypeFilter?.value || '',
    condition: dom.collectionConditionFilter?.value || '',
    language: dom.collectionLanguageFilter?.value || '',
    sort: dom.collectionSort?.value || 'name'
  };

  let entries = [...state.collection];
  if (filters.setId) {
    entries = entries.filter((entry) => entry.setId === filters.setId);
  }
  if (filters.series) {
    entries = entries.filter((entry) => entry.setSeries === filters.series);
  }
  if (filters.rarity) {
    entries = entries.filter((entry) => entry.rarity === filters.rarity);
  }
  if (filters.type) {
    entries = entries.filter((entry) => entry.types?.includes(filters.type));
  }
  if (filters.condition) {
    entries = entries.filter((entry) => entry.condition === filters.condition);
  }
  if (filters.language) {
    entries = entries.filter((entry) => entry.language === filters.language);
  }

  switch (filters.sort) {
    case '-value':
      entries.sort((a, b) => (getEntryValue(b) - getEntryValue(a)) || a.name.localeCompare(b.name, 'de'));
      break;
    case 'value':
      entries.sort((a, b) => (getEntryValue(a) - getEntryValue(b)) || a.name.localeCompare(b.name, 'de'));
      break;
    case 'set':
      entries.sort((a, b) => {
        const setCompare = a.setName.localeCompare(b.setName, 'de');
        if (setCompare !== 0) {
          return setCompare;
        }
        const numberA = Number.parseInt(a.number, 10) || 0;
        const numberB = Number.parseInt(b.number, 10) || 0;
        return numberA - numberB;
      });
      break;
    case 'added':
      entries.sort((a, b) => new Date(b.updatedAt || b.addedAt || 0) - new Date(a.updatedAt || a.addedAt || 0));
      break;
    default:
      entries.sort((a, b) => a.name.localeCompare(b.name, 'de'));
      break;
  }

  dom.collectionGrid.innerHTML = '';
  if (!entries.length) {
    dom.collectionEmptyState.style.display = 'block';
  } else {
    dom.collectionEmptyState.style.display = 'none';
    const fragment = document.createDocumentFragment();
    entries.forEach((entry) => {
      fragment.append(createCollectionCard(entry));
    });
    dom.collectionGrid.append(fragment);
  }

  renderCollectionSummary(entries);
}

function createCollectionCard(entry) {
  const template = dom.collectionItemTemplate;
  if (!template) {
    throw new Error('Sammlungsvorlage fehlt');
  }
  const element = template.content.firstElementChild.cloneNode(true);
  element.dataset.cardId = entry.id;

  const image = element.querySelector('.card-image');
  image.src = entry.images?.small || entry.images?.large || '';
  image.alt = `${entry.name} (${entry.setName || 'Pokémon TCG'})`;

  element.querySelector('.card-title').textContent = entry.name;
  element.querySelector('.card-subtitle').textContent = [entry.setSeries, entry.setName].filter(Boolean).join(' · ');

  const metaList = element.querySelector('.card-meta');
  metaList.innerHTML = '';
  const metaParts = [];
  if (entry.number) metaParts.push(`Nr. ${entry.number}`);
  if (entry.rarity) metaParts.push(entry.rarity);
  if (entry.types?.length) metaParts.push(entry.types.join(', '));
  metaParts.push(`Menge: ${entry.quantity}`);
  if (entry.condition) metaParts.push(`Zustand: ${getConditionLabel(entry.condition)}`);
  if (entry.language) metaParts.push(entry.language);
  metaParts.forEach((part) => {
    const li = document.createElement('li');
    li.textContent = part;
    metaList.append(li);
  });

  const priceElement = element.querySelector('.card-price');
  const value = getEntryValue(entry);
  if (value) {
    priceElement.textContent = `${formatCurrency(value)} (${getValuationLabel()})`;
  } else {
    priceElement.textContent = 'Kein Marktwert verfügbar';
  }

  const notesElement = element.querySelector('.card-notes');
  const notes = [];
  if (entry.purchasePrice !== null) {
    const date = entry.purchaseDate ? ` am ${formatDate(entry.purchaseDate)}` : '';
    notes.push(`Kaufpreis: ${formatCurrency(entry.purchasePrice)}${date}`);
  }
  if (entry.notes) {
    notes.push(entry.notes);
  }
  notesElement.textContent = notes.join(' · ');

  const badges = element.querySelector('.card-badges');
  badges.innerHTML = '';
  if (entry.targetPrice !== null) {
    badges.append(createBadge(`Alarm: ${formatCurrency(entry.targetPrice)}`));
  }
  if (entry.priority) {
    badges.append(createBadge(PRIORITY_LABELS[entry.priority] ?? entry.priority));
  }

  return element;
}

function renderCollectionSummary(entries) {
  if (!dom.collectionSummary) {
    return;
  }
  const totalCards = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  const uniqueCards = entries.length;
  const totalValue = entries.reduce((sum, entry) => sum + getEntryValue(entry), 0);
  const averageValue = uniqueCards ? totalValue / uniqueCards : 0;

  dom.collectionSummary.innerHTML = '';
  const data = [
    { label: 'Gesamtwert', value: formatCurrency(totalValue) },
    { label: 'Einträge', value: uniqueCards.toString() },
    { label: 'Karten gesamt', value: totalCards.toString() },
    { label: 'Ø pro Karte', value: formatCurrency(averageValue) }
  ];
  data.forEach((item) => {
    const summary = document.createElement('div');
    summary.className = 'summary-card';
    const value = document.createElement('strong');
    value.textContent = item.value;
    const label = document.createElement('span');
    label.textContent = item.label;
    summary.append(value, label);
    dom.collectionSummary.append(summary);
  });
}

function renderWishlist() {
  if (!dom.wishlistGrid) {
    return;
  }
  dom.wishlistGrid.innerHTML = '';
  if (!state.wishlist.length) {
    dom.wishlistEmptyState.style.display = 'block';
    return;
  }
  dom.wishlistEmptyState.style.display = 'none';
  const fragment = document.createDocumentFragment();
  const sorted = [...state.wishlist].sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const priorityCompare = (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1);
    if (priorityCompare !== 0) {
      return priorityCompare;
    }
    return a.name.localeCompare(b.name, 'de');
  });
  sorted.forEach((entry) => {
    fragment.append(createWishlistCard(entry));
  });
  dom.wishlistGrid.append(fragment);
}

function createWishlistCard(entry) {
  const template = dom.wishlistItemTemplate;
  if (!template) {
    throw new Error('Wunschlistenvorlage fehlt');
  }
  const element = template.content.firstElementChild.cloneNode(true);
  element.dataset.cardId = entry.id;

  const image = element.querySelector('.card-image');
  image.src = entry.images?.small || entry.images?.large || '';
  image.alt = `${entry.name} (${entry.setName || 'Pokémon TCG'})`;

  element.querySelector('.card-title').textContent = entry.name;
  element.querySelector('.card-subtitle').textContent = [entry.setSeries, entry.setName].filter(Boolean).join(' · ');

  const metaList = element.querySelector('.card-meta');
  metaList.innerHTML = '';
  const metaParts = [];
  if (entry.number) metaParts.push(`Nr. ${entry.number}`);
  if (entry.rarity) metaParts.push(entry.rarity);
  if (entry.quantity) metaParts.push(`Anzahl: ${entry.quantity}`);
  metaParts.push(PRIORITY_LABELS[entry.priority] ?? entry.priority);
  metaParts.forEach((part) => {
    const li = document.createElement('li');
    li.textContent = part;
    metaList.append(li);
  });

  const priceElement = element.querySelector('.card-price');
  const value = entry.market?.[state.settings.valuationMode];
  if (value !== null && value !== undefined) {
    priceElement.textContent = `${getValuationLabel()}: ${formatCurrency(value)}`;
  } else {
    priceElement.textContent = 'Kein Marktwert verfügbar';
  }

  const targetElement = element.querySelector('.card-target');
  if (entry.targetPrice !== null) {
    targetElement.textContent = `Zielpreis: ${formatCurrency(entry.targetPrice)} (${entry.targetPriceCurrency ?? state.settings.currency})`;
  } else {
    targetElement.textContent = 'Kein Zielpreis definiert';
  }

  const badges = element.querySelector('.card-badges');
  badges.innerHTML = '';
  if (entry.market?.timestamp) {
    badges.append(createBadge(formatRelativeTime(entry.market.timestamp)));
  }

  return element;
}

function renderDeckList() {
  if (!dom.deckList) {
    return;
  }
  dom.deckList.innerHTML = '';
  if (!state.decks.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Noch keine Decks angelegt.';
    dom.deckList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  state.decks.forEach((deck) => {
    fragment.append(createDeckListItem(deck));
  });
  dom.deckList.append(fragment);
}

function createDeckListItem(deck) {
  const template = dom.deckListItemTemplate;
  if (!template) {
    throw new Error('Decklisten-Vorlage fehlt');
  }
  const element = template.content.firstElementChild.cloneNode(true);
  element.dataset.deckId = deck.id;
  element.classList.toggle('is-active', deck.id === state.selectedDeckId);

  const button = element.querySelector('.deck-select-button');
  button.textContent = deck.name;

  const meta = element.querySelector('.deck-meta');
  const mainCount = deck.cards.filter((card) => card.category === 'main').reduce((sum, card) => sum + card.quantity, 0);
  meta.textContent = `${CATEGORY_LABELS.main}: ${mainCount} · Format: ${deck.format}`;

  return element;
}

function selectDeck(deckId) {
  state.selectedDeckId = deckId;
  renderDeckList();
  renderDeckDetail();
}

function renderDeckDetail() {
  if (!dom.deckDetail) {
    return;
  }
  const deck = state.decks.find((item) => item.id === state.selectedDeckId);
  dom.deckDetail.innerHTML = '';
  if (!deck) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Wähle ein Deck oder lege ein neues an.';
    dom.deckDetail.append(empty);
    return;
  }

  const header = document.createElement('div');
  header.className = 'deck-summary';
  const mainCount = deck.cards.filter((card) => card.category === 'main').reduce((sum, item) => sum + item.quantity, 0);
  const sideCount = deck.cards.filter((card) => card.category === 'side').reduce((sum, item) => sum + item.quantity, 0);
  const extraCount = deck.cards.filter((card) => card.category === 'extra').reduce((sum, item) => sum + item.quantity, 0);

  header.append(createSummaryCard('Hauptdeck', `${mainCount}/60`));
  header.append(createSummaryCard('Sideboard', `${sideCount}/15`));
  header.append(createSummaryCard('Extra', `${extraCount}`));

  const warnings = validateDeck(deck);
  if (warnings.length) {
    const warningList = document.createElement('ul');
    warningList.className = 'alerts-list';
    warnings.forEach((warning) => {
      const li = document.createElement('li');
      li.className = 'alert';
      const title = document.createElement('strong');
      title.textContent = 'Regelhinweis';
      const message = document.createElement('p');
      message.textContent = warning;
      li.append(title, message);
      warningList.append(li);
    });
    dom.deckDetail.append(warningList);
  }

  dom.deckDetail.append(header);
  dom.deckDetail.append(createDeckTable(deck));

  if (deck.notes) {
    const notes = document.createElement('p');
    notes.textContent = `Notizen: ${deck.notes}`;
    dom.deckDetail.append(notes);
  }
}

function createSummaryCard(label, value) {
  const element = document.createElement('div');
  element.className = 'summary-card';
  const strong = document.createElement('strong');
  strong.textContent = value;
  const span = document.createElement('span');
  span.textContent = label;
  element.append(strong, span);
  return element;
}

function createDeckTable(deck) {
  const table = document.createElement('table');
  const tbody = document.createElement('tbody');

  const groups = ['main', 'side', 'extra'];
  groups.forEach((category) => {
    const cards = deck.cards.filter((card) => card.category === category);
    if (!cards.length) {
      return;
    }
    const headerRow = document.createElement('tr');
    const headerCell = document.createElement('th');
    headerCell.colSpan = 4;
    headerCell.textContent = CATEGORY_LABELS[category];
    headerRow.append(headerCell);
    tbody.append(headerRow);

    cards.sort((a, b) => a.name.localeCompare(b.name, 'de')).forEach((card) => {
      const row = document.createElement('tr');
      const quantityCell = document.createElement('td');
      quantityCell.textContent = card.quantity.toString();
      const nameCell = document.createElement('td');
      nameCell.textContent = card.name;
      const infoCell = document.createElement('td');
      infoCell.textContent = `${card.setName ?? ''} ${card.number ?? ''}`.trim();
      const actionsCell = document.createElement('td');
      actionsCell.append(
        createDeckActionButton('−', 'decrease-deck-card', card.cardId, category),
        createDeckActionButton('+', 'increase-deck-card', card.cardId, category),
        createDeckActionButton('Entfernen', 'remove-deck-card', card.cardId, category)
      );
      row.append(quantityCell, nameCell, infoCell, actionsCell);
      tbody.append(row);
    });
  });

  table.append(tbody);
  return table;
}

function createDeckActionButton(label, action, cardId, category) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary';
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.cardId = cardId;
  button.dataset.category = category;
  return button;
}

function renderAccountSection() {
  if (!dom.accountStatus) {
    return;
  }
  const account = getCurrentAccount();

  if (account) {
    const isVerified = Boolean(account.isVerified);
    const statusClass = isVerified ? 'status-pill' : 'status-pill is-pending';
    const statusLabel = isVerified ? 'Verifiziert' : 'Bestätigung ausstehend';
    const verificationText = isVerified
      ? 'Dein Konto ist bestätigt. Viel Spaß beim Verwalten deiner Sammlung!'
      : 'Wir haben dir eine Bestätigungsmail gesendet. Bitte prüfe dein Postfach und bestätige den Link.';
    let metaInfo = '';
    if (isVerified) {
      const formatted = formatDate(account.verifiedAt);
      metaInfo = formatted ? `Verifiziert am ${formatted}` : '';
    } else if (account.verificationSentAt) {
      const formatted = formatDate(account.verificationSentAt);
      metaInfo = formatted ? `Letzte Mail: ${formatted}` : '';
    }

    dom.accountStatus.innerHTML = `
      <div class="account-status-card">
        <span class="${statusClass}">${statusLabel}</span>
        <strong>${escapeHtml(account.email)}</strong>
        <p>${verificationText}</p>
        ${metaInfo ? `<p class="account-status-meta">${escapeHtml(metaInfo)}</p>` : ''}
      </div>
    `;
    if (dom.accountLogoutButton) {
      dom.accountLogoutButton.hidden = false;
    }
    if (dom.resendVerificationButton) {
      dom.resendVerificationButton.hidden = isVerified;
    }
    if (dom.loginEmail && document.activeElement !== dom.loginEmail) {
      dom.loginEmail.value = account.email;
    }
  } else {
    dom.accountStatus.innerHTML = '<p class="account-hint">Melde dich an oder registriere dich, um Verifizierungslinks zu erhalten und deine Sammlung zu sichern.</p>';
    if (dom.accountLogoutButton) {
      dom.accountLogoutButton.hidden = true;
    }
    if (dom.resendVerificationButton) {
      dom.resendVerificationButton.hidden = true;
    }
    if (dom.loginEmail && document.activeElement !== dom.loginEmail) {
      dom.loginEmail.value = '';
    }
  }

  if (state.accountVerificationResult) {
    setFeedback(dom.accountLoginFeedback, state.accountVerificationResult.message, state.accountVerificationResult.type);
    state.accountVerificationResult = null;
  }
}

function renderDeckPickerOptions() {
  if (!dom.deckPickerSelect) {
    return;
  }
  dom.deckPickerSelect.innerHTML = '';
  if (!state.decks.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Kein Deck vorhanden';
    dom.deckPickerSelect.append(option);
    return;
  }
  state.decks.forEach((deck) => {
    const option = document.createElement('option');
    option.value = deck.id;
    option.textContent = deck.name;
    dom.deckPickerSelect.append(option);
  });
}

function openDeckPicker(card) {
  if (!state.decks.length) {
    setFeedback(dom.deckFeedback, 'Bitte lege zuerst ein Deck an.', 'error');
    return;
  }
  dom.deckPickerCardId.value = card.id;
  dom.deckPickerCardInfo.textContent = `${card.name} (${card.set?.name ?? 'Pokémon TCG'})`;
  dom.deckPickerQuantity.value = '1';
  dom.deckPickerDialog.showModal();
}

function openDeckEditor(deck) {
  dom.deckEditorId.value = deck?.id ?? '';
  dom.deckEditorTitle.textContent = deck ? 'Deck bearbeiten' : 'Deck anlegen';
  dom.deckNameInput.value = deck?.name ?? '';
  dom.deckFormatSelect.value = deck?.format ?? 'standard';
  dom.deckNotesInput.value = deck?.notes ?? '';
  dom.deckEditorDialog.showModal();
}

function addCardToDeck(deck, card, quantity, category) {
  const existing = getDeckCard(deck, card.id, category);
  const maxCopies = card.supertype === 'Energy' && card.subtypes?.includes('Basic') ? 99 : 4;
  if (existing) {
    existing.quantity = Math.min(maxCopies, existing.quantity + quantity);
  } else {
    deck.cards.push({
      cardId: card.id,
      name: card.name,
      quantity: Math.min(maxCopies, quantity),
      category,
      setName: card.set?.name ?? '',
      number: card.number ?? '',
      supertype: card.supertype ?? '',
      subtypes: card.subtypes ?? []
    });
  }
  deck.updatedAt = new Date().toISOString();
  saveDecks();
  renderDeckDetail();
  renderDeckList();
  renderDeckPickerOptions();
  setFeedback(dom.deckFeedback, `${card.name} wurde dem Deck ${deck.name} hinzugefügt.`, 'success');
}

function getDeckCard(deck, cardId, category) {
  return deck.cards.find((item) => item.cardId === cardId && item.category === category);
}

function updateDeckCardQuantity(deck, cardId, category, quantity) {
  const card = getDeckCard(deck, cardId, category);
  if (!card) {
    return;
  }
  if (quantity <= 0) {
    deck.cards = deck.cards.filter((item) => !(item.cardId === cardId && item.category === category));
  } else {
    const maxCopies = card.supertype === 'Energy' && card.subtypes?.includes('Basic') ? 99 : 4;
    card.quantity = Math.min(maxCopies, quantity);
  }
  deck.updatedAt = new Date().toISOString();
  saveDecks();
  renderDeckDetail();
  renderDeckList();
}

function deleteDeck(deckId) {
  if (!confirm('Soll dieses Deck wirklich gelöscht werden?')) {
    return;
  }
  const index = state.decks.findIndex((deck) => deck.id === deckId);
  if (index === -1) {
    return;
  }
  state.decks.splice(index, 1);
  if (state.selectedDeckId === deckId) {
    state.selectedDeckId = state.decks[0]?.id ?? null;
  }
  saveDecks();
  renderDeckList();
  renderDeckDetail();
  renderDeckPickerOptions();
  setFeedback(dom.deckFeedback, 'Deck gelöscht.', 'success');
}

function validateDeck(deck) {
  const warnings = [];
  const mainCount = deck.cards.filter((card) => card.category === 'main').reduce((sum, item) => sum + item.quantity, 0);
  if (mainCount !== 60) {
    warnings.push('Ein Standarddeck muss exakt 60 Karten im Hauptdeck enthalten.');
  }
  deck.cards.filter((card) => card.category === 'main').forEach((card) => {
    const maxCopies = card.supertype === 'Energy' && card.subtypes?.includes('Basic') ? Infinity : 4;
    if (card.quantity > maxCopies) {
      warnings.push(`${card.name} überschreitet die erlaubte Anzahl von ${maxCopies === Infinity ? 'unendlich' : maxCopies} Kopien.`);
    }
  });
  return warnings;
}

function renderDashboard() {
  renderDashboardOverview();
  renderSetProgress();
  renderDistributions();
  renderPriceAlerts();
}

function renderDashboardOverview() {
  if (!dom.dashboardOverview) {
    return;
  }
  const totalValue = state.collection.reduce((sum, entry) => sum + getEntryValue(entry), 0);
  const ownedSets = new Set(state.collection.map((entry) => entry.setId).filter(Boolean)).size;
  const wishlistValue = state.wishlist.reduce((sum, entry) => sum + (entry.market?.[state.settings.valuationMode] ?? 0), 0);
  const priceUpdateInfo = state.settings.lastPriceUpdate
    ? formatRelativeTime(state.settings.lastPriceUpdate)
    : 'Noch nicht aktualisiert';

  const cardsOwned = state.collection.reduce((sum, entry) => sum + entry.quantity, 0);
  const cardsWishlist = state.wishlist.reduce((sum, entry) => sum + entry.quantity, 0);

  dom.dashboardOverview.innerHTML = '';
  const data = [
    { label: 'Wert der Sammlung', value: formatCurrency(totalValue) },
    { label: 'Sets vertreten', value: ownedSets.toString() },
    { label: 'Wert Wunschliste', value: formatCurrency(wishlistValue) },
    { label: 'Letztes Preisupdate', value: priceUpdateInfo },
    { label: 'Karten gesamt', value: cardsOwned.toString() },
    { label: 'Wunschkarten', value: cardsWishlist.toString() }
  ];
  data.forEach((item) => {
    const summary = document.createElement('div');
    summary.className = 'summary-card';
    const value = document.createElement('strong');
    value.textContent = item.value;
    const label = document.createElement('span');
    label.textContent = item.label;
    summary.append(value, label);
    dom.dashboardOverview.append(summary);
  });
}

function renderSetProgress() {
  if (!dom.setProgressList) {
    return;
  }
  dom.setProgressList.innerHTML = '';
  if (!state.collection.length || !state.sets.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Füge Karten hinzu, um den Set-Fortschritt zu sehen.';
    dom.setProgressList.append(empty);
    return;
  }

  const grouped = new Map();
  state.collection.forEach((entry) => {
    if (!entry.setId) {
      return;
    }
    const existing = grouped.get(entry.setId) || { count: 0, set: state.sets.find((set) => set.id === entry.setId) };
    existing.count += entry.quantity;
    grouped.set(entry.setId, existing);
  });

  const items = Array.from(grouped.values())
    .filter((item) => item.set)
    .sort((a, b) => new Date(b.set.releaseDate || 0) - new Date(a.set.releaseDate || 0))
    .slice(0, 10);

  items.forEach((item) => {
    const progressItem = document.createElement('div');
    progressItem.className = 'progress-item';
    const label = document.createElement('span');
    label.textContent = `${item.set.name} (${item.count}/${item.set.total ?? '?'})`;
    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    const inner = document.createElement('span');
    const percent = item.set.total ? Math.min(100, Math.round((item.count / item.set.total) * 100)) : 0;
    inner.style.width = `${percent}%`;
    bar.append(inner);
    progressItem.append(label, bar);
    dom.setProgressList.append(progressItem);
  });
}

function renderDistributions() {
  renderDistribution(dom.rarityDistribution, computeDistribution(state.collection, (entry) => entry.rarity || 'Unbekannt'), 'Raritäten');
  renderDistribution(dom.conditionDistribution, computeDistribution(state.collection, (entry) => getConditionLabel(entry.condition || 'unbekannt')), 'Zustände');
}

function computeDistribution(entries, selector) {
  const distribution = new Map();
  entries.forEach((entry) => {
    const key = selector(entry);
    const current = distribution.get(key) || 0;
    distribution.set(key, current + entry.quantity);
  });
  const total = Array.from(distribution.values()).reduce((sum, value) => sum + value, 0);
  return Array.from(distribution.entries()).map(([label, count]) => ({
    label,
    count,
    percent: total ? Math.round((count / total) * 100) : 0
  }));
}

function renderDistribution(container, data, fallbackLabel) {
  if (!container) {
    return;
  }
  container.innerHTML = '';
  if (!data.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = `Noch keine Daten für ${fallbackLabel}.`;
    container.append(empty);
    return;
  }
  data
    .sort((a, b) => b.count - a.count)
    .forEach((item) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'progress-item';
      const label = document.createElement('span');
      label.textContent = `${item.label} – ${item.count} (${item.percent}%)`;
      const bar = document.createElement('div');
      bar.className = 'progress-bar';
      const inner = document.createElement('span');
      inner.style.width = `${item.percent}%`;
      bar.append(inner);
      wrapper.append(label, bar);
      container.append(wrapper);
    });
}

function renderPriceAlerts() {
  if (!dom.alertsList) {
    return;
  }
  dom.alertsList.innerHTML = '';
  const alerts = [];

  state.collection.forEach((entry) => {
    if (entry.targetPrice !== null) {
      const currentValue = getEntryValue(entry);
      if (currentValue && currentValue <= entry.targetPrice) {
        alerts.push({
          id: entry.id,
          name: entry.name,
          message: `${entry.name} liegt mit ${formatCurrency(currentValue)} unter deinem Zielpreis von ${formatCurrency(entry.targetPrice)}.`
        });
      }
    }
  });

  state.wishlist.forEach((entry) => {
    if (entry.targetPrice !== null) {
      const marketValue = entry.market?.[state.settings.valuationMode];
      if (marketValue && marketValue <= entry.targetPrice) {
        alerts.push({
          id: entry.id,
          name: entry.name,
          message: `${entry.name} ist aktuell für ${formatCurrency(marketValue)} verfügbar (Zielpreis ${formatCurrency(entry.targetPrice)}).`
        });
      }
    }
  });

  if (!alerts.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Noch keine Preisalarme erreicht.';
    dom.alertsList.append(empty);
    return;
  }

  alerts.forEach((alert) => {
    dom.alertsList.append(createAlertElement(alert));
  });
}

function createAlertElement(alert) {
  const template = dom.alertTemplate;
  if (!template) {
    const fallback = document.createElement('div');
    fallback.className = 'alert';
    const title = document.createElement('strong');
    title.textContent = alert.name;
    const message = document.createElement('p');
    message.textContent = alert.message;
    fallback.append(title, message);
    return fallback;
  }
  const element = template.content.firstElementChild.cloneNode(true);
  element.dataset.cardId = alert.id;
  element.querySelector('.alert-title').textContent = alert.name;
  element.querySelector('.alert-message').textContent = alert.message;
  return element;
}

function loadCollection() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.collection) ?? localStorage.getItem(LEGACY_STORAGE_KEYS.collection);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(normalizeCollectionEntry);
  } catch (error) {
    console.warn('Konnte Sammlung nicht laden.', error);
    return [];
  }
}

function saveCollection() {
  try {
    localStorage.setItem(STORAGE_KEYS.collection, JSON.stringify(state.collection));
  } catch (error) {
    console.warn('Konnte Sammlung nicht speichern.', error);
  }
}

function loadWishlist() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.wishlist);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(normalizeWishlistEntry);
  } catch (error) {
    console.warn('Konnte Wunschliste nicht laden.', error);
    return [];
  }
}

function saveWishlist() {
  try {
    localStorage.setItem(STORAGE_KEYS.wishlist, JSON.stringify(state.wishlist));
  } catch (error) {
    console.warn('Konnte Wunschliste nicht speichern.', error);
  }
}

function loadDecks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.decks);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((deck) => ({
      ...deck,
      cards: Array.isArray(deck.cards) ? deck.cards : []
    }));
  } catch (error) {
    console.warn('Konnte Decks nicht laden.', error);
    return [];
  }
}

function saveDecks() {
  try {
    localStorage.setItem(STORAGE_KEYS.decks, JSON.stringify(state.decks));
  } catch (error) {
    console.warn('Konnte Decks nicht speichern.', error);
  }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      exchangeRates: {
        ...DEFAULT_SETTINGS.exchangeRates,
        ...(parsed?.exchangeRates ?? {})
      }
    };
  } catch (error) {
    console.warn('Konnte Einstellungen nicht laden.', error);
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
  } catch (error) {
    console.warn('Konnte Einstellungen nicht speichern.', error);
  }
}

function loadApiKey() {
  try {
    return localStorage.getItem(STORAGE_KEYS.apiKey) ?? localStorage.getItem(LEGACY_STORAGE_KEYS.apiKey) ?? '';
  } catch (error) {
    console.warn('Konnte API-Schlüssel nicht laden.', error);
    return '';
  }
}

function saveApiKey(key) {
  try {
    if (key) {
      localStorage.setItem(STORAGE_KEYS.apiKey, key);
    } else {
      localStorage.removeItem(STORAGE_KEYS.apiKey);
    }
  } catch (error) {
    console.warn('Konnte API-Schlüssel nicht speichern.', error);
  }
}

function loadAccounts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.accounts);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map(normalizeAccount)
      .filter((account) => account);
  } catch (error) {
    console.warn('Konnte Konten nicht laden.', error);
    return [];
  }
}

function saveAccounts() {
  try {
    localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(state.accounts));
  } catch (error) {
    console.warn('Konnte Konten nicht speichern.', error);
  }
}

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.session);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.currentUserId === 'string') {
      const exists = state.accounts.some((account) => account.id === parsed.currentUserId);
      if (exists) {
        return parsed.currentUserId;
      }
      localStorage.removeItem(STORAGE_KEYS.session);
    }
    return null;
  } catch (error) {
    console.warn('Konnte Sitzung nicht laden.', error);
    return null;
  }
}

function saveSession() {
  try {
    if (state.currentUserId) {
      localStorage.setItem(STORAGE_KEYS.session, JSON.stringify({ currentUserId: state.currentUserId }));
    } else {
      localStorage.removeItem(STORAGE_KEYS.session);
    }
  } catch (error) {
    console.warn('Konnte Sitzung nicht speichern.', error);
  }
}

function loadEmailConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.emailConfig);
    if (!raw) {
      return { ...DEFAULT_EMAIL_CONFIG };
    }
    const parsed = JSON.parse(raw);
    return normalizeEmailConfig(parsed);
  } catch (error) {
    console.warn('Konnte E-Mail Einstellungen nicht laden.', error);
    return { ...DEFAULT_EMAIL_CONFIG };
  }
}

function saveEmailConfig() {
  try {
    localStorage.setItem(STORAGE_KEYS.emailConfig, JSON.stringify(state.emailConfig));
  } catch (error) {
    console.warn('Konnte E-Mail Einstellungen nicht speichern.', error);
  }
}

function normalizeAccount(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const email = typeof entry.email === 'string' ? entry.email.trim().toLowerCase() : '';
  const passwordHash = typeof entry.passwordHash === 'string' ? entry.passwordHash : '';
  if (!email || !passwordHash) {
    return null;
  }
  const hasCryptoUUID = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function';
  const id = typeof entry.id === 'string' && entry.id
    ? entry.id
    : hasCryptoUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const createdAt = entry.createdAt ?? new Date().toISOString();
  const updatedAt = entry.updatedAt ?? createdAt;
  const isVerified = Boolean(entry.isVerified);
  return {
    id,
    email,
    passwordHash,
    createdAt,
    updatedAt,
    isVerified,
    verificationToken: entry.verificationToken ?? null,
    verificationSentAt: entry.verificationSentAt ?? null,
    verifiedAt: entry.verifiedAt ?? (isVerified ? entry.verifiedAt ?? updatedAt ?? createdAt : null)
  };
}

function normalizeEmailConfig(config) {
  if (!config || typeof config !== 'object') {
    return { ...DEFAULT_EMAIL_CONFIG };
  }
  return {
    serviceId: (config.serviceId ?? '').toString().trim(),
    templateId: (config.templateId ?? '').toString().trim(),
    publicKey: (config.publicKey ?? '').toString().trim(),
    senderName: (config.senderName ?? '').toString().trim() || DEFAULT_EMAIL_CONFIG.senderName
  };
}

function normalizeCollectionEntry(entry) {
  return {
    id: entry.id,
    name: entry.name,
    number: entry.number ?? '',
    setId: entry.setId ?? entry.set?.id ?? '',
    setName: entry.setName ?? entry.set?.name ?? '',
    setSeries: entry.setSeries ?? entry.set?.series ?? '',
    rarity: entry.rarity ?? '',
    supertype: entry.supertype ?? '',
    subtypes: entry.subtypes ?? [],
    types: entry.types ?? [],
    regulationMark: entry.regulationMark ?? '',
    artist: entry.artist ?? '',
    images: entry.images ?? {},
    url: entry.url ?? createDetailsUrl(entry.id),
    quantity: Number(entry.quantity) || 1,
    condition: entry.condition ?? 'nearMint',
    language: entry.language ?? 'Deutsch',
    edition: entry.edition ?? 'standard',
    purchasePrice: entry.purchasePrice ?? null,
    purchaseDate: entry.purchaseDate ?? null,
    purchaseHistory: Array.isArray(entry.purchaseHistory) ? entry.purchaseHistory : [],
    targetPrice: entry.targetPrice ?? null,
    targetPriceCurrency: entry.targetPriceCurrency ?? state.settings.currency,
    priority: entry.priority ?? 'medium',
    notes: entry.notes ?? '',
    market: entry.market ?? { lowest: null, average: null, highest: null, currency: state.settings.currency, timestamp: null },
    marketSources: entry.marketSources ?? [],
    priceHistory: Array.isArray(entry.priceHistory) ? entry.priceHistory : [],
    addedAt: entry.addedAt ?? new Date().toISOString(),
    updatedAt: entry.updatedAt ?? entry.addedAt ?? new Date().toISOString()
  };
}

function normalizeWishlistEntry(entry) {
  return {
    id: entry.id,
    name: entry.name,
    number: entry.number ?? '',
    setId: entry.setId ?? entry.set?.id ?? '',
    setName: entry.setName ?? entry.set?.name ?? '',
    setSeries: entry.setSeries ?? entry.set?.series ?? '',
    rarity: entry.rarity ?? '',
    supertype: entry.supertype ?? '',
    subtypes: entry.subtypes ?? [],
    types: entry.types ?? [],
    regulationMark: entry.regulationMark ?? '',
    images: entry.images ?? {},
    url: entry.url ?? createDetailsUrl(entry.id),
    quantity: Number(entry.quantity) || 1,
    targetPrice: entry.targetPrice ?? null,
    targetPriceCurrency: entry.targetPriceCurrency ?? state.settings.currency,
    priority: entry.priority ?? 'medium',
    notes: entry.notes ?? '',
    market: entry.market ?? { lowest: null, average: null, highest: null, currency: state.settings.currency, timestamp: null },
    marketSources: entry.marketSources ?? [],
    priceHistory: Array.isArray(entry.priceHistory) ? entry.priceHistory : [],
    addedAt: entry.addedAt ?? new Date().toISOString(),
    updatedAt: entry.updatedAt ?? entry.addedAt ?? new Date().toISOString()
  };
}

function applyTheme() {
  let theme = state.settings.theme;
  if (theme === 'system') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = theme;
}

function updateSetting(key, value) {
  state.settings[key] = value;
  saveSettings();
  if (key === 'theme') {
    applyTheme();
  }
  if (key === 'valuationMode') {
    renderCollection();
    renderDashboard();
    renderWishlist();
  }
}

function updateCurrency(currency) {
  if (!currency) {
    return;
  }
  const previousCurrency = state.settings.currency;
  state.settings.currency = currency;
  // Konvertiere Zielpreise in neue Basiswährung
  state.collection.forEach((entry) => {
    if (entry.targetPrice !== null && entry.targetPriceCurrency && entry.targetPriceCurrency !== currency) {
      entry.targetPrice = convertCurrency(entry.targetPrice, entry.targetPriceCurrency, currency);
      entry.targetPriceCurrency = currency;
    }
    if (entry.marketSources?.length) {
      entry.market = aggregatePriceSources(entry.marketSources, currency);
    }
  });
  state.wishlist.forEach((entry) => {
    if (entry.targetPrice !== null && entry.targetPriceCurrency && entry.targetPriceCurrency !== currency) {
      entry.targetPrice = convertCurrency(entry.targetPrice, entry.targetPriceCurrency, currency);
      entry.targetPriceCurrency = currency;
    }
    if (entry.marketSources?.length) {
      entry.market = aggregatePriceSources(entry.marketSources, currency);
    }
  });
  saveSettings();
  saveCollection();
  saveWishlist();
  renderCollection();
  renderWishlist();
  renderDashboard();
  setFeedback(dom.settingsFeedback, `Währung auf ${currency} umgestellt.`, 'success');
}

function updateExchangeRate(currency, value) {
  if (!Number.isFinite(value) || value <= 0) {
    setFeedback(dom.settingsFeedback, 'Bitte einen gültigen Wechselkurs eingeben.', 'error');
    return;
  }
  state.settings.exchangeRates[currency] = value;
  saveSettings();
  updateCurrency(state.settings.currency);
}

function resetSettings() {
  if (!confirm('Einstellungen auf Standardwerte zurücksetzen?')) {
    return;
  }
  state.settings = { ...DEFAULT_SETTINGS };
  dom.themeSelect.value = state.settings.theme;
  dom.currencySelect.value = state.settings.currency;
  dom.valuationModeSelect.value = state.settings.valuationMode;
  dom.usdRateInput.value = state.settings.exchangeRates.USD;
  dom.gbpRateInput.value = state.settings.exchangeRates.GBP;
  dom.priceIntervalInput.value = state.settings.priceIntervalDays;
  dom.settingsNotes.value = state.settings.notes;
  saveSettings();
  applyTheme();
  renderCollection();
  renderWishlist();
  renderDashboard();
  setFeedback(dom.settingsFeedback, 'Einstellungen zurückgesetzt.', 'success');
}

async function handleAccountRegistrationSubmit(event) {
  event.preventDefault();
  if (!dom.accountRegistrationForm || !dom.accountRegistrationFeedback) {
    return;
  }
  setFeedback(dom.accountRegistrationFeedback, '');
  const form = event.currentTarget instanceof HTMLFormElement ? event.currentTarget : dom.accountRegistrationForm;
  const formData = new FormData(form);
  const email = (formData.get('email') ?? '').toString().trim().toLowerCase();
  const password = (formData.get('password') ?? '').toString();
  const passwordConfirm = (formData.get('passwordConfirm') ?? '').toString();

  if (!email) {
    setFeedback(dom.accountRegistrationFeedback, 'Bitte eine E-Mail-Adresse eingeben.', 'error');
    return;
  }
  if (!isValidEmail(email)) {
    setFeedback(dom.accountRegistrationFeedback, 'Bitte eine gültige E-Mail-Adresse eingeben.', 'error');
    return;
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    setFeedback(
      dom.accountRegistrationFeedback,
      `Das Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein.`,
      'error'
    );
    return;
  }
  if (password !== passwordConfirm) {
    setFeedback(dom.accountRegistrationFeedback, 'Die Passwörter stimmen nicht überein.', 'error');
    return;
  }
  if (getAccountByEmail(email)) {
    setFeedback(dom.accountRegistrationFeedback, 'Für diese E-Mail-Adresse existiert bereits ein Konto.', 'error');
    return;
  }

  try {
    const passwordHash = await hashPassword(password);
    const timestamp = new Date().toISOString();
    const hasCryptoUUID = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function';
    const account = {
      id: hasCryptoUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      email,
      passwordHash,
      createdAt: timestamp,
      updatedAt: timestamp,
      isVerified: false,
      verificationToken: generateVerificationToken(),
      verificationSentAt: null,
      verifiedAt: null
    };
    state.accounts.push(account);
    saveAccounts();
    setCurrentUser(account.id);
    form.reset();
    if (dom.registrationPassword) {
      dom.registrationPassword.value = '';
    }
    if (dom.registrationPasswordConfirm) {
      dom.registrationPasswordConfirm.value = '';
    }
    if (dom.loginEmail && document.activeElement !== dom.loginEmail) {
      dom.loginEmail.value = email;
    }
    if (dom.loginPassword) {
      dom.loginPassword.value = '';
    }
    setFeedback(dom.accountRegistrationFeedback, 'Konto erstellt. Wir senden dir gleich eine Bestätigungsmail.', 'success');
    renderAccountSection();
    const sent = await sendVerificationEmail(account.id);
    if (sent) {
      setFeedback(dom.accountLoginFeedback, 'Bestätigungsmail wurde versendet. Bitte prüfe dein Postfach.', 'success');
      renderAccountSection();
    } else {
      setFeedback(
        dom.accountLoginFeedback,
        'Konto angelegt. Bitte hinterlege gültige E-Mail-Einstellungen, um die Bestätigungsmail zu verschicken.',
        'error'
      );
    }
  } catch (error) {
    console.error('Registrierung fehlgeschlagen', error);
    setFeedback(dom.accountRegistrationFeedback, `Die Registrierung ist fehlgeschlagen: ${getErrorMessage(error)}`, 'error');
  }
}

async function handleAccountLoginSubmit(event) {
  event.preventDefault();
  if (!dom.accountLoginForm || !dom.accountLoginFeedback) {
    return;
  }
  setFeedback(dom.accountLoginFeedback, '');
  const form = event.currentTarget instanceof HTMLFormElement ? event.currentTarget : dom.accountLoginForm;
  const formData = new FormData(form);
  const email = (formData.get('email') ?? '').toString().trim().toLowerCase();
  const password = (formData.get('password') ?? '').toString();

  if (!email) {
    setFeedback(dom.accountLoginFeedback, 'Bitte eine E-Mail-Adresse eingeben.', 'error');
    return;
  }
  if (!isValidEmail(email)) {
    setFeedback(dom.accountLoginFeedback, 'Bitte eine gültige E-Mail-Adresse eingeben.', 'error');
    return;
  }
  const account = getAccountByEmail(email);
  if (!account) {
    setFeedback(dom.accountLoginFeedback, 'Für diese E-Mail-Adresse wurde kein Konto gefunden.', 'error');
    return;
  }

  try {
    const passwordHash = await hashPassword(password);
    if (account.passwordHash !== passwordHash) {
      setFeedback(dom.accountLoginFeedback, 'Das Passwort ist nicht korrekt.', 'error');
      return;
    }
    setCurrentUser(account.id);
    if (dom.loginPassword) {
      dom.loginPassword.value = '';
    }
    renderAccountSection();
    const message = account.isVerified
      ? 'Erfolgreich angemeldet.'
      : 'Erfolgreich angemeldet. Bitte bestätige deine E-Mail-Adresse über den zugesandten Link.';
    setFeedback(dom.accountLoginFeedback, message, 'success');
  } catch (error) {
    console.error('Anmeldung fehlgeschlagen', error);
    setFeedback(dom.accountLoginFeedback, `Anmeldung fehlgeschlagen: ${getErrorMessage(error)}`, 'error');
  }
}

function handleAccountLogout() {
  setCurrentUser(null);
  if (dom.loginPassword) {
    dom.loginPassword.value = '';
  }
  renderAccountSection();
  setFeedback(dom.accountLoginFeedback, 'Abmeldung erfolgreich.', 'success');
}

function handleEmailConfigSubmit(event) {
  event.preventDefault();
  if (!dom.emailConfigForm || !dom.emailConfigFeedback) {
    return;
  }
  const form = event.currentTarget instanceof HTMLFormElement ? event.currentTarget : dom.emailConfigForm;
  const formData = new FormData(form);
  const config = {
    serviceId: (formData.get('serviceId') ?? '').toString().trim(),
    templateId: (formData.get('templateId') ?? '').toString().trim(),
    publicKey: (formData.get('publicKey') ?? '').toString().trim(),
    senderName: (formData.get('senderName') ?? '').toString().trim() || DEFAULT_EMAIL_CONFIG.senderName
  };

  if (!config.serviceId || !config.templateId || !config.publicKey) {
    setFeedback(dom.emailConfigFeedback, 'Bitte fülle alle erforderlichen Felder aus.', 'error');
    return;
  }

  state.emailConfig = config;
  state.emailClientInitialized = false;
  saveEmailConfig();
  setFeedback(dom.emailConfigFeedback, 'E-Mail Einstellungen gespeichert.', 'success');
}

async function handleResendVerification() {
  const account = getCurrentAccount();
  if (!account) {
    setFeedback(dom.accountLoginFeedback, 'Bitte melde dich zuerst an.', 'error');
    return;
  }
  if (account.isVerified) {
    setFeedback(dom.accountLoginFeedback, 'Deine E-Mail-Adresse ist bereits bestätigt.', 'success');
    return;
  }
  updateAccount(account.id, { verificationToken: generateVerificationToken() });
  const sent = await sendVerificationEmail(account.id);
  if (sent) {
    setFeedback(dom.accountLoginFeedback, 'Wir haben dir die Bestätigungsmail erneut gesendet.', 'success');
    renderAccountSection();
  } else {
    setFeedback(
      dom.accountLoginFeedback,
      'Die Bestätigungsmail konnte nicht gesendet werden. Bitte prüfe die E-Mail Einstellungen.',
      'error'
    );
  }
}

function getCurrentAccount() {
  if (!state.currentUserId) {
    return null;
  }
  return getAccountById(state.currentUserId);
}

function getAccountById(accountId) {
  if (!accountId) {
    return null;
  }
  return state.accounts.find((entry) => entry.id === accountId) ?? null;
}

function getAccountByEmail(email) {
  if (!email) {
    return null;
  }
  return state.accounts.find((entry) => entry.email === email) ?? null;
}

function setCurrentUser(accountId) {
  state.currentUserId = accountId ?? null;
  saveSession();
}

function updateAccount(accountId, updates) {
  const index = state.accounts.findIndex((entry) => entry.id === accountId);
  if (index === -1) {
    return null;
  }
  const updated = {
    ...state.accounts[index],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  state.accounts[index] = updated;
  saveAccounts();
  return updated;
}

function isEmailConfigComplete() {
  return Boolean(state.emailConfig.serviceId && state.emailConfig.templateId && state.emailConfig.publicKey);
}

async function ensureEmailClientInitialized() {
  if (!isEmailConfigComplete()) {
    throw new Error('E-Mail-Konfiguration ist unvollständig.');
  }
  if (!window.emailjs) {
    throw new Error('E-Mail Dienst konnte nicht geladen werden.');
  }
  if (!state.emailClientInitialized) {
    window.emailjs.init(state.emailConfig.publicKey);
    state.emailClientInitialized = true;
  }
}

async function sendVerificationEmail(accountId) {
  const account = getAccountById(accountId);
  if (!account) {
    return false;
  }
  if (!isEmailConfigComplete()) {
    setFeedback(dom.emailConfigFeedback, 'Bitte hinterlege deine EmailJS-Daten, um E-Mails versenden zu können.', 'error');
    return false;
  }

  let token = account.verificationToken;
  if (!token) {
    const updated = updateAccount(account.id, { verificationToken: generateVerificationToken() });
    token = updated?.verificationToken ?? token;
  }
  const verificationUrl = generateVerificationUrl(token);
  const templateParams = {
    to_email: account.email,
    verification_url: verificationUrl,
    to_name: account.email.split('@')[0] || account.email,
    sender_name: state.emailConfig.senderName || DEFAULT_EMAIL_CONFIG.senderName
  };

  try {
    await ensureEmailClientInitialized();
    await window.emailjs.send(state.emailConfig.serviceId, state.emailConfig.templateId, templateParams);
    updateAccount(account.id, { verificationSentAt: new Date().toISOString() });
    return true;
  } catch (error) {
    console.error('Bestätigungsmail konnte nicht versendet werden', error);
    setFeedback(dom.emailConfigFeedback, `Bestätigungsmail konnte nicht versendet werden: ${getErrorMessage(error)}`, 'error');
    return false;
  }
}

function generateVerificationToken() {
  const hasCryptoUUID = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function';
  if (hasCryptoUUID) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function generateVerificationUrl(token) {
  const url = new URL(window.location.href);
  url.searchParams.set('verify', token);
  url.hash = '';
  return url.toString();
}

async function hashPassword(password) {
  try {
    const hasSubtle = typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function';
    if (!hasSubtle) {
      return `${PASSWORD_HASH_SALT}:${password}`;
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(`${PASSWORD_HASH_SALT}:${password}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  } catch (error) {
    console.error('Passworthash fehlgeschlagen', error);
    return `${PASSWORD_HASH_SALT}:${password}`;
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function handleVerificationFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('verify');
  if (!token) {
    return;
  }

  params.delete('verify');
  const newQuery = params.toString();
  const newUrl = `${window.location.pathname}${newQuery ? `?${newQuery}` : ''}${window.location.hash}`;
  window.history.replaceState({}, document.title, newUrl);

  const account = state.accounts.find((entry) => entry.verificationToken === token);
  if (!account) {
    state.accountVerificationResult = {
      type: 'error',
      message: 'Der Verifizierungslink ist ungültig oder wurde bereits verwendet.'
    };
    return;
  }

  updateAccount(account.id, { isVerified: true, verifiedAt: new Date().toISOString(), verificationToken: null });
  setCurrentUser(account.id);
  state.accountVerificationResult = { type: 'success', message: 'E-Mail-Adresse erfolgreich bestätigt.' };
}

function clearAllData() {
  if (!confirm('Möchtest du wirklich alle Daten löschen? Dies kann nicht rückgängig gemacht werden.')) {
    return;
  }
  state.collection = [];
  state.wishlist = [];
  state.decks = [];
  state.accounts = [];
  state.currentUserId = null;
  state.emailConfig = { ...DEFAULT_EMAIL_CONFIG };
  state.emailClientInitialized = false;
  state.accountVerificationResult = null;
  state.settings = { ...DEFAULT_SETTINGS };
  state.selectedDeckId = null;
  state.searchResults = [];
  state.isSearching = false;
  searchCache.clear();
  cardCache.clear();
  if (activeSearchAbortController) {
    activeSearchAbortController.abort();
    activeSearchAbortController = null;
  }
  saveCollection();
  saveWishlist();
  saveDecks();
  saveSettings();
  saveAccounts();
  saveSession();
  saveEmailConfig();
  localStorage.removeItem(STORAGE_KEYS.apiKey);
  if (dom.emailServiceId) {
    dom.emailServiceId.value = state.emailConfig.serviceId ?? '';
  }
  if (dom.emailTemplateId) {
    dom.emailTemplateId.value = state.emailConfig.templateId ?? '';
  }
  if (dom.emailPublicKey) {
    dom.emailPublicKey.value = state.emailConfig.publicKey ?? '';
  }
  if (dom.emailSenderName) {
    dom.emailSenderName.value = state.emailConfig.senderName ?? '';
  }
  renderAll();
  setFeedback(dom.settingsFeedback, 'Alle Daten wurden gelöscht.', 'success');
}

function maybeSchedulePriceRefresh() {
  if (!state.settings.lastPriceUpdate) {
    return;
  }
  const last = new Date(state.settings.lastPriceUpdate);
  const diffDays = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays >= state.settings.priceIntervalDays) {
    updateAllPrices();
  }
}

function extractMarketPrices(card) {
  const sources = [];
  const baseCurrency = state.settings.currency;

  if (card.tcgplayer?.prices) {
    Object.entries(card.tcgplayer.prices).forEach(([variant, price]) => {
      sources.push({
        source: `TCGplayer ${variant}`,
        currency: 'USD',
        low: price?.low ?? null,
        average: price?.market ?? price?.mid ?? null,
        high: price?.high ?? null
      });
    });
  }
  if (card.cardmarket?.prices) {
    const price = card.cardmarket.prices;
    sources.push({
      source: 'Cardmarket',
      currency: 'EUR',
      low: price?.lowPrice ?? price?.trendPrice ?? null,
      average: price?.trendPrice ?? null,
      high: price?.avg30 ?? price?.trendPrice ?? null
    });
  }

  const aggregated = aggregatePriceSources(sources, baseCurrency);
  return { aggregated, sources };
}

function aggregatePriceSources(sources, targetCurrency) {
  let lowest = null;
  let averageSum = 0;
  let averageCount = 0;
  let highest = null;
  sources.forEach((source) => {
    if (Number.isFinite(source.low)) {
      const converted = convertCurrency(source.low, source.currency, targetCurrency);
      lowest = lowest === null ? converted : Math.min(lowest, converted);
    }
    if (Number.isFinite(source.average)) {
      const converted = convertCurrency(source.average, source.currency, targetCurrency);
      averageSum += converted;
      averageCount += 1;
    }
    if (Number.isFinite(source.high)) {
      const converted = convertCurrency(source.high, source.currency, targetCurrency);
      highest = highest === null ? converted : Math.max(highest, converted);
    }
  });
  const average = averageCount ? averageSum / averageCount : null;
  return {
    lowest,
    average,
    highest,
    currency: targetCurrency,
    timestamp: new Date().toISOString()
  };
}

function updateAllPrices() {
  if (!state.collection.length && !state.wishlist.length) {
    setFeedback(dom.settingsFeedback, 'Keine Einträge für Preisupdates vorhanden.', 'error');
    return;
  }
  setFeedback(dom.settingsFeedback, 'Aktualisiere Preise …');
  const tasks = state.collection.map((entry) => () => updateEntryPrice(entry, false))
    .concat(state.wishlist.map((entry) => () => updateWishlistPrice(entry, false)));

  runSequential(tasks).then(() => {
    state.settings.lastPriceUpdate = new Date().toISOString();
    saveSettings();
    saveCollection();
    saveWishlist();
    renderCollection();
    renderWishlist();
    renderDashboard();
    setFeedback(dom.settingsFeedback, 'Preise aktualisiert.', 'success');
  }).catch((error) => {
    console.error('Preisupdate fehlgeschlagen', error);
    setFeedback(dom.settingsFeedback, `Preisupdate fehlgeschlagen: ${getErrorMessage(error)}`, 'error');
  });
}

function updateEntryPrice(entry, render = true) {
  return getCardDetails(entry.id).then((card) => {
    if (!card) {
      return;
    }
    const { aggregated, sources } = extractMarketPrices(card);
    entry.market = aggregated;
    entry.marketSources = sources;
    entry.priceHistory = entry.priceHistory || [];
    if (aggregated.average !== null) {
      entry.priceHistory.push({
        timestamp: aggregated.timestamp,
        ...aggregated
      });
    }
    entry.updatedAt = new Date().toISOString();
    saveCollection();
    if (render) {
      renderCollection();
      renderDashboard();
    }
  });
}

function updateWishlistPrice(entry, render = true) {
  return getCardDetails(entry.id).then((card) => {
    if (!card) {
      return;
    }
    const { aggregated, sources } = extractMarketPrices(card);
    entry.market = aggregated;
    entry.marketSources = sources;
    entry.priceHistory = entry.priceHistory || [];
    if (aggregated.average !== null) {
      entry.priceHistory.push({
        timestamp: aggregated.timestamp,
        ...aggregated
      });
    }
    entry.updatedAt = new Date().toISOString();
    saveWishlist();
    if (render) {
      renderWishlist();
      renderDashboard();
    }
  });
}

function runSequential(tasks) {
  return tasks.reduce((promise, task) => promise.then(() => task()), Promise.resolve());
}

function getCardDetails(cardId) {
  if (cardCache.has(cardId)) {
    return Promise.resolve(cardCache.get(cardId));
  }
  return apiFetch(`/cards/${cardId}`).then((response) => {
    const card = response?.data;
    if (card) {
      cardCache.set(card.id, card);
    }
    return card;
  }).catch((error) => {
    console.warn('Kartendetails konnten nicht geladen werden', error);
    return null;
  });
}

function convertCurrency(amount, fromCurrency, toCurrency) {
  if (!Number.isFinite(amount)) {
    return null;
  }
  if (fromCurrency === toCurrency) {
    return amount;
  }
  const rates = {
    EUR: 1,
    USD: state.settings.exchangeRates.USD || DEFAULT_SETTINGS.exchangeRates.USD,
    GBP: state.settings.exchangeRates.GBP || DEFAULT_SETTINGS.exchangeRates.GBP
  };
  let amountInEur;
  switch (fromCurrency) {
    case 'USD':
      amountInEur = amount * rates.USD;
      break;
    case 'GBP':
      amountInEur = amount * rates.GBP;
      break;
    case 'EUR':
      amountInEur = amount;
      break;
    default:
      amountInEur = amount;
      break;
  }

  switch (toCurrency) {
    case 'USD':
      return amountInEur / rates.USD;
    case 'GBP':
      return amountInEur / rates.GBP;
    case 'EUR':
    default:
      return amountInEur;
  }
}

function getEntryValue(entry) {
  const mode = state.settings.valuationMode;
  const price = entry.market?.[mode];
  if (!Number.isFinite(price)) {
    return 0;
  }
  return price * entry.quantity;
}

function getValuationLabel() {
  switch (state.settings.valuationMode) {
    case 'lowest':
      return 'Niedrigster Preis';
    case 'highest':
      return 'Höchster Preis';
    default:
      return 'Durchschnittspreis';
  }
}

function getConditionLabel(condition) {
  const option = CONDITION_OPTIONS.find((item) => item.value === condition);
  return option ? option.label : condition;
}

function formatCurrency(amount) {
  if (!Number.isFinite(amount)) {
    return '–';
  }
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: state.settings.currency,
    maximumFractionDigits: 2
  }).format(amount);
}

function formatDate(dateString) {
  if (!dateString) {
    return '';
  }
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('de-DE', { year: 'numeric', month: 'short' }).format(date);
}

function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / (1000 * 60));
  if (diffMinutes < 60) {
    return `vor ${diffMinutes} Minuten`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `vor ${diffHours} Stunden`;
  }
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) {
    return `vor ${diffDays} Tagen`;
  }
  const diffMonths = Math.round(diffDays / 30);
  if (diffMonths < 12) {
    return `vor ${diffMonths} Monaten`;
  }
  const diffYears = Math.round(diffMonths / 12);
  return `vor ${diffYears} Jahren`;
}

function escapeHtml(text) {
  return text.replace(/[&<>"]+/g, (match) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  })[match] || match);
}

function escapeQueryValue(value) {
  return value.replace(/"/g, '\\"');
}

function createDetailsUrl(cardId) {
  return `https://pokemontcg.io/card/${cardId}`;
}

function showGlobalFeedback(message, type) {
  const feedback = document.createElement('div');
  feedback.className = `feedback ${type ?? ''}`;
  feedback.textContent = message;
  document.body.prepend(feedback);
  setTimeout(() => feedback.remove(), 4000);
}

function setFeedback(element, message, type) {
  if (!element) {
    return;
  }
  element.textContent = message || '';
  element.classList.remove('error', 'success');
  if (type) {
    element.classList.add(type);
  }
}

function exportCollectionCsv() {
  if (!state.collection.length) {
    setFeedback(dom.exportFeedback, 'Keine Karten in der Sammlung.', 'error');
    return;
  }
  const rows = [['Name', 'Set', 'Nummer', 'Menge', 'Zustand', 'Sprache', 'Edition', 'Kaufpreis', 'Kaufdatum', 'Notizen', 'Wert', 'URL']];
  state.collection.forEach((entry) => {
    rows.push([
      entry.name,
      entry.setName,
      entry.number,
      entry.quantity,
      getConditionLabel(entry.condition),
      entry.language,
      entry.edition,
      entry.purchasePrice ?? '',
      entry.purchaseDate ?? '',
      entry.notes ?? '',
      getEntryValue(entry),
      entry.url
    ]);
  });
  downloadCsv(rows, 'pokefolio-sammlung.csv');
  setFeedback(dom.exportFeedback, 'Sammlung exportiert.', 'success');
}

function exportWishlistCsv() {
  if (!state.wishlist.length) {
    setFeedback(dom.exportFeedback, 'Keine Karten auf der Wunschliste.', 'error');
    return;
  }
  const rows = [['Name', 'Set', 'Nummer', 'Menge', 'Priorität', 'Zielpreis', 'Marktpreis', 'Notizen', 'URL']];
  state.wishlist.forEach((entry) => {
    rows.push([
      entry.name,
      entry.setName,
      entry.number,
      entry.quantity,
      PRIORITY_LABELS[entry.priority] ?? entry.priority,
      entry.targetPrice ?? '',
      entry.market?.[state.settings.valuationMode] ?? '',
      entry.notes ?? '',
      entry.url
    ]);
  });
  downloadCsv(rows, 'pokefolio-wunschliste.csv');
  setFeedback(dom.exportFeedback, 'Wunschliste exportiert.', 'success');
}

function exportDeckLists() {
  if (!state.decks.length) {
    setFeedback(dom.exportFeedback, 'Keine Decks vorhanden.', 'error');
    return;
  }
  const lines = [];
  state.decks.forEach((deck) => {
    lines.push(`# ${deck.name} (${deck.format})`);
    lines.push('## Hauptdeck');
    deck.cards.filter((card) => card.category === 'main').sort((a, b) => a.name.localeCompare(b.name, 'de')).forEach((card) => {
      lines.push(`${card.quantity}x ${card.name} (${card.setName} ${card.number})`);
    });
    if (deck.cards.some((card) => card.category === 'side')) {
      lines.push('## Sideboard');
      deck.cards.filter((card) => card.category === 'side').sort((a, b) => a.name.localeCompare(b.name, 'de')).forEach((card) => {
        lines.push(`${card.quantity}x ${card.name} (${card.setName} ${card.number})`);
      });
    }
    if (deck.cards.some((card) => card.category === 'extra')) {
      lines.push('## Extra');
      deck.cards.filter((card) => card.category === 'extra').sort((a, b) => a.name.localeCompare(b.name, 'de')).forEach((card) => {
        lines.push(`${card.quantity}x ${card.name} (${card.setName} ${card.number})`);
      });
    }
    if (deck.notes) {
      lines.push(`## Notizen\n${deck.notes}`);
    }
    lines.push('');
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, 'pokefolio-decks.txt');
  setFeedback(dom.exportFeedback, 'Decklisten exportiert.', 'success');
}

function exportBackupJson() {
  const data = {
    collection: state.collection,
    wishlist: state.wishlist,
    decks: state.decks,
    settings: state.settings,
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  downloadBlob(blob, 'pokefolio-backup.json');
  setFeedback(dom.exportFeedback, 'Backup erstellt.', 'success');
}

function importBackupJson(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (parsed.collection) {
        state.collection = parsed.collection.map(normalizeCollectionEntry);
      }
      if (parsed.wishlist) {
        state.wishlist = parsed.wishlist.map(normalizeWishlistEntry);
      }
      if (parsed.decks) {
        state.decks = parsed.decks.map((deck) => ({ ...deck, cards: Array.isArray(deck.cards) ? deck.cards : [] }));
      }
      if (parsed.settings) {
        state.settings = {
          ...DEFAULT_SETTINGS,
          ...parsed.settings,
          exchangeRates: {
            ...DEFAULT_SETTINGS.exchangeRates,
            ...(parsed.settings.exchangeRates ?? {})
          }
        };
      }
      saveCollection();
      saveWishlist();
      saveDecks();
      saveSettings();
      renderAll();
      setFeedback(dom.exportFeedback, 'Backup importiert.', 'success');
    } catch (error) {
      console.error('Import fehlgeschlagen', error);
      setFeedback(dom.exportFeedback, 'Backup konnte nicht importiert werden.', 'error');
    }
  };
  reader.readAsText(file);
}

function downloadCsv(rows, filename) {
  const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, filename);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function startScanner() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setFeedback(dom.scannerFeedback, 'Kamera wird nicht unterstützt. Verwende die Suche.', 'error');
    return;
  }
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
    .then((stream) => {
      state.scanner.stream = stream;
      state.scanner.isActive = true;
      dom.scannerVideo.srcObject = stream;
      dom.captureCardButton.disabled = false;
      dom.stopScannerButton.disabled = false;
      dom.startScannerButton.disabled = true;
      setFeedback(dom.scannerFeedback, 'Kamera aktiv. Positioniere die Karte im Rahmen.');
    })
    .catch((error) => {
      console.error('Scanner konnte nicht gestartet werden', error);
      setFeedback(dom.scannerFeedback, `Kamera konnte nicht gestartet werden: ${getErrorMessage(error)}`, 'error');
    });
}

function stopScanner() {
  if (state.scanner.stream) {
    state.scanner.stream.getTracks().forEach((track) => track.stop());
  }
  state.scanner.stream = null;
  state.scanner.isActive = false;
  dom.scannerVideo.srcObject = null;
  dom.captureCardButton.disabled = true;
  dom.stopScannerButton.disabled = true;
  dom.startScannerButton.disabled = false;
  setFeedback(dom.scannerFeedback, 'Kamera gestoppt.');
}

function captureCard() {
  if (!state.scanner.isActive || !state.scanner.stream) {
    setFeedback(dom.scannerFeedback, 'Starte zuerst die Kamera.', 'error');
    return;
  }
  if (!window.Tesseract) {
    setFeedback(dom.scannerFeedback, 'Tesseract.js konnte nicht geladen werden.', 'error');
    return;
  }
  const video = dom.scannerVideo;
  if (!video.videoWidth || !video.videoHeight) {
    setFeedback(dom.scannerFeedback, 'Video wird noch geladen. Bitte erneut versuchen.', 'error');
    return;
  }
  const canvas = dom.scannerCanvas;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  dom.captureCardButton.disabled = true;
  setFeedback(dom.scannerFeedback, 'Analysiere Karte …');

  window.Tesseract.recognize(canvas, 'eng', {
    logger: (message) => {
      if (message.status === 'recognizing text') {
        const progress = Math.round((message.progress || 0) * 100);
        setFeedback(dom.scannerFeedback, `Erkenne Text … ${progress}%`);
      }
    }
  }).then((result) => {
    const recognizedText = result?.data?.text?.trim();
    if (!recognizedText) {
      setFeedback(dom.scannerFeedback, 'Keine Schrift erkannt. Bitte erneut versuchen.', 'error');
      dom.captureCardButton.disabled = false;
      return;
    }
    setFeedback(dom.scannerFeedback, 'Text erkannt. Suche nach passenden Karten …');
    findCardsByOcr(recognizedText).then((cards) => {
      dom.scannerResults.innerHTML = '';
      if (cards.length) {
        cards.forEach((card) => cardCache.set(card.id, card));
        renderCardList(cards.slice(0, MAX_SCAN_RESULTS), dom.scannerResults, dom.scannerFeedback);
        setFeedback(dom.scannerFeedback, `${cards.length} mögliche Karten gefunden.`, 'success');
      } else {
        setFeedback(dom.scannerFeedback, 'Keine passenden Karten gefunden.', 'error');
      }
    });
  }).catch((error) => {
    console.error('Scan fehlgeschlagen', error);
    setFeedback(dom.scannerFeedback, `Analyse fehlgeschlagen: ${getErrorMessage(error)}`, 'error');
  }).finally(() => {
    dom.captureCardButton.disabled = false;
  });
}

function renderCardList(cards, container, feedbackElement) {
  container.innerHTML = '';
  if (!cards.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Keine Karten gefunden.';
    container.append(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  cards.forEach((card) => {
    fragment.append(createCardElement(card));
  });
  container.append(fragment);
  if (feedbackElement) {
    setFeedback(feedbackElement, `${cards.length} Karten gefunden.`, 'success');
  }
}

function findCardsByOcr(text) {
  const sanitized = text
    .replace(/[|*_=[\]{}<>]/g, ' ')
    .replace(/[^\w\s/.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!sanitized) {
    return Promise.resolve([]);
  }
  const tokens = sanitized.split(' ').filter((token) => token.length > 2);
  const phrases = buildCandidatePhrases(tokens);
  const results = new Map();

  const tasks = phrases.map((phrase) => () => {
    const params = new URLSearchParams({
      q: `name:\"${escapeQueryValue(phrase)}\"`,
      pageSize: '6'
    });
    return apiFetch('/cards', params).then((response) => {
      (response?.data ?? []).forEach((card) => {
        if (!results.has(card.id)) {
          results.set(card.id, card);
        }
      });
    }).catch(() => {});
  });

  return runSequential(tasks).then(() => {
    if (!results.size) {
      const numberMatch = sanitized.match(/\b(\d{1,3})\s*\/\s*\d{1,3}\b/);
      if (numberMatch) {
        const params = new URLSearchParams({
          q: `number:${numberMatch[1]}`,
          pageSize: '10'
        });
        return apiFetch('/cards', params).then((response) => {
          (response?.data ?? []).forEach((card) => {
            if (!results.has(card.id)) {
              results.set(card.id, card);
            }
          });
          return Array.from(results.values());
        });
      }
    }
    return Array.from(results.values());
  });
}

function buildCandidatePhrases(tokens) {
  const phrases = new Set();
  for (let size = Math.min(3, tokens.length); size >= 1; size -= 1) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      const phrase = tokens.slice(index, index + size).join(' ');
      if (phrase.length >= 3 && !/^\d+$/.test(phrase)) {
        phrases.add(phrase);
      }
    }
  }
  return Array.from(phrases).sort((a, b) => b.length - a.length).slice(0, 15);
}

function apiFetch(endpoint, params, options = {}) {
  const url = new URL(`${API_BASE_URL}${endpoint}`);
  if (params instanceof URLSearchParams) {
    params.forEach((value, key) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    });
  } else if (params && typeof params === 'object') {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    });
  }
  const { signal, method = 'GET', body, headers: customHeaders } = options;
  const headers = { Accept: 'application/json', ...(customHeaders ?? {}) };
  if (state.apiKey && !('X-Api-Key' in headers)) {
    headers['X-Api-Key'] = state.apiKey;
  }
  return fetch(url.toString(), { method, headers, body, signal }).then((response) => {
    if (!response.ok) {
      let errorMessage = `${response.status} ${response.statusText}`;
      if (response.status === 403) {
        errorMessage = 'Zugriff verweigert. Bitte API-Schlüssel prüfen.';
      }
      throw new Error(errorMessage);
    }
    return response.json();
  });
}

function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : 'Unbekannter Fehler';
}
