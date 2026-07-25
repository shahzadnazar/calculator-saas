/**
 * Calculator search — client controller (S1, isolated to /dev/search).
 *
 * Accessible combobox/listbox over the static, fingerprinted search index.
 * Imports only the registry-free pure core (no calculator data is bundled).
 * Renders with safe DOM text APIs only — never innerHTML with query/record text.
 * No analytics, no query storage; only the selected calculator id is remembered.
 */
import {
  rankCalculators,
  findClosestSuggestion,
  normalizeSearchText,
  isBroadDiscoveryQuery,
  type CalculatorSearchRecord,
} from '@lib/search-core';

type LoadStrategy = 'eager' | 'idle' | 'interaction';

interface SearchIndex {
  version: string;
  count: number;
  records: CalculatorSearchRecord[];
  popularIds: string[];
}

/* One fetch per index URL, shared by every instance on the page. */
const indexCache = new Map<string, Promise<SearchIndex>>();

function loadIndex(url: string): Promise<SearchIndex> {
  let p = indexCache.get(url);
  if (!p) {
    p = fetch(url, { credentials: 'omit' }).then((r) => {
      if (!r.ok) throw new Error(`search index HTTP ${r.status}`);
      return r.json() as Promise<SearchIndex>;
    });
    p.catch(() => indexCache.delete(url)); // allow a later retry on failure
    indexCache.set(url, p);
  }
  return p;
}

/* Recently-used calculators — only ids/slugs, never queries or input values. */
const RECENT_KEY = 'ac:recent-calculators';
const RECENT_MAX = 5;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX);
  } catch {
    return []; // unavailable or corrupt → silent
  }
}

