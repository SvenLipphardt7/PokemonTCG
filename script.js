'use strict';

const STORAGE_KEYS = {
  collection: 'pokemontcg.collection',
  apiKey: 'pokemontcg.apiKey'
};

const API_BASE_URL = 'https://api.pokemontcg.io/v2';
const FEATURED_SET_LIMIT = 12;
const MAX_SCAN_RESULTS = 8;

const dom = {
  searchForm: document.getElementById('searchForm'),
  searchFeedback: document.getElementById('searchFeedback'),
  setsGrid: document.getElementById('setsGrid'),
  resultsGrid: document.getElementById('resultsGrid'),
  collectionGrid: document.getElementById('collectionGrid'),
  collectionFeedback: document.getElementById('collectionFeedback'),
  collectionEmptyState: document.getElementById('collectionEmptyState'),
  setFilter: document.getElementById('setFilter'),
  typeFilter: document.getElementById('typeFilter'),
  rarityFilter: document.getElementById('rarityFilter'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  apiKeyFeedback: document.getElementById('apiKeyFeedback'),
  saveApiKeyButton: document.getElementById('saveApiKeyButton'),
  clearApiKeyButton: document.getElementById('clearApiKeyButton'),
  scannerVideo: document.getElementById('scannerVideo'),
  scannerCanvas: document.getElementById('scannerCanvas'),
  scannerFeedback: document.getElementById('scannerFeedback'),
  scannerResults: document.getElementById('scannerResults'),
  startScannerButton: document.getElementById('startScannerButton'),
  captureCardButton: document.getElementById('captureCardButton'),
  stopScannerButton: document.getElementById('stopScannerButton')
};

const state = {
  apiKey: loadApiKey(),
  sets: [],
  collection: loadCollection(),
  isSearching: false
};

const scannerState = {
  stream: null,
  isActive: false
};

init();

async function init() {
  initialiseApiKeyControls();
  renderCollection();
  setupSearchForm();
  setupScanner();
  await loadSetsAndFilters();
}

function loadApiKey() {
  try {
    return localStorage.getItem(STORAGE_KEYS.apiKey) ?? '';
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

function loadCollection() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.collection);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((entry) => ({
      ...entry,
      quantity: Number(entry.quantity) || 1
    }));
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

function initialiseApiKeyControls() {
  if (state.apiKey) {
    dom.apiKeyInput.value = state.apiKey;
    setFeedback(dom.apiKeyFeedback, 'Eigener API-Schlüssel aktiv.', 'success');
  }

  dom.saveApiKeyButton.addEventListener('click', () => {
    const key = dom.apiKeyInput.value.trim();
    state.apiKey = key;
    saveApiKey(key);
    setFeedback(dom.apiKeyFeedback, key ? 'API-Schlüssel gespeichert.' : 'Bitte einen gültigen Schlüssel eingeben.', key ? 'success' : 'error');
  });

  dom.clearApiKeyButton.addEventListener('click', () => {
    dom.apiKeyInput.value = '';
    state.apiKey = '';
    saveApiKey('');
    setFeedback(dom.apiKeyFeedback, 'API-Schlüssel entfernt. Öffentliche Limits gelten.', 'success');
  });
}

async function loadSetsAndFilters() {
  setFeedback(dom.searchFeedback, 'Lade Sets und Filter …');
  try {
    const [setsResponse, typesResponse, raritiesResponse] = await Promise.all([
      apiFetch('/sets', { orderBy: '-releaseDate', pageSize: 250 }),
      apiFetch('/types'),
      apiFetch('/rarities')
    ]);

    state.sets = Array.isArray(setsResponse?.data) ? setsResponse.data : [];
    renderSets(state.sets.slice(0, FEATURED_SET_LIMIT));
    populateSetFilter(state.sets);
    populateTypeFilter(typesResponse?.data ?? []);
    populateRarityFilter(raritiesResponse?.data ?? []);
    setFeedback(dom.searchFeedback, 'Bereit! Starte eine Suche oder scanne eine Karte.');
  } catch (error) {
    console.error(error);
    const message = getErrorMessage(error);
    setFeedback(dom.searchFeedback, `Sets konnten nicht geladen werden: ${message}`, 'error');
  }
}

function populateSetFilter(sets) {
  if (!dom.setFilter) {
    return;
  }

  clearSelectOptions(dom.setFilter, 'Alle Sets');
  sets.forEach((set) => {
    const option = document.createElement('option');
    option.value = set.id;
    option.textContent = `${set.name} (${set.series})`;
    dom.setFilter.append(option);
  });
}

function populateTypeFilter(types) {
  if (!dom.typeFilter) {
    return;
  }

  clearSelectOptions(dom.typeFilter, 'Alle Typen');
  types.forEach((type) => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type;
    dom.typeFilter.append(option);
  });
}

function populateRarityFilter(rarities) {
  if (!dom.rarityFilter) {
    return;
  }

  clearSelectOptions(dom.rarityFilter, 'Alle Seltenheiten');
  rarities.forEach((rarity) => {
    const option = document.createElement('option');
    option.value = rarity;
    option.textContent = rarity;
    dom.rarityFilter.append(option);
  });
}

function clearSelectOptions(selectElement, placeholder) {
  selectElement.innerHTML = '';
  const option = document.createElement('option');
  option.value = '';
  option.textContent = placeholder;
  selectElement.append(option);
}

function renderSets(sets) {
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
    fragment.append(createSetCard(set));
  });
  dom.setsGrid.append(fragment);
}

