// The brewing window: name, sites, what was spotted on the page, ingredients, custom
// code. Every change previews live on the page; nothing is stored until "Save potion".
(function () {
  const UI = self.WPUI;
  if (UI.panel) return;
  const { h } = UI;

  const TOOLS = [
    { type: 'pick', icon: 'picker', title: 'Pick & zap', text: 'Remove or restyle anything on the page' },
    { type: 'glow', icon: 'glow', title: 'Keyword glow', text: 'Highlight words wherever they appear' },
    { type: 'unwall', icon: 'wall', title: 'Wall breaker', text: 'Lift login walls and scroll locks, and keep watching' },
    { type: 'veil', icon: 'veil', title: 'Image veil', text: 'Hide images until you hover them' },
    { type: 'css', icon: 'brush', title: 'Custom CSS', text: 'Write your own styles' },
    { type: 'js', icon: 'wand', title: 'Custom JS', text: 'Run your own script' },
  ];

  const SPOT_ICONS = { login: 'wall', overlay: 'wall', banner: 'picker', blur: 'veil', scroll: 'lock' };

  const JS_PLACEHOLDER = `// Runs on matching pages once they're ready.
// \`potion\` has a few helpers:
//   potion.css('.ad { display: none }')
//   const el = await potion.waitFor('.login-modal')
//   potion.onStop(() => { /* undo when switched off */ })
document.querySelector('.paywall')?.remove();`;

  const S = {
    potion: null,
    isNew: true,
    baseline: '',
    form: null,
    showCss: false,
    showJs: false,
    confirm: null,
    picker: null,
    fromContext: false,
    temp: null,
    fresh: new Set(),
    findings: [],
    pos: null,
    collapsed: false,
  };
  let win = null;
  let els = {};

  const has = (type) => S.potion.ingredients.some((i) => i.type === type);
  const dirty = () => JSON.stringify(S.potion) !== S.baseline;
  const isOpen = () => !!win?.isConnected;

  // --- lifecycle --------------------------------------------------------------

  async function open({ id = null, fresh = false } = {}) {
    UI.loadFont();
    if (isOpen() && !id && !fresh) {
      showWin();
      return;
    }
    if (isOpen()) await discard({ silent: true });
    const saved = id ? await WP.store.get(id) : null;
    S.isNew = !saved;
    S.potion = saved ? structuredClone(saved) : WP.store.draft(location.href);
    S.potion.ingredients ||= [];
    S.potion.sites ||= [];
    S.baseline = JSON.stringify(S.potion);
    S.showCss = !!S.potion.css;
    S.showJs = !!S.potion.js;
    S.form = null;
    S.confirm = null;
    S.collapsed = false;
    S.findings = safeDiagnose();
    render();
  }

  function safeDiagnose() {
    try {
      return UI.diagnose();
    } catch (e) {
      console.warn('[Web Potions] diagnose:', e);
      return [];
    }
  }

  const ensure = async () => {
    if (!isOpen()) await open();
  };

  function close() {
    stopPick();
    UI.menus.close();
    UI.outline(null);
    if (!win) return;
    const w = win;
    win = null;
    w.classList.add('leave');
    setTimeout(() => w.remove(), 120);
  }

  async function discard({ silent = false } = {}) {
    const { id } = S.potion;
    const wasNew = S.isNew;
    close();
    const res = await UI.send(wasNew ? { type: 'stop', id } : { type: 'restore', id });
    if (res?.error && !silent) UI.toast(res.error);
  }

  function requestClose() {
    const p = S.potion;
    if (dirty() && (p.ingredients.length || p.css.trim() || p.js.trim())) {
      S.confirm = 'discard';
      renderFoot();
      return;
    }
    discard();
  }

  function cleaned() {
    const p = S.potion;
    p.name = p.name.trim() || 'Untitled potion';
    p.sites = p.sites.map((s) => s.trim()).filter(Boolean);
    return p;
  }

  async function save() {
    const p = cleaned();
    const saved = await WP.store.save(p);
    S.potion = saved;
    S.baseline = JSON.stringify(saved);
    S.isNew = false;
    close();
    await UI.send({ type: 'restore', id: saved.id });
    const where =
      p.sites.length && p.enabled
        ? ` It runs on ${p.sites[0]}${p.sites.length > 1 ? ` and ${p.sites.length - 1} more` : ''}.`
        : ' Drink it from the toolbar whenever you want it.';
    UI.toast(`Saved “${p.name}”.${where}`);
  }

  async function remove() {
    const { id, name } = S.potion;
    close();
    await WP.store.remove(id);
    await UI.send({ type: 'stop', id });
    UI.toast(`Deleted “${name}”.`);
  }

  function share(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const potion = () => ({ ...cleaned() });
    UI.menus.list({ x: r.left - 6, y: r.top - 92 }, [
      {
        label: 'Copy as JSON',
        icon: 'potion',
        run: () =>
          navigator.clipboard.writeText(WP.share.pack([potion()])).then(
            () => UI.toast('Copied. Paste it into Web Potions settings, under Import.'),
            () => UI.toast("Couldn't reach the clipboard. Use Download instead."),
          ),
      },
      { label: 'Download .json file', icon: 'play', run: () => WP.share.download([potion()]) },
    ]);
  }

  // --- preview ----------------------------------------------------------------

  let previewTimer = null;
  let warned = false;
  async function preview() {
    clearTimeout(previewTimer);
    const potion = S.temp ? { ...S.potion, ingredients: [...S.potion.ingredients, S.temp] } : S.potion;
    const res = await UI.send({ type: 'preview', potion });
    if (res?.error && !warned) {
      warned = true;
      UI.toast(res.error);
    }
  }
  const previewSoon = (ms = 200) => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(preview, ms);
  };

  function addIngredient(ing, { quiet = false } = {}) {
    S.potion.ingredients.push(ing);
    S.fresh.add(S.potion.ingredients.length - 1);
    if (quiet) return;
    renderList();
    renderSpotted();
    preview();
  }

  // A word glows in one color only, so adding it again moves it to the new color.
  // Without a color (right-click), words that already glow move to the next one.
  function addGlow(words, color) {
    const key = (w) => w.toLowerCase();
    const wanted = new Set(words.map(key));
    const ings = S.potion.ingredients;
    const old = ings.filter((i) => i.type === 'glow' && i.words.some((w) => wanted.has(key(w))));
    if (!color) {
      const glowing = new Set(old.flatMap((i) => i.words.map(key)));
      const was = WP.brew.GLOW_COLORS.indexOf(old[old.length - 1]?.color);
      color = words.every((w) => glowing.has(key(w))) ? WP.brew.GLOW_COLORS[(was + 1) % WP.brew.GLOW_COLORS.length] : WP.brew.GLOW_COLORS[0];
    }
    for (const ing of old) ing.words = ing.words.filter((w) => !wanted.has(key(w)));
    for (let i = ings.length - 1; i >= 0; i--) if (ings[i].type === 'glow' && !ings[i].words.length) ings.splice(i, 1);
    S.fresh.clear();
    addIngredient({ type: 'glow', words, color });
  }

  // --- rendering --------------------------------------------------------------

  function render() {
    const layer = UI.mount();
    win?.remove();
    els = {};
    const host = WP.match.bareHost(location.href);
    els.title = h('span', { class: 't' }, S.isNew ? `New potion for ${host}` : 'Edit potion');
    const bar = h(
      'div',
      { class: 'titlebar', onpointerdown: drag },
      UI.icon('potion', 1),
      els.title,
      h('button', { class: 'tb', title: 'Collapse', 'aria-label': 'Collapse', onclick: toggleCollapse }, '–'),
      h('button', { class: 'tb', title: 'Close', 'aria-label': 'Close', onclick: requestClose }, '×'),
    );
    const name = h('input', {
      type: 'text',
      class: 'name',
      value: S.potion.name,
      spellcheck: false,
      'aria-label': 'Potion name',
      oninput: (e) => (S.potion.name = e.target.value),
    });
    els.spotted = h('div', { class: 'sec spotted' });
    els.sites = h('div', { class: 'sec' });
    els.form = h('div');
    els.count = h('small');
    els.list = h('div');
    els.code = h('div', { class: 'sec' });
    els.body = h(
      'div',
      { class: 'body' },
      name,
      els.spotted,
      els.sites,
      h(
        'div',
        { class: 'sec' },
        h('h3', {}, 'Add an ingredient'),
        h(
          'div',
          { class: 'tiles' },
          TOOLS.map((t) =>
            h(
              'button',
              { class: 'tile', 'data-tool': t.type, onclick: () => useTool(t.type) },
              UI.icon(t.icon, 2),
              h('b', {}, t.title),
              h('span', {}, t.text),
            ),
          ),
        ),
        els.form,
      ),
      h('div', { class: 'sec' }, h('h3', {}, 'In this potion', els.count), els.list),
      els.code,
    );
    els.foot = h('div', { class: 'foot' });
    win = h('div', { class: 'win enter', role: 'dialog', 'aria-label': 'Web Potions', onkeydown: winKeys }, bar, els.body, els.foot);
    if (S.pos) {
      win.style.left = `${S.pos.x}px`;
      win.style.top = `${S.pos.y}px`;
      win.style.right = 'auto';
    }
    layer.append(win);
    renderSpotted();
    renderSites();
    renderList();
    renderCode();
    renderFoot();
    applyCollapsed();
  }

  // A finding counts as handled once its fix (or Wall breaker) is in the potion.
  function handled(f) {
    if (f.kind === 'scroll' && (has('unwall') || has('unscroll'))) return true;
    return f.fix.every((fix) => S.potion.ingredients.some((i) => i.type === fix.type && (i.selector || '') === (fix.selector || '') && !i.frame));
  }

  function fix(list) {
    for (const f of list) for (const ing of f.fix) if (!handled(f)) addIngredient({ ...ing }, { quiet: true });
    renderList();
    renderSpotted();
    preview();
  }

  function renderSpotted() {
    if (!els.spotted) return;
    const list = S.findings;
    if (!list.length) {
      els.spotted.style.display = 'none';
      return;
    }
    els.spotted.style.display = '';
    const open = list.filter((f) => !handled(f));
    const parts = [
      h(
        'h3',
        {},
        'Spotted on this page',
        open.length > 1 && h('button', { class: 'btn sm primary', style: 'margin-left:auto', onclick: () => fix(open) }, 'Fix all'),
      ),
      h(
        'div',
        { class: 'spots' },
        list.map((f) =>
          h(
            'div',
            {
              class: 'spot' + (handled(f) ? ' done' : ''),
              onmouseenter: () => UI.outline(f.el),
              onmouseleave: () => UI.outline(null),
            },
            UI.icon(SPOT_ICONS[f.kind] || 'wall', 1.5),
            h('span', { class: 'what' }, f.label),
            h('span', { class: 'detail' }, f.detail ? `“${f.detail}”` : ''),
            handled(f) ? h('span', { class: 'ok' }, 'Fixed') : h('button', { class: 'btn sm', onclick: () => (UI.outline(null), fix([f])) }, 'Fix'),
          ),
        ),
      ),
      list.some(handled) &&
        !has('unwall') &&
        h(
          'div',
          { class: 'hint' },
          'Wall comes back when you scroll?',
          h(
            'button',
            { class: 'btn quiet', title: 'Wall breaker keeps watching the page for new walls', onclick: () => addIngredient({ type: 'unwall' }) },
            'Add Wall breaker',
          ),
        ),
    ];
    els.spotted.replaceChildren(...parts.filter(Boolean));
  }

  function renderSites() {
    const s = WP.match.suggest(location.href);
    const sites = S.potion.sites.length ? S.potion.sites : [''];
    const rows = sites.map((value, i) =>
      h(
        'div',
        { class: 'site' },
        h('input', {
          type: 'text',
          value,
          spellcheck: false,
          placeholder: '*.example.com/*',
          'aria-label': 'Site pattern',
          oninput: (e) => {
            S.potion.sites[i] = e.target.value;
            updateMatch();
          },
        }),
        (sites.length > 1 || value) &&
          h(
            'button',
            {
              class: 'x',
              title: 'Remove this site',
              'aria-label': 'Remove this site',
              onclick: () => {
                S.potion.sites.splice(i, 1);
                renderSites();
              },
            },
            '×',
          ),
      ),
    );
    const quick = [
      ['Whole site', s?.site],
      ['This section', s?.section],
      ['This page', s?.page],
    ].filter(([, v]) => v);
    els.quick = quick.map(([label, v]) =>
      h(
        'button',
        {
          class: 'chip',
          'data-v': v,
          onclick: () => {
            S.potion.sites[0] = v;
            renderSites();
          },
        },
        label,
      ),
    );
    els.match = h('div', { class: 'hint' });
    els.sites.replaceChildren(
      h('h3', {}, 'Works on'),
      ...rows,
      els.match,
      h(
        'div',
        { class: 'chips' },
        els.quick,
        h(
          'button',
          {
            class: 'btn quiet',
            onclick: () => {
              S.potion.sites.push('');
              renderSites();
              els.sites.querySelectorAll('input')[S.potion.sites.length - 1]?.focus();
            },
          },
          'Add another site',
        ),
      ),
    );
    updateMatch();
  }

  function updateMatch() {
    const sites = S.potion.sites.filter((x) => x.trim());
    const on = WP.match.test(sites, location.href);
    els.match.replaceChildren(
      h('span', { class: 'dot' + (on ? ' on' : '') }),
      !sites.length
        ? 'No sites yet. It will only run when you drink it.'
        : on
          ? h('span', { class: 'yes' }, 'Matches this page')
          : "Doesn't match this page. It will only run here when you drink it.",
    );
    for (const chip of els.quick) chip.classList.toggle('on', chip.dataset.v === S.potion.sites[0]);
  }

  function renderForm() {
    els.body.querySelectorAll('.tile').forEach((t) => t.classList.toggle('on', t.dataset.tool === S.form));
    if (S.form !== 'glow') {
      els.form.replaceChildren();
      return;
    }
    let color = WP.brew.GLOW_COLORS[0];
    const add = () => {
      const words = input.value
        .split(',')
        .map((w) => w.trim())
        .filter(Boolean);
      if (!words.length) return input.focus();
      addGlow(words, color);
      S.form = null;
      renderForm();
    };
    const input = h('input', {
      type: 'text',
      placeholder: 'Words to highlight, separated by commas',
      onkeydown: (e) => e.key === 'Enter' && add(),
    });
    const swatches = WP.brew.GLOW_COLORS.map((c) =>
      h('button', {
        class: 'swatch' + (c === color ? ' on' : ''),
        style: `background:${c}`,
        title: 'Highlight color',
        'aria-label': `Highlight color ${c}`,
        onclick: () => {
          color = c;
          swatches.forEach((s, i) => s.classList.toggle('on', WP.brew.GLOW_COLORS[i] === c));
        },
      }),
    );
    els.form.replaceChildren(
      h(
        'div',
        { class: 'form' },
        input,
        h(
          'div',
          { class: 'row' },
          swatches,
          h('span', { style: 'flex:1' }),
          h(
            'button',
            {
              class: 'btn quiet',
              onclick: () => {
                S.form = null;
                renderForm();
              },
            },
            'Cancel',
          ),
          h('button', { class: 'btn primary', onclick: add }, 'Add highlight'),
        ),
      ),
    );
    input.focus();
  }

  function renderList() {
    if (!els.list) return;
    const ings = S.potion.ingredients;
    els.count.textContent = ings.length ? String(ings.length) : '';
    if (!ings.length) {
      els.list.replaceChildren(h('div', { class: 'empty' }, 'Nothing in here yet. Add an ingredient above.'));
      return;
    }
    els.list.replaceChildren(h('div', { class: 'ings' }, ings.map(row)));
    if (win?.style.display !== 'none') S.fresh.clear();
  }

  function row(ing, i) {
    const drop = h(
      'button',
      {
        class: 'x',
        title: 'Take out of the potion',
        'aria-label': 'Take out of the potion',
        onclick: () => {
          S.potion.ingredients.splice(i, 1);
          renderList();
          renderSpotted();
          preview();
        },
      },
      '×',
    );
    let icon;
    let what;
    let detail = '';
    let extra = null;
    let onclick = null;
    const where = ing.frame ? h('span', { class: 'tag', title: `Inside frames on ${ing.frame}` }, 'iframe') : null;
    if (ing.type === 'zap') {
      icon = 'picker';
      what = 'Remove';
      detail = h('code', {}, ing.selector);
    } else if (ing.type === 'style') {
      icon = 'brush';
      what = 'Restyle';
      detail = h('code', {}, ing.selector);
      if (!ing.frame)
        onclick = (e) => {
          if (e.target.closest('.x')) return;
          const r = e.currentTarget.getBoundingClientRect();
          editStyle(i, { x: Math.max(8, r.left - 316), y: r.top });
        };
    } else if (ing.type === 'glow') {
      icon = 'glow';
      what = 'Highlight';
      detail = ing.words.join(', ');
      extra = h(
        'span',
        { class: 'swatches' },
        WP.brew.GLOW_COLORS.map((c) =>
          h('button', {
            class: 'swatch' + (c === ing.color ? ' on' : ''),
            style: `background:${c}`,
            title: 'Change the highlight color',
            'aria-label': `Highlight color ${c}`,
            onclick: () => {
              ing.color = c;
              renderList();
              preview();
            },
          }),
        ),
      );
    } else if (ing.type === 'unwall') {
      icon = 'wall';
      what = 'Wall breaker';
      detail = 'Login walls and scroll locks';
    } else if (ing.type === 'unscroll') {
      icon = 'lock';
      what = 'Unlock scroll';
      detail = 'Lets the page scroll again';
    } else if (ing.type === 'veil') {
      icon = 'veil';
      what = 'Image veil';
      extra = h(
        'span',
        { class: 'seg' },
        ['blur', 'blank'].map((m) =>
          h(
            'button',
            {
              class: ing.mode === m ? 'on' : '',
              onclick: () => {
                ing.mode = m;
                renderList();
                preview();
              },
            },
            m === 'blur' ? 'Blur' : 'Blank',
          ),
        ),
      );
    }
    return h(
      'div',
      { class: 'ing' + (S.fresh.has(i) ? ' fresh' : '') + (onclick ? ' edit' : ''), title: ing.selector || '', onclick },
      UI.icon(icon, 1.5),
      h('span', { class: 'what' }, what),
      where,
      h('span', { class: 'detail' }, detail),
      extra,
      drop,
    );
  }

  function renderCode() {
    els.code.replaceChildren();
    if (S.showCss) els.code.append(cssBlock());
    if (S.showJs) els.code.append(jsBlock());
    els.code.style.display = S.showCss || S.showJs ? '' : 'none';
  }

  function cssBlock() {
    els.cssArea = h('textarea', {
      spellcheck: false,
      value: S.potion.css,
      placeholder: '/* Styles for the matching pages */\n.sidebar { display: none; }',
      'aria-label': 'Custom CSS',
      onkeydown: UI.tabKey,
      oninput: (e) => {
        S.potion.css = e.target.value;
        previewSoon(250);
      },
    });
    return h(
      'div',
      { class: 'code' },
      h(
        'div',
        { class: 'head' },
        UI.icon('brush', 1.5),
        h('b', {}, 'Custom CSS'),
        h(
          'button',
          {
            class: 'x',
            title: 'Remove custom CSS',
            'aria-label': 'Remove custom CSS',
            onclick: () => {
              S.potion.css = '';
              S.showCss = false;
              renderCode();
              preview();
            },
          },
          '×',
        ),
      ),
      els.cssArea,
    );
  }

  function jsBlock() {
    els.result = h('span', { class: 'result' }, '⌘↵ runs it here');
    els.jsArea = h('textarea', {
      spellcheck: false,
      value: S.potion.js,
      placeholder: JS_PLACEHOLDER,
      'aria-label': 'Custom JavaScript',
      style: 'min-height: 132px',
      oninput: (e) => (S.potion.js = e.target.value),
      onkeydown: (e) => {
        UI.tabKey(e);
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') testRun();
      },
    });
    const num = (key, label, hint) => [
      h('span', {}, label),
      h('input', {
        type: 'number',
        min: 0,
        step: 100,
        value: S.potion[key] || 0,
        'aria-label': label,
        oninput: (e) => (S.potion[key] = Math.max(0, Number(e.target.value) || 0)),
      }),
      h('span', {}, hint),
    ];
    return h(
      'div',
      { class: 'code' },
      h(
        'div',
        { class: 'head' },
        UI.icon('wand', 1.5),
        h('b', {}, 'Custom JS'),
        h(
          'button',
          {
            class: 'x',
            title: 'Remove custom JS',
            'aria-label': 'Remove custom JS',
            onclick: () => {
              S.potion.js = '';
              S.showJs = false;
              renderCode();
              preview();
            },
          },
          '×',
        ),
      ),
      els.jsArea,
      h(
        'div',
        { class: 'timing' },
        num('repeat', 'Repeat every', 'ms, 0 runs it once'),
        num('delay', 'First run after', 'ms, 0 runs when the page is ready'),
      ),
      h(
        'label',
        { class: 'check' },
        h('input', {
          type: 'checkbox',
          checked: S.potion.world === 'MAIN',
          onchange: (e) => (S.potion.world = e.target.checked ? 'MAIN' : 'USER_SCRIPT'),
        }),
        "Run in the page's own context, to reach its variables",
      ),
      h('div', { class: 'row', style: 'display:flex;align-items:center;gap:10px' }, h('button', { class: 'btn', onclick: testRun }, UI.icon('play', 1.5), 'Test run'), els.result),
    );
  }

  async function testRun() {
    if (!S.potion.js.trim()) return els.jsArea.focus();
    els.result.className = 'result';
    els.result.textContent = 'Running…';
    const res = await UI.send({ type: 'test', potion: S.potion });
    if (res.error) {
      els.result.className = 'result bad';
      els.result.textContent = 'runs' in res ? `Error: ${res.error}` : res.error;
    } else if (res.scheduled) {
      els.result.className = 'result ok';
      els.result.textContent = `Scheduled, first run in ${Math.round(S.potion.delay / 100) / 10}s`;
    } else {
      els.result.className = 'result ok';
      els.result.textContent = res.runs > 1 ? `Ran ${res.runs} times` : 'Ran without errors';
    }
  }

  function renderFoot() {
    const auto = h(
      'label',
      { class: 'check' },
      h('input', { type: 'checkbox', checked: S.potion.enabled, onchange: (e) => (S.potion.enabled = e.target.checked) }),
      'Run automatically on matching sites',
    );
    let row;
    if (S.confirm === 'discard') {
      row = h(
        'div',
        { class: 'confirm' },
        h('span', {}, 'Throw this brew away?'),
        h('button', { class: 'btn', onclick: () => ((S.confirm = null), renderFoot()) }, 'Keep brewing'),
        h('button', { class: 'btn danger', onclick: () => discard() }, 'Discard'),
      );
    } else if (S.confirm === 'delete') {
      row = h(
        'div',
        { class: 'confirm' },
        h('span', {}, `Delete “${S.potion.name}” for good?`),
        h('button', { class: 'btn', onclick: () => ((S.confirm = null), renderFoot()) }, 'Keep it'),
        h('button', { class: 'btn danger', onclick: remove }, 'Delete'),
      );
    } else {
      row = h(
        'div',
        { class: 'row' },
        !S.isNew && h('button', { class: 'btn quiet danger', onclick: () => ((S.confirm = 'delete'), renderFoot()) }, 'Delete'),
        h('button', { class: 'btn quiet', onclick: share }, 'Share'),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn', onclick: requestClose }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: save }, S.isNew ? 'Save potion' : 'Save changes'),
      );
    }
    els.foot.replaceChildren(auto, row);
  }

  function toggleCollapse() {
    S.collapsed = !S.collapsed;
    applyCollapsed();
  }
  function applyCollapsed() {
    els.body.style.display = S.collapsed ? 'none' : '';
    els.foot.style.display = S.collapsed ? 'none' : '';
  }

  function showWin() {
    if (!win) return;
    win.style.display = '';
    renderList();
    renderSpotted();
  }

  function winKeys(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape' && !UI.menus.isOpen()) {
      e.preventDefault();
      requestClose();
    }
    e.stopPropagation();
  }

  function drag(e) {
    if (e.target.closest('button')) return;
    const r = win.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    const move = (ev) => {
      const x = UI.clamp(ev.clientX - dx, 0, innerWidth - 80);
      const y = UI.clamp(ev.clientY - dy, 0, innerHeight - 30);
      win.style.left = `${x}px`;
      win.style.top = `${y}px`;
      win.style.right = 'auto';
      S.pos = { x, y };
    };
    const up = () => {
      removeEventListener('pointermove', move, true);
      removeEventListener('pointerup', up, true);
    };
    addEventListener('pointermove', move, true);
    addEventListener('pointerup', up, true);
  }

  // --- tools ------------------------------------------------------------------

  function useTool(type) {
    if (type === 'pick') return startPick();
    if (type === 'glow') {
      S.form = S.form === 'glow' ? null : 'glow';
      return renderForm();
    }
    if (type === 'unwall') {
      if (has('unwall')) return UI.toast('Wall breaker is already in this potion.');
      return addIngredient({ type: 'unwall' });
    }
    if (type === 'veil') {
      if (has('veil')) return UI.toast('Image veil is already in this potion.');
      return addIngredient({ type: 'veil', mode: 'blur' });
    }
    if (type === 'css') {
      S.showCss = true;
      renderCode();
      return els.cssArea.focus();
    }
    if (type === 'js') {
      S.showJs = true;
      renderCode();
      els.jsArea.focus();
    }
  }

  // --- picking ----------------------------------------------------------------

  const menuOptions = () => ({
    picker: S.picker,
    onCommit: commit,
    onPreview(temp) {
      S.temp = temp;
      previewSoon(120);
    },
    onDone() {
      if (S.temp) {
        S.temp = null;
        preview();
      }
      if (S.fromContext) endContextFlow();
      else S.picker?.unlock();
    },
  });

  function commit(ing) {
    S.temp = null;
    addIngredient(ing);
    if (!S.picker) return;
    S.picker.setChanges(S.picker.changes + 1);
    if (S.fromContext) return S.picker.exit();
    S.picker.unlock();
    S.picker.box.style.display = 'none';
    S.picker.current = null;
  }

  function startPick({ fromContext = false } = {}) {
    S.fromContext = fromContext;
    if (S.picker) return S.picker;
    if (win) win.style.display = 'none';
    S.picker = new UI.Picker({
      onPick: (el, pt) => UI.menus.actions(el, pt, menuOptions()),
      onExit: () => {
        S.picker = null;
        UI.menus.close();
        UI.send({ type: 'frames', on: false });
        showWin();
      },
    });
    S.picker.onDismiss = () => {
      UI.menus.close();
      if (S.temp) {
        S.temp = null;
        preview();
      }
      if (S.fromContext) return endContextFlow();
      S.picker.unlock();
    };
    S.picker.start();
    // Pickers inside iframes report back through the background.
    if (!fromContext) UI.send({ type: 'frames', on: true });
    return S.picker;
  }

  function stopPick() {
    S.picker?.exit();
  }

  // Right-click flow: one action, then straight back to the window to save.
  function endContextFlow() {
    S.picker?.exit();
    if (S.isNew && !S.potion.ingredients.length && !dirty()) discard({ silent: true });
  }

  async function zapContext() {
    await ensure();
    const ctx = self.__wpCtx || {};
    const el = ctx.el;
    if (!el?.isConnected || el === document.body || el === document.documentElement || UI.host?.contains(el)) {
      startPick();
      return;
    }
    const picker = startPick({ fromContext: true });
    picker.lockOn(el);
    UI.menus.actions(el, { x: ctx.x, y: ctx.y }, menuOptions());
  }

  async function pick() {
    await ensure();
    startPick();
  }

  async function glow(words) {
    await ensure();
    const clean = words.map((w) => w.trim()).filter(Boolean);
    if (clean.length) addGlow(clean);
  }

  // An element picked inside an iframe.
  async function fromFrame(ingredient, frameUrl) {
    await ensure();
    const frame = WP.match.frameSite(frameUrl);
    if (!frame) return;
    addIngredient({ ...ingredient, frame });
    if (S.picker) S.picker.setChanges(S.picker.changes + 1);
    else showWin();
  }

  function editStyle(index, pt) {
    const original = S.potion.ingredients.splice(index, 1)[0];
    renderList();
    UI.menus.styler(original.selector, pt, {
      css: original.css,
      onPreview(temp) {
        S.temp = temp;
        previewSoon(120);
      },
      onApply(ing) {
        S.temp = null;
        S.potion.ingredients.splice(index, 0, ing);
        S.fresh.add(index);
        renderList();
        preview();
      },
      onCancel() {
        S.temp = null;
        S.potion.ingredients.splice(index, 0, original);
        renderList();
        preview();
      },
    });
  }

  UI.panel = { open, ensure, pick, zapContext, glow, fromFrame, stopPick, isOpen };
})();