function pushRecent(id: string): void {
  try {
    const next = [id, ...readRecent().filter((x) => x !== id)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable/full — ignore */
  }
}

export function mount(root: HTMLElement): void {
  const input = root.querySelector<HTMLInputElement>('[data-calc-search-input]');
  const panel = root.querySelector<HTMLElement>('[data-calc-search-panel]');
  const list = root.querySelector<HTMLUListElement>('[data-calc-search-list]');
  const foot = root.querySelector<HTMLElement>('[data-calc-search-foot]');
  const groupLabel = root.querySelector<HTMLElement>('[data-calc-search-group]');
  const live = root.querySelector<HTMLElement>('[data-calc-search-live]');
  if (input && panel && list && foot && groupLabel && live) {
    setup(root, input, panel, list, foot, groupLabel, live);
  }
}

function setup(
  root: HTMLElement,
  input: HTMLInputElement,
  panel: HTMLElement,
  list: HTMLUListElement,
  foot: HTMLElement,
  groupLabel: HTMLElement,
  live: HTMLElement,
): void {
  const indexUrl = root.dataset.indexUrl || '';
  const strategy = (root.dataset.loadStrategy as LoadStrategy) || 'interaction';
  const maxResults = Number(root.dataset.max || '10') || 10;
  const showRecent = root.dataset.showRecent !== 'false';
  const showPopular = root.dataset.showPopular !== 'false';
  const listId = list.id;

  let index: SearchIndex | null = null;
  let byId = new Map<string, CalculatorSearchRecord>();
  let activeIndex = -1;
  let lastCount = -1;
  const setState = (s: 'idle' | 'loading' | 'ready' | 'failed') => { root.dataset.state = s; };
  setState('idle');

  /* ---- index loading ---------------------------------------------- */
  let requested = false;
  function ensureIndex(): void {
    if (requested) return;
    requested = true;
    setState('loading');
    loadIndex(indexUrl).then(
      (idx) => {
        index = idx;
        byId = new Map(idx.records.map((r) => [r.id, r]));
        setState('ready');
        if (document.activeElement === input) render();
      },
      () => {
        setState('failed');
        requested = false; // permit a later retry
        if (document.activeElement === input) renderFailed();
      },
    );
  }
  function scheduleLoad(): void {
    if (strategy === 'eager') ensureIndex();
    else if (strategy === 'idle') {
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
      if (ric) ric(() => ensureIndex(), { timeout: 2000 });
      else setTimeout(ensureIndex, 200);
    }
    // 'interaction' waits for a real interaction (wired below)
  }

  /* ---- rendering (safe DOM only) ---------------------------------- */
  function clearPanel(): void {
    list.replaceChildren();
    foot.replaceChildren();
    foot.hidden = true;
    groupLabel.hidden = true;
    groupLabel.textContent = '';
  }

  function optionAnchor(rec: CalculatorSearchRecord, i: number): HTMLLIElement {
    const li = document.createElement('li');
    li.setAttribute('role', 'presentation');
    const a = document.createElement('a');
    a.id = `${listId}-o${i}`;
    a.setAttribute('role', 'option');
    a.setAttribute('aria-selected', 'false');
    a.tabIndex = -1;
    a.href = rec.href; // genuine href — real navigation, works without JS handlers
    a.className = 'calc-search__result';
    a.dataset.result = '';
    a.dataset.id = rec.id;

    const title = document.createElement('span');
    title.className = 'calc-search__result-title';
    title.textContent = rec.title;
    const cat = document.createElement('span');
    cat.className = 'calc-search__result-cat';
    cat.textContent = rec.category;
    const blurb = document.createElement('span');
    blurb.className = 'calc-search__result-blurb';
    blurb.textContent = rec.phrases[0] || rec.blurb;
    const arrow = document.createElement('span');
    arrow.className = 'calc-search__result-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';

    a.append(title, cat, blurb, arrow);
    a.addEventListener('click', () => pushRecent(rec.id)); // remember on real click too
    li.append(a);
    return li;
  }

  function renderOptions(records: CalculatorSearchRecord[]): void {
    const frag = document.createDocumentFragment();
    records.forEach((rec, i) => frag.append(optionAnchor(rec, i)));
    list.append(frag);
  }

  function open(): void {
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }
  function close(): void {
    panel.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    setActive(-1);
  }

  function announce(count: number): void {
    if (count === lastCount) return;
    lastCount = count;
    live.textContent = count === 1 ? '1 calculator found.' : `${count} calculators found.`;
  }

  function resolveIds(ids: string[]): CalculatorSearchRecord[] {
    return ids.map((id) => byId.get(id)).filter((r): r is CalculatorSearchRecord => !!r);
  }

  function renderEmpty(): void {
    if (!index) return;
    clearPanel();
    const recent = showRecent ? resolveIds(readRecent()).slice(0, 5) : [];
    const popular = showPopular ? resolveIds(index.popularIds).slice(0, 6) : [];
    const records: CalculatorSearchRecord[] = [];
    const seen = new Set<string>();
    const label = recent.length ? 'Recent calculators' : 'Popular calculators';
    for (const r of [...recent, ...popular]) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      records.push(r);
    }
    if (!records.length) { close(); return; }
    groupLabel.textContent = label;
    groupLabel.hidden = false;
    renderOptions(records.slice(0, Math.max(5, maxResults)));
    open();
    lastCount = -1; // empty-state is not a "search" — keep the live region quiet
  }

  function renderPopular(): void {
    if (!index) return;
    clearPanel();
    const popular = resolveIds(index.popularIds).slice(0, 6);
    if (!popular.length) { close(); return; }
    groupLabel.textContent = 'Popular calculators';
    groupLabel.hidden = false;
    renderOptions(popular);
    open();
    lastCount = -1;
  }

  function renderNoResults(rawQuery: string): void {
    if (!index) return;
    clearPanel();
    const msg = document.createElement('p');
    msg.className = 'calc-search__empty';
    msg.append(document.createTextNode('No calculator found for '));
    const strong = document.createElement('strong');
    strong.textContent = `“${rawQuery.trim()}”`; // safe: textContent, never innerHTML
    msg.append(strong);
    foot.append(msg);

    const suggestion = findClosestSuggestion(rawQuery, index.records);
    if (suggestion) {
      const did = document.createElement('p');
      did.className = 'calc-search__did';
      did.append(document.createTextNode('Did you mean '));
      const a = document.createElement('a');
      a.href = suggestion.href;
      a.textContent = suggestion.title;
      a.addEventListener('click', () => pushRecent(suggestion.id));
      did.append(a, document.createTextNode('?'));
      foot.append(did);
    }

    const links = document.createElement('p');
    links.className = 'calc-search__fallback-links';
    const all = document.createElement('a');
    all.href = '/calculators';
    all.textContent = 'All calculators';
    links.append(all);
    foot.append(links);

    foot.hidden = false;
    open();
    announce(0);
  }

  function renderResults(rawQuery: string, ranked: CalculatorSearchRecord[]): void {
    clearPanel();
    const total = ranked.length;
    const shown = ranked.slice(0, maxResults);
    renderOptions(shown);
    if (total > maxResults) {
      const a = document.createElement('a');
      a.className = 'calc-search__viewall';
      a.href = `/calculators?q=${encodeURIComponent(rawQuery.trim())}`;
      a.textContent = `View all ${total} matching calculators →`;
      foot.append(a);
      foot.hidden = false;
    }
    open();
    announce(total);
  }

  function renderFailed(): void {
    clearPanel();
    const p = document.createElement('p');
    p.className = 'calc-search__empty';
    p.textContent = 'Search is unavailable right now — press Enter to browse all calculators.';
    foot.append(p);
    foot.hidden = false;
    open();
  }

  function render(): void {
    if (root.dataset.state === 'failed') { input.value.trim() ? renderFailed() : close(); return; }
    if (!index) { ensureIndex(); return; }
    const raw = input.value;
    const nq = normalizeSearchText(raw);
    if (!nq) { renderEmpty(); return; }
    if (isBroadDiscoveryQuery(raw)) { renderPopular(); return; }
    let ranked = rankCalculators(raw, index.records);
    if (nq.length < 3) ranked = ranked.filter((r) => r.matchedOn === 'title'); // prefix only
    const records = ranked.map((r) => r.record);
    if (!records.length) { renderNoResults(raw); return; }
    renderResults(raw, records);
  }

  /* ---- active option management ----------------------------------- */
  function options(): HTMLAnchorElement[] {
    return Array.from(list.querySelectorAll<HTMLAnchorElement>('[data-result]'));
  }
  function setActive(i: number): void {
    const opts = options();
    activeIndex = i;
    opts.forEach((el, idx) => {
      const on = idx === i;
      el.setAttribute('aria-selected', on ? 'true' : 'false');
      el.classList.toggle('is-active', on);
    });
    const current = i >= 0 ? opts[i] : undefined;
    if (current) {
      input.setAttribute('aria-activedescendant', current.id);
      current.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  /* ---- events ----------------------------------------------------- */
  input.addEventListener('input', () => { setActive(-1); render(); });

  input.addEventListener('focus', () => {
    if (strategy === 'interaction') ensureIndex();
    if (panel.hidden) render();
  });
  if (strategy === 'interaction') {
    for (const ev of ['pointerenter', 'pointerdown', 'touchstart'] as const) {
      root.addEventListener(ev, ensureIndex, { once: true, passive: true });
    }
  }

  input.addEventListener('keydown', (e) => {
    const opts = options();
    const isOpen = !panel.hidden;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) { render(); return; }
        setActive(activeIndex + 1 >= opts.length ? opts.length - 1 : Math.max(activeIndex + 1, 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!isOpen) { render(); return; }
        setActive(activeIndex <= 0 ? 0 : activeIndex - 1);
        break;
      case 'Home':
        if (isOpen && opts.length) { e.preventDefault(); setActive(0); }
        break;
      case 'End':
        if (isOpen && opts.length) { e.preventDefault(); setActive(opts.length - 1); }
        break;
      case 'Enter':
        if (isOpen && activeIndex >= 0 && opts[activeIndex]) {
          e.preventDefault();
          const a = opts[activeIndex];
          if (a.dataset.id) pushRecent(a.dataset.id);
          window.location.assign(a.href);
        }
        // else: let the GET form submit to /calculators?q=<query>
        break;
      case 'Escape':
        if (isOpen) { e.preventDefault(); close(); } // keep the query
        break;
      default:
    }
  });

  // Close on outside interaction / blur; keep the query.
  document.addEventListener('pointerdown', (e) => {
    if (!root.contains(e.target as Node)) close();
  });
  root.addEventListener('focusout', () => {
    setTimeout(() => { if (!root.contains(document.activeElement)) close(); }, 0);
  });

  scheduleLoad();
}

function init(): void {
  document.querySelectorAll<HTMLElement>('[data-calc-search]').forEach(mount);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