function createSetCard(set) {
  const element = document.createElement('article');
  element.className = 'set-card';

  const image = document.createElement('img');
  image.src = set.images?.symbol || set.images?.logo || '';
  image.alt = `${set.name} Symbol`;
  element.append(image);

  const info = document.createElement('div');
  const title = document.createElement('h3');
  title.textContent = set.name;
  info.append(title);

  const details = document.createElement('p');
  const date = formatDate(set.releaseDate);
  const total = `${set.total || '?'} Karten`;
  details.textContent = `${set.series} · ${total}${date ? ` · ${date}` : ''}`;
  info.append(details);

  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'secondary';
  action.textContent = 'Im Suchfilter wählen';
  action.addEventListener('click', () => {
    dom.setFilter.value = set.id;
    if (dom.searchForm?.requestSubmit) {
      dom.searchForm.requestSubmit();
    } else {
      dom.searchForm?.dispatchEvent(new Event('submit'));
    }
  });
  info.append(action);

  element.append(info);
  return element;
}

function setupSearchForm() {
  if (!dom.searchForm) {
    return;
  }

  dom.searchForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (state.isSearching) {
      return;
    }

    const formData = new FormData(dom.searchForm);
    const query = (formData.get('query') || '').toString().trim();
    const setId = (formData.get('set') || '').toString().trim();
    const type = (formData.get('type') || '').toString().trim();
    const rarity = (formData.get('rarity') || '').toString().trim();

    const clauses = [];
    if (query) {
      const escaped = escapeQueryValue(query);
      clauses.push(`(name:*\"${escaped}\"* OR subtypes:*\"${escaped}\"*)`);
    }
    if (setId) {
      clauses.push(`set.id:${setId}`);
    }
    if (type) {
      clauses.push(`types:${type}`);
    }
    if (rarity) {
      clauses.push(`rarity:\"${escapeQueryValue(rarity)}\"`);
    }

    const searchParams = new URLSearchParams({
      pageSize: '40',
      orderBy: 'name'
    });

    if (clauses.length) {
      searchParams.set('q', clauses.join(' AND '));
    }

    await performCardSearch(searchParams, query);
  });
}

async function performCardSearch(searchParams, queryText) {
  state.isSearching = true;
  setFeedback(dom.searchFeedback, 'Suche Karten …');
  try {
    const response = await apiFetch('/cards', searchParams);
    const cards = response?.data ?? [];
    renderCardList(cards, dom.resultsGrid, {
      emptyMessage: queryText ? 'Keine Karten für die Suche gefunden.' : 'Bitte starte eine Suche, um Karten zu sehen.',
      feedbackElement: dom.searchFeedback
    });
    if (cards.length) {
      setFeedback(dom.searchFeedback, `${cards.length} Karten gefunden.`);
    } else {
      setFeedback(dom.searchFeedback, 'Keine passenden Karten gefunden.', 'error');
    }
  } catch (error) {
    console.error(error);
    const message = getErrorMessage(error);
    setFeedback(dom.searchFeedback, `Suche fehlgeschlagen: ${message}`, 'error');
  } finally {
    state.isSearching = false;
  }
}

