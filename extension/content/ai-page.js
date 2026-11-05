// The AI's senses on a page (look, point, and a log of what changes as the page loads),
// and the card that tells the user what it just did. Loaded only in unlocked tabs.
(function () {
  const UI = (self.WPUI = self.WPUI || {});
  if (UI.ai) return;

  const { h } = UI;
  const MAX_SCANNED = 40000;
  const MAX_LISTED = 6;
  const MAX_LISTED_FULL = 20;
  const OURS = 'web-potions-ui';
  const MODAL = 'dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]';

  const clip = (text, n = 120) => {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
  };

  function covers(r) {
    const w = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
    const h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
    return w > 0 && h > 0 ? (w * h) / (innerWidth * innerHeight) : 0;
  }

  // Selectors can't cross into a shadow root, so a potion has to aim at the outermost host.
  function outermost(el) {
    let cur = el;
    for (let root = cur.getRootNode(); root instanceof ShadowRoot; root = cur.getRootNode()) cur = root.host;
    return cur;
  }

  function info(el, extra = {}) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const target = outermost(el);
    return {
      selector: UI.selector.unique(target),
      ...(target !== el && { insideShadowRoot: true }),
      tag: el.localName,
      position: cs.position,
      zIndex: cs.zIndex,
      screenPercent: Math.round(covers(r) * 100),
      box: [r.left, r.top, r.width, r.height].map(Math.round),
      text: clip(el.innerText || el.textContent),
      ...extra,
    };
  }

  function* walk(root) {
    for (const el of root.querySelectorAll('*')) {
      yield el;
      if (el.shadowRoot) yield* walk(el.shadowRoot);
    }
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // Two separate clues. Scripts can still scroll an overflow: hidden page, so the styles
  // catch CSS locks, and the nudge catches scripts that keep putting the page back. Neither
  // sees a page that swallows the wheel: only a real scroll action can test that.
  async function scrollFacts() {
    const html = document.documentElement;
    const body = document.body;
    const scroller = document.scrollingElement || html;
    const top = scroller.scrollTop;
    const tall = scroller.scrollHeight > innerHeight + 50;
    let moved = false;
    if (tall) {
      scroller.scrollTo({ top: top + 120, behavior: 'instant' });
      await wait(60);
      moved = scroller.scrollTop !== top;
      scroller.scrollTo({ top, behavior: 'instant' });
    }
    const facts = (el) => {
      const cs = getComputedStyle(el);
      return { overflowY: cs.overflowY, position: cs.position, pointerEvents: cs.pointerEvents };
    };
    const htmlFacts = facts(html);
    const bodyFacts = body ? facts(body) : null;
    const hidden = (f) => f?.overflowY === 'hidden' || f?.overflowY === 'clip' || f?.pointerEvents === 'none';
    return {
      top,
      pageHeight: scroller.scrollHeight,
      screenHeight: innerHeight,
      longerThanScreen: tall,
      lockedByStyles: tall && (hidden(htmlFacts) || hidden(bodyFacts) || bodyFacts?.position === 'fixed'),
      movedWhenNudged: moved,
      html: htmlFacts,
      body: bodyFacts,
    };
  }

  // The essentials, short enough that a browser tool won't cut the reply off.
  function brief(el) {
    const r = el.getBoundingClientRect();
    const target = outermost(el);
    return {
      selector: UI.selector.unique(target),
      ...(target !== el && { insideShadowRoot: true }),
      tag: el.localName,
      screenPercent: Math.round(covers(r) * 100),
      text: clip(el.innerText || el.textContent, 50),
    };
  }

  // Everything on the page that could be in the way, not just what a few sample points hit.
  // look({ full: true }) adds boxes, styles and the longer lists.
  async function look({ full = false } = {}) {
    const blockers = [];
    const innerScrollers = [];
    let scanned = 0;
    for (const el of walk(document)) {
      if (++scanned > MAX_SCANNED) break;
      if (el === document.documentElement || el === document.body || el.localName === OURS) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cov = covers(r);
      const stuck = (cs.position === 'fixed' || cs.position === 'sticky') && cov >= 0.005;
      const raised = cs.position === 'absolute' && cov >= 0.3 && parseInt(cs.zIndex, 10) > 0;
      if ((stuck || raised || el.matches(MODAL)) && !blockers.some((b) => b.el.contains(el))) blockers.push({ el, cov });
      if (cov >= 0.2 && (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight - el.clientHeight > 50) innerScrollers.push({ el, cov });
    }
    const limit = full ? MAX_LISTED_FULL : MAX_LISTED;
    const describe = (list) => list.sort((a, b) => b.cov - a.cov).slice(0, limit).map((x) => (full ? info(x.el) : brief(x.el)));
    const iframes = [...document.querySelectorAll('iframe')]
      .map((el) => ({ el, cov: covers(el.getBoundingClientRect()) }))
      .filter((f) => f.cov >= 0.02)
      .slice(0, limit)
      .map(({ el, cov }) => {
        let src = '';
        try {
          const u = new URL(el.src);
          src = u.origin + u.pathname;
        } catch {
          /* no usable src */
        }
        return { selector: UI.selector.unique(el), src, screenPercent: Math.round(cov * 100) };
      });
    const inert = [...document.querySelectorAll('[inert]')].slice(0, 5).map((el) => UI.selector.unique(el));
    const scrolling = await scrollFacts();
    const changes = UI.ai.log || [];
    const someOf = (name, list) => (list.length ? { [name]: list } : {});
    return {
      page: { width: innerWidth, height: innerHeight, ...(scanned > MAX_SCANNED && { scanStoppedEarly: true }), ...(full && { title: clip(document.title), path: location.pathname, language: document.documentElement.lang || null, scanned }) },
      scrolling: full ? scrolling : { longerThanScreen: scrolling.longerThanScreen, lockedByStyles: scrolling.lockedByStyles, movedWhenNudged: scrolling.movedWhenNudged, top: scrolling.top },
      ...someOf('blockers', describe(blockers)),
      ...someOf('changes', full ? changes : changes.slice(-5)),
      ...someOf('innerScrollers', describe(innerScrollers)),
      ...someOf('inert', inert),
      ...someOf('iframes', iframes),
      ...(full && { spotted: UI.diagnoseSummary?.() || [] }),
    };
  }

  function deepFromPoint(x, y) {
    const out = [];
    for (const el of document.elementsFromPoint(x, y)) {
      if (el.localName === OURS || el === document.documentElement || el === document.body) continue;
      if (el.shadowRoot) out.push(...el.shadowRoot.elementsFromPoint(x, y).filter((inner) => inner !== el));
      out.push(el);
    }
    return out;
  }

  // point(x, y) names what's on top at those CSS pixels. point('selector') names the first
  // match. Either takes { all: true } last, to list the whole stack with full details.
  function point(...where) {
    const options = typeof where[where.length - 1] === 'object' ? where.pop() : {};
    const [a, b] = where;
    let els;
    if (typeof a === 'string') {
      try {
        els = [...document.querySelectorAll(a)];
      } catch {
        return { ok: false, error: `Not a valid selector: ${a}` };
      }
    } else if (Number.isFinite(a) && Number.isFinite(b)) els = deepFromPoint(a, b);
    else return { ok: false, error: 'Use point(x, y) in CSS pixels, or point("selector").' };
    if (!els.length) return { count: 0 };
    const describe = (el) => ({ ...info(el), similar: UI.selector.similar(outermost(el)) });
    if (options?.all) return { count: els.length, elements: els.slice(0, 8).map(describe) };
    const top = els[0];
    const wrapper = outermost(top).parentElement;
    return {
      count: els.length,
      top: { ...brief(top), similar: UI.selector.similar(outermost(top)), ...(wrapper && wrapper !== document.body && { wrapper: UI.selector.unique(wrapper) }) },
    };
  }

  // Splits "a, b:is(c, d)" at its top-level commas only.
  function splitSelectors(text) {
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '(' || text[i] === '[') depth++;
      else if (text[i] === ')' || text[i] === ']') depth--;
      else if (text[i] === ',' && depth === 0) {
        parts.push(text.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(text.slice(start));
    return parts.map((s) => s.trim()).filter(Boolean);
  }

  function cssSelectors(css) {
    const sheet = new CSSStyleSheet();
    try {
      sheet.replaceSync(css || '');
    } catch {
      return [];
    }
    const out = [];
    const read = (rules) => {
      for (const rule of rules) {
        if (rule.selectorText) out.push(...splitSelectors(rule.selectorText));
        if (rule.cssRules) read(rule.cssRules);
      }
    };
    read(sheet.cssRules);
    return out;
  }

  // Pseudo-classes that depend on the moment, and pseudo-elements, would always count as
  // misses. What matters is whether the element they style exists.
  const countable = (selector) => selector.replace(/::?(before|after|first-line|first-letter|placeholder|selection|marker|backdrop|hover|focus|focus-visible|focus-within|active|visited)\b/g, '').trim() || '*';

  // How many elements each selector in a potion hits, ingredients and custom CSS alike.
  function count(selectors, css) {
    const all = [...new Set([...selectors, ...cssSelectors(css)])];
    return all.slice(0, 30).map((selector) => {
      try {
        return { selector, matches: document.querySelectorAll(countable(selector)).length };
      } catch {
        return { selector, matches: 0, invalid: true };
      }
    });
  }

  // What happens as the page loads and runs: pop-ups that arrive late, scroll locks.
  function watch() {
    if (UI.ai.log) return;
    const log = (UI.ai.log = []);
    const note = (what, el) => {
      if (log.length >= 40) return;
      log.push({ ms: Math.round(performance.now()), what, ...(el && { selector: UI.selector.unique(el), text: clip(el.innerText, 80) }) });
    };
    const scrollStyles = () => {
      const part = (el) => {
        if (!el) return '-';
        const cs = getComputedStyle(el);
        return `${cs.overflowY} ${cs.position}`;
      };
      return `html ${part(document.documentElement)}, body ${part(document.body)}`;
    };
    let lastScroll = null;
    const seen = new WeakSet();
    const pending = new Set();
    let timer = null;

    const check = () => {
      timer = null;
      const scroll = scrollStyles();
      if (lastScroll && scroll !== lastScroll) note(`Scroll styles changed: ${lastScroll} became ${scroll}`);
      lastScroll = scroll;
      for (const el of pending) {
        if (!el.isConnected || seen.has(el) || el.localName === OURS) continue;
        const cs = getComputedStyle(el);
        const cov = covers(el.getBoundingClientRect());
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        if (((cs.position === 'fixed' || cs.position === 'sticky') && cov >= 0.03) || el.matches(MODAL)) {
          seen.add(el);
          note(`Appeared, covering ${Math.round(cov * 100)}% of the screen`, el);
        }
      }
      pending.clear();
    };

    const start = () => {
      if (!document.documentElement) return setTimeout(start, 10);
      lastScroll = scrollStyles();
      new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === 'attributes') pending.add(m.target);
          for (const node of m.addedNodes) {
            if (node.nodeType !== 1) continue;
            pending.add(node);
            for (const child of [...node.querySelectorAll('*')].slice(0, 200)) pending.add(child);
          }
        }
        timer ||= setTimeout(check, 150);
      }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'open'] });
    };
    start();
  }

  // --- the card ---------------------------------------------------------------------

  const send = (msg) => UI.send(msg);
  const WHERE_ALT = 'Click the purple potion in the Chrome toolbar, or the puzzle piece if it is hidden. The switch is next to the potion name.';

  // Saved and switched cards stay until closed: the user may be reading the AI's chat in
  // another window, and the card holds their Undo.
  const HIDE_AFTER = { unlocked: 7000 };

  function card(c) {
    UI.loadFont();
    const layer = UI.mount();
    layer.querySelector('.ai-card')?.remove();

    let hideTimer = null;
    const remove = () => {
      clearTimeout(hideTimer);
      el.remove();
    };
    const close = () => {
      remove();
      send({ type: 'ai-card-closed' });
    };
    const undoButton = () =>
      h(
        'button',
        {
          class: 'btn sm',
          onclick: async () => {
            remove();
            const res = await send({ type: 'ai-undo', undo: c.undo });
            UI.toast(res?.error || `Undone. ${c.kind === 'saved' && !c.undo.prev ? `“${c.name}” is gone.` : `“${c.name}” is back how it was.`}`);
          },
        },
        'Undo',
      );
    const manage = () => h('button', { class: 'btn sm', onclick: () => send({ type: 'ai-open', what: 'browse', q: c.name }) }, 'See it with my potions');
    const picture = () => h('img', { class: 'ai-pic', src: chrome.runtime.getURL('help/where-switches.png'), alt: WHERE_ALT, onerror: (e) => e.target.remove() });

    const VIEWS = {
      unlocked: () => ({
        title: 'An AI is working here',
        body: [h('p', {}, `It can test and save potions for ${c.host} until you leave the site.`)],
        actions: [
          h(
            'button',
            {
              class: 'btn sm',
              onclick: async () => {
                remove();
                await send({ type: 'ai-lock' });
                UI.toast("Locked. An AI can't come back to this site until you turn AI mode off and on.");
              },
            },
            'Lock it out',
          ),
        ],
      }),
      off: () => ({
        title: 'AI mode is off',
        body: [h('p', {}, 'An AI is asking to use Web Potions on this page. Nothing happens unless you turn on AI mode.')],
        actions: [h('button', { class: 'btn sm primary', onclick: () => send({ type: 'ai-open', what: 'settings' }) }, 'Open settings')],
      }),
      saved: () => ({
        title: 'An AI saved a potion',
        body: [
          h('p', { class: 'ai-name' }, c.name),
          h('p', {}, c.drinkOnly ? 'Drink it from the toolbar when you want it.' : `Runs by itself on ${c.host}.`),
          c.replaces && h('p', {}, `It replaces “${c.replaces.name}”, which is still on.`),
          picture(),
          h('p', { class: 'ai-small' }, 'To turn it off: click the potion in your toolbar, then its switch. Hidden? Look under the puzzle piece.'),
        ],
        actions: [
          undoButton(),
          c.replaces &&
            h(
              'button',
              {
                class: 'btn sm primary',
                onclick: async (e) => {
                  e.target.remove();
                  const res = await send({ type: 'ai-replace', id: c.replaces.id });
                  UI.toast(res?.error || `“${c.replaces.name}” is off.`);
                },
              },
              `Turn off “${c.replaces.name}”`,
            ),
          manage(),
        ],
      }),
      switched: () => ({
        title: `An AI turned a potion ${c.on ? 'on' : 'off'}`,
        body: [h('p', { class: 'ai-name' }, c.name), picture()],
        actions: [undoButton(), manage()],
      }),
    };
    const view = VIEWS[c.kind]();
    const el = h(
      'div',
      { class: 'ai-card', role: 'status', 'data-kind': c.kind },
      h('div', { class: 'titlebar' }, UI.icon('potion', 1), h('span', { class: 't' }, view.title), h('button', { class: 'tb', 'aria-label': 'Close', onclick: close }, '×')),
      h('div', { class: 'ai-body' }, view.body, h('div', { class: 'ai-actions' }, view.actions)),
    );
    layer.append(el);

    if (HIDE_AFTER[c.kind]) {
      const arm = () => (hideTimer = setTimeout(remove, HIDE_AFTER[c.kind]));
      arm();
      el.addEventListener('pointerenter', () => clearTimeout(hideTimer));
      el.addEventListener('pointerleave', arm);
    }
  }

  // --- the badge ----------------------------------------------------------------------

  // "Operated by AI", up for as long as an AI can act on this tab. It sits in the browser's
  // top layer, above even a page's modal dialogs, and clicks pass through to the page.
  let badgeHost = null;
  let badgeTimer = null;
  function badge(until) {
    clearTimeout(badgeTimer);
    if (!until) {
      badgeHost?.remove();
      badgeHost = null;
      UI.layer?.querySelector('.ai-card[data-kind="unlocked"]')?.remove();
      return;
    }
    badgeTimer = setTimeout(() => badge(0), until - Date.now());
    if (badgeHost?.isConnected) return;
    UI.loadFont();
    badgeHost = document.createElement(OURS);
    badgeHost.style.cssText = 'all: initial; display: block; position: fixed; inset: 10px 10px auto auto; z-index: 2147483647; pointer-events: none;';
    const root = badgeHost.attachShadow({ mode: 'closed' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(UI.CSS);
    root.adoptedStyleSheets = [sheet];
    root.append(h('div', { class: 'wp ai-badge' }, h('span', { class: 'vial' }, UI.icon('potion', 1), h('i'), h('i'), h('i')), 'Operated by AI'));
    document.documentElement.append(badgeHost);
    badgeHost.popover = 'manual';
    badgeHost.showPopover();
  }

  UI.ai = { look, point, count, watch, card, badge, log: null };
})();
