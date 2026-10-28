(async function () {
  const $ = (id) => document.getElementById(id);
  const PAGE = 30;

  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k in el && !k.includes('-')) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c);
    return el;
  }
  const icon = (name, scale) => WP.pixels.svg(name, scale);

  const send = (msg) => chrome.runtime.sendMessage(msg).catch((e) => ({ error: String(e?.message || e) }));

  let toastTimer;
  function toast(text) {
    document.querySelector('.toast')?.remove();
    const el = h('div', { class: 'toast', role: 'status' }, text);
    document.body.append(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 2200);
  }

  // --- state ------------------------------------------------------------------

  // ?tab=<id> targets another tab, so the popup can be opened as a page while testing.
  const forced = Number(new URLSearchParams(location.search).get('tab'));
  const tab = forced ? await chrome.tabs.get(forced).catch(() => null) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  const tabId = tab?.id;
  const url = tab?.url || '';
  const web = WP.match.isWebUrl(url);
  const host = web ? WP.match.bareHost(url) || 'this page' : 'this page';

  let potions = await WP.store.all();
  let status = { userScripts: true, running: {} };
  let shown = PAGE;

  const isLive = (p) => !!status.running[p.id]?.live;
  const matchesHere = (p) => web && WP.match.test(p.sites, url);

  // --- static bits --------------------------------------------------------------

  $('logo').append(icon('potion', 1));
  $('settings').append(icon('gear', 1.5));
  $('search-icon').append(icon('search', 2));
  $('host').textContent = web ? url.replace(/^https?:\/\/(www\.)?/, '') : url || 'No page';
  $('create').append(icon('potion', 1), 'Create new potion');
  if (!web) {
    $('create').disabled = true;
    $('note').hidden = false;
    $('note').textContent = "Chrome doesn't let extensions change this page. Your potions still work everywhere else.";
  }

  document.body.append(
    h(
      'div',
      { class: 'foot' },
      h('span', {}, h('kbd', {}, '⌥'), ' ', h('kbd', {}, '⇧'), ' ', h('kbd', {}, 'Z'), ' picks anything, anywhere'),
      h('span', {}, `v${chrome.runtime.getManifest().version}`),
    ),
  );

  async function openOnPage(action, extra = {}) {
    const res = await send({ type: 'open', tabId, action, ...extra });
    if (res?.error) return toast(res.error);
    window.close();
  }

  $('create').addEventListener('click', () => openOnPage('new'));
  $('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('open-setup').addEventListener('click', () => send({ type: 'openSetup' }).then(() => window.close()));
  $('search').addEventListener('input', () => {
    shown = PAGE;
    renderShelf();
  });

  // --- rendering ----------------------------------------------------------------

  function renderCounter() {
    const digits = String(Math.min(potions.length, 9999)).padStart(4, '0');
    $('counter').replaceChildren(...[...digits].map((d) => h('b', {}, d)));
  }

  function editButton(p) {
    return h(
      'button',
      { class: 'btn sm icon edit', title: 'Edit on this page', 'aria-label': `Edit ${p.name}`, disabled: !web, onclick: () => openOnPage('edit', { id: p.id }) },
      icon('pencil', 1.5),
    );
  }

  function sitesText(p) {
    if (!p.sites?.length) return 'No sites, drink only';
    return p.sites.join(', ');
  }

  function renderHere() {
    const matching = potions.filter(matchesHere);
    const drunk = potions.filter((p) => isLive(p) && !matching.includes(p));
    const list = [...matching, ...drunk].sort((a, b) => isLive(b) - isLive(a));
    const ul = $('here-list');
    if (!list.length) {
      ul.replaceChildren(h('li', { class: 'empty' }, web ? `Nothing brewing on ${host} yet.` : 'Nothing can run here.'));
      ul.style.border = '0';
      return;
    }
    ul.style.border = '';
    ul.replaceChildren(
      ...list.map((p) => {
        const on = isLive(p) || (matchesHere(p) && p.enabled && status.userScripts);
        const sw = h('input', {
          type: 'checkbox',
          class: 'switch',
          checked: on,
          disabled: !status.userScripts,
          'aria-label': `${p.name} on this site`,
          onchange: (e) => setHere(p, e.target.checked),
        });
        const note = isLive(p) && status.running[p.id].mode === 'manual' ? 'Drunk on this tab' : sitesText(p);
        return h(
          'li',
          { class: 'row' + (on ? '' : ' off') },
          h('span', { class: 'vial', title: on ? 'Bubbling away on this page' : 'Off here' }, icon('potion', 1), h('i'), h('i'), h('i')),
          h('div', { class: 'txt' }, h('span', { class: 'name' }, p.name), h('span', { class: 'sites' }, note)),
          h('div', { class: 'tools' }, editButton(p), sw),
        );
      }),
    );
  }

  // On here means: it runs on this site from now on (if it matches) and right now.
  async function setHere(p, on) {
    let res;
    if (matchesHere(p)) res = await send({ type: 'toggle', tabId, id: p.id, enabled: on });
    else res = await send({ type: on ? 'drink' : 'stop', tabId, id: p.id });
    if (res?.error) toast(res.error);
    await refresh();
  }

  function highlight(text, q) {
    if (!q) return text;
    const i = text.toLowerCase().indexOf(q);
    if (i === -1) return text;
    return [text.slice(0, i), h('mark', { class: 'hl' }, text.slice(i, i + q.length)), text.slice(i + q.length)];
  }

  let observer = null;
  function renderShelf() {
    const q = $('search').value.trim().toLowerCase();
    const sorted = [...potions].sort((a, b) => WP.store.recency(b) - WP.store.recency(a));
    const list = q ? sorted.filter((p) => `${p.name} ${(p.sites || []).join(' ')}`.toLowerCase().includes(q)) : sorted;
    const ul = $('all-list');
    observer?.disconnect();
    if (!list.length) {
      ul.replaceChildren(
        h('li', { class: 'empty' }, potions.length ? `No potion matches “${$('search').value.trim()}”.` : 'Your shelf is empty. Open a site you want to change and brew your first potion.'),
      );
      return;
    }
    ul.replaceChildren(
      ...list.slice(0, shown).map((p) =>
        h(
          'li',
          { class: 'row' },
          h('span', { class: 'bullet' + (isLive(p) ? ' on' : ''), title: isLive(p) ? 'Running on this tab' : '' }),
          h('div', { class: 'txt' }, h('span', { class: 'name' }, highlight(p.name, q)), h('span', { class: 'sites' }, highlight(sitesText(p), q))),
          h(
            'div',
            { class: 'tools' },
            editButton(p),
            h(
              'button',
              {
                class: 'btn sm',
                disabled: !web || !status.userScripts,
                title: 'Run it on this tab now',
                onclick: () => drink(p),
              },
              icon('play', 1.5),
              'Drink',
            ),
          ),
        ),
      ),
    );
    // The shelf is endless: render more as the sentinel scrolls into view.
    if (list.length > shown) {
      observer = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        shown += PAGE;
        renderShelf();
      });
      observer.observe($('more'));
    }
  }

  async function drink(p) {
    const res = await send({ type: 'drink', tabId, id: p.id });
    if (res?.error) return toast(res.error);
    toast(`Drank “${p.name}”`);
    await refresh();
  }

  function render() {
    renderCounter();
    $('setup').hidden = status.userScripts;
    renderHere();
    renderShelf();
  }

  async function refresh() {
    potions = await WP.store.all();
    const res = await send({ type: 'status', tabId: web ? tabId : null });
    if (!res?.error) status = res;
    render();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[WP.store.KEY]) refresh();
  });

  // What the page is doing to you, in one sentence; the brewing window offers the fixes.
  const PHRASES = { login: 'a login wall', overlay: 'an overlay', banner: 'a stuck banner', blur: 'blurred content', scroll: 'locked scrolling' };
  async function renderSpotted() {
    if (!web) return;
    const { findings = [] } = (await send({ type: 'diagnose', tabId })) || {};
    const kinds = [...new Set(findings.map((f) => f.kind))].map((k) => PHRASES[k]).filter(Boolean);
    if (!kinds.length) return;
    const listed = kinds.length > 1 ? `${kinds.slice(0, -1).join(', ')} and ${kinds[kinds.length - 1]}` : kinds[0];
    $('spotted').hidden = false;
    $('spotted').replaceChildren('Spotted here: ', h('b', {}, listed), '. Create a potion to fix it in one click.');
  }

  render();
  renderSpotted();
  await refresh();
  $('search').focus();
})();