function renderCardList(cards, container, options = {}) {
  const { emptyMessage, feedbackElement } = options;
  container.innerHTML = '';

  if (!cards.length) {
    if (emptyMessage) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = emptyMessage;
      container.append(empty);
    }
    return;
  }

  const fragment = document.createDocumentFragment();
  cards.forEach((card) => {
    const element = createCardElement(card, {
      onAdd: (addedCard) => {
        const { action } = addCardToCollection(addedCard);
        if (feedbackElement) {
          const message = action === 'new'
            ? `${addedCard.name} wurde deiner Sammlung hinzugefügt.`
            : `Anzahl von ${addedCard.name} erhöht.`;
          setFeedback(feedbackElement, message, 'success');
        }
      }
    });
    fragment.append(element);
  });
  container.append(fragment);
}

function createCardElement(card, options = {}) {
  const template = document.getElementById('cardTemplate');
  if (!template) {
    throw new Error('Kartenvorlage fehlt');
  }

  const { onAdd } = options;
  const element = template.content.firstElementChild.cloneNode(true);
  const image = element.querySelector('.card-image');
  image.src = card.images?.small || card.images?.large || '';
  image.alt = `${card.name} (${card.set?.name ?? 'Pokémon TCG'})`;

  element.querySelector('.card-title').textContent = card.name;
  element.querySelector('.card-subtitle').textContent = card.set ? `${card.set.series} · ${card.set.name}` : 'Pokémon TCG Karte';
  const metaParts = [];
  if (card.number) {
    metaParts.push(`Nr. ${card.number}`);
  }
  if (card.rarity) {
    metaParts.push(card.rarity);
  }
  if (card.types?.length) {
    metaParts.push(card.types.join(', '));
  }
  element.querySelector('.card-meta').textContent = metaParts.join(' · ');

  const addButton = element.querySelector('.add-button');
  if (addButton) {
    addButton.addEventListener('click', () => {
      if (typeof onAdd === 'function') {
        onAdd(card);
      }
    });
  }

  const detailsLink = element.querySelector('.details-link');
  if (detailsLink) {
    detailsLink.href = createDetailsUrl(card.id);
    detailsLink.textContent = 'Details anzeigen';
  }

  return element;
}

function createDetailsUrl(cardId) {
  return `https://pokemontcg.io/card/${cardId}`;
}

function toCollectionEntry(card) {
  return {
    id: card.id,
    name: card.name,
    number: card.number ?? '',
    setName: card.set?.name ?? '',
    setSeries: card.set?.series ?? '',
    rarity: card.rarity ?? '',
    types: card.types ?? [],
    images: card.images ?? {},
    url: createDetailsUrl(card.id),
    quantity: 1
  };
}

function addCardToCollection(card) {
  const existing = state.collection.find((entry) => entry.id === card.id);
  if (existing) {
    existing.quantity += 1;
    saveCollection();
    renderCollection();
    setFeedback(dom.collectionFeedback, `${existing.name} aktualisiert.`, 'success');
    return { action: 'increment', entry: existing };
  }

  const entry = toCollectionEntry(card);
  state.collection.push(entry);
  saveCollection();
  renderCollection();
  setFeedback(dom.collectionFeedback, `${entry.name} wurde zur Sammlung hinzugefügt.`, 'success');
  return { action: 'new', entry };
}

function renderCollection() {
  dom.collectionGrid.innerHTML = '';
  if (!state.collection.length) {
    dom.collectionEmptyState.style.display = 'block';
    setFeedback(dom.collectionFeedback, '');
    return;
  }

  dom.collectionEmptyState.style.display = 'none';
  const sorted = [...state.collection].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const fragment = document.createDocumentFragment();
  sorted.forEach((entry) => {
    fragment.append(createCollectionCard(entry));
  });
  dom.collectionGrid.append(fragment);
}

function createCollectionCard(entry) {
  const template = document.getElementById('cardTemplate');
  const element = template.content.firstElementChild.cloneNode(true);
  const image = element.querySelector('.card-image');
  image.src = entry.images?.small || entry.images?.large || '';
  image.alt = `${entry.name} (${entry.setName || 'Pokémon TCG'})`;

  element.querySelector('.card-title').textContent = entry.name;
  const subtitleParts = [];
  if (entry.setSeries) {
    subtitleParts.push(entry.setSeries);
  }
  if (entry.setName) {
    subtitleParts.push(entry.setName);
  }
  element.querySelector('.card-subtitle').textContent = subtitleParts.join(' · ');

  const metaParts = [];
  if (entry.number) {
    metaParts.push(`Nr. ${entry.number}`);
  }
  if (entry.rarity) {
    metaParts.push(entry.rarity);
  }
  if (entry.types?.length) {
    metaParts.push(entry.types.join(', '));
  }
  metaParts.push(`Anzahl: ${entry.quantity}`);
  element.querySelector('.card-meta').textContent = metaParts.join(' · ');

  const detailsLink = element.querySelector('.details-link');
  detailsLink.href = entry.url;
  detailsLink.textContent = 'Details anzeigen';

  const addButton = element.querySelector('.add-button');
  if (addButton) {
    addButton.remove();
  }

  const actions = element.querySelector('.card-actions');
  const quantityControls = document.createElement('div');
  quantityControls.className = 'quantity-controls';

  const decrementButton = document.createElement('button');
  decrementButton.type = 'button';
  decrementButton.className = 'quantity-button';
  decrementButton.textContent = '−';
  decrementButton.addEventListener('click', () => updateCollectionQuantity(entry.id, -1));

  const quantityValue = document.createElement('span');
  quantityValue.className = 'quantity-value';
  quantityValue.textContent = entry.quantity;

  const incrementButton = document.createElement('button');
  incrementButton.type = 'button';
  incrementButton.className = 'quantity-button';
  incrementButton.textContent = '+';
  incrementButton.addEventListener('click', () => updateCollectionQuantity(entry.id, 1));

  quantityControls.append(decrementButton, quantityValue, incrementButton);
  actions.prepend(quantityControls);

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'secondary remove-button';
  removeButton.textContent = 'Entfernen';
  removeButton.addEventListener('click', () => removeCardFromCollection(entry.id));
  actions.append(removeButton);

  return element;
}

function updateCollectionQuantity(cardId, delta) {
  const entry = state.collection.find((item) => item.id === cardId);
  if (!entry) {
    return;
  }

  entry.quantity = Math.max(0, entry.quantity + delta);
  if (entry.quantity <= 0) {
    removeCardFromCollection(cardId);
    return;
  }

  saveCollection();
  renderCollection();
  setFeedback(dom.collectionFeedback, `Anzahl von ${entry.name} aktualisiert.`, 'success');
}

function removeCardFromCollection(cardId) {
  const index = state.collection.findIndex((item) => item.id === cardId);
  if (index === -1) {
    return;
  }
  const [removed] = state.collection.splice(index, 1);
  saveCollection();
  renderCollection();
  setFeedback(dom.collectionFeedback, `${removed.name} wurde aus der Sammlung entfernt.`, 'success');
}

function setupScanner() {
  if (!dom.startScannerButton) {
    return;
  }

  dom.startScannerButton.addEventListener('click', () => startScanner());
  dom.stopScannerButton.addEventListener('click', () => stopScanner());
  dom.captureCardButton.addEventListener('click', () => captureCard());
}

async function startScanner() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setFeedback(dom.scannerFeedback, 'Kamera wird nicht unterstützt. Verwende stattdessen die Suche.', 'error');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false
    });
    scannerState.stream = stream;
    scannerState.isActive = true;
    dom.scannerVideo.srcObject = stream;
    dom.captureCardButton.disabled = false;
    dom.stopScannerButton.disabled = false;
    dom.startScannerButton.disabled = true;
    setFeedback(dom.scannerFeedback, 'Kamera aktiv. Positioniere die Karte im Rahmen.');
  } catch (error) {
    console.error('Scanner konnte nicht gestartet werden', error);
    setFeedback(dom.scannerFeedback, `Kamera konnte nicht gestartet werden: ${getErrorMessage(error)}`, 'error');
  }
}

function stopScanner() {
  if (scannerState.stream) {
    scannerState.stream.getTracks().forEach((track) => track.stop());
  }
  scannerState.stream = null;
  scannerState.isActive = false;
  dom.scannerVideo.srcObject = null;
  dom.captureCardButton.disabled = true;
  dom.stopScannerButton.disabled = true;
  dom.startScannerButton.disabled = false;
  setFeedback(dom.scannerFeedback, 'Kamera gestoppt.');
}

async function captureCard() {
  if (!scannerState.isActive || !scannerState.stream) {
    setFeedback(dom.scannerFeedback, 'Starte zuerst die Kamera.', 'error');
    return;
  }

  if (!window.Tesseract) {
    setFeedback(dom.scannerFeedback, 'Tesseract.js konnte nicht geladen werden.', 'error');
    return;
  }

  const video = dom.scannerVideo;
  if (!video.videoWidth || !video.videoHeight) {
    setFeedback(dom.scannerFeedback, 'Video wird noch geladen. Bitte versuche es erneut.', 'error');
    return;
  }

  const canvas = dom.scannerCanvas;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  dom.captureCardButton.disabled = true;
  setFeedback(dom.scannerFeedback, 'Analysiere Karte …');

  try {
    const result = await window.Tesseract.recognize(canvas, 'eng', {
      logger: (message) => {
        if (message.status === 'recognizing text') {
          const progress = Math.round((message.progress || 0) * 100);
          setFeedback(dom.scannerFeedback, `Erkenne Text … ${progress}%`);
        }
      }
    });

    const recognizedText = result?.data?.text?.trim();
    if (!recognizedText) {
      setFeedback(dom.scannerFeedback, 'Keine Schrift erkannt. Bitte versuche es noch einmal.', 'error');
      dom.captureCardButton.disabled = false;
      return;
    }

    setFeedback(dom.scannerFeedback, 'Text erkannt. Suche nach passenden Karten …');
    const cards = await findCardsByOcr(recognizedText);
    if (cards.length) {
      renderCardList(cards.slice(0, MAX_SCAN_RESULTS), dom.scannerResults, {
        feedbackElement: dom.scannerFeedback
      });
      setFeedback(dom.scannerFeedback, `${cards.length} mögliche Karten gefunden.`, 'success');
    } else {
      dom.scannerResults.innerHTML = '';
      setFeedback(dom.scannerFeedback, 'Keine passenden Karten gefunden.', 'error');
    }
  } catch (error) {
    console.error('Scan fehlgeschlagen', error);
    setFeedback(dom.scannerFeedback, `Analyse fehlgeschlagen: ${getErrorMessage(error)}`, 'error');
  } finally {
    dom.captureCardButton.disabled = false;
  }
}

async function findCardsByOcr(text) {
  const sanitized = text
    .replace(/[|*_=\[\]{}<>]/g, ' ')
    .replace(/[^\w\s/.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!sanitized) {
    return [];
  }

  const tokens = sanitized.split(' ').filter((token) => token.length > 2);
  const phrases = buildCandidatePhrases(tokens);
  const uniqueResults = new Map();

  for (const phrase of phrases) {
    if (uniqueResults.size >= MAX_SCAN_RESULTS) {
      break;
    }

    try {
      const params = new URLSearchParams({
        q: `name:\"${escapeQueryValue(phrase)}\"`,
        pageSize: '6'
      });
      const response = await apiFetch('/cards', params);
      const cards = response?.data ?? [];
      cards.forEach((card) => {
        if (!uniqueResults.has(card.id)) {
          uniqueResults.set(card.id, card);
        }
      });
    } catch (error) {
      console.warn('Fehler bei OCR-Suche', phrase, error);
    }
  }

  if (!uniqueResults.size) {
    const numberMatch = sanitized.match(/\b(\d{1,3})\s*\/\s*\d{1,3}\b/);
    if (numberMatch) {
      const number = numberMatch[1];
      try {
        const params = new URLSearchParams({
          q: `number:${number}`,
          pageSize: '10'
        });
        const response = await apiFetch('/cards', params);
        (response?.data ?? []).forEach((card) => {
          if (!uniqueResults.has(card.id)) {
            uniqueResults.set(card.id, card);
          }
        });
      } catch (error) {
        console.warn('Fehler bei Nummernsuche', error);
      }
    }
  }

  return Array.from(uniqueResults.values());
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

async function apiFetch(endpoint, params) {
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

  const headers = {
    Accept: 'application/json'
  };
  if (state.apiKey) {
    headers['X-Api-Key'] = state.apiKey;
  }

  const response = await fetch(url.toString(), { headers });
  if (!response.ok) {
    let errorMessage = `${response.status} ${response.statusText}`;
    if (response.status === 403) {
      errorMessage = 'Zugriff verweigert. Bitte trage deinen API-Schlüssel ein.';
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

function escapeQueryValue(value) {
  return value.replace(/"/g, '\\"');
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

function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : 'Unbekannter Fehler';
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
