// Turns a potion into the scripts that run on a page.
//
// A potion is { id, name, sites[], enabled, ingredients[], css, js, repeat, delay, world }.
// Ingredients are point-and-click building blocks:
//   { type: 'zap',    selector }              hide an element
//   { type: 'style',  selector, css }         restyle an element
//   { type: 'glow',   words[], color }        highlight keywords (CSS Highlight API, no DOM changes)
//   { type: 'unwall' }                        lift login walls and scroll locks, keeps watching
//   { type: 'unscroll' }                      only unlock scrolling
//   { type: 'veil',   mode: 'blur'|'blank' }  hide images until hovered
// zap and style may carry `frame: '<site pattern>'`: they then apply inside iframes
// whose URL matches it (while the top page matches the potion's sites). Glow applies
// inside every iframe of a matching page too.
(function (WP) {
  const GLOW_COLORS = ['#B6FF5C', '#FFF27A', '#FFB3E6', '#C9A8FF'];

  const VEIL_CSS = {
    blur: 'filter: blur(18px) grayscale(1) !important; opacity: .5 !important;',
    blank: 'filter: grayscale(1) brightness(0) invert(.93) !important;',
  };
  const VEILED = 'img, picture, video, canvas, svg image, [role="img"]';

  // Adds !important to every declaration so a restyle wins over the site's own CSS.
  function important(css) {
    const out = [];
    let depth = 0;
    let quote = null;
    let start = 0;
    const text = String(css || '');
    for (let i = 0; i <= text.length; i++) {
      const ch = text[i];
      if (quote) {
        if (ch === quote && text[i - 1] !== '\\') quote = null;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if ((ch === ';' && depth === 0) || i === text.length) {
        const decl = text.slice(start, i).trim();
        if (decl.includes(':')) out.push(/!important$/i.test(decl) ? decl : `${decl} !important`);
        start = i + 1;
      }
    }
    return out.join('; ');
  }

  function rule(ing) {
    if (ing.type === 'zap') return `${ing.selector} { display: none !important; }`;
    if (ing.type === 'style' && ing.css?.trim()) return `${ing.selector} { ${important(ing.css)} }`;
    return null;
  }

  function compile(potion) {
    const css = [];
    const glow = [];
    const frames = new Map();
    let unwall = false;
    for (const ing of potion.ingredients || []) {
      if (ing.frame && rule(ing)) {
        if (!frames.has(ing.frame)) frames.set(ing.frame, []);
        frames.get(ing.frame).push(rule(ing));
      } else if (rule(ing)) css.push(rule(ing));
      else if (ing.type === 'unscroll') unwall = unwall || { overlays: false };
      else if (ing.type === 'glow' && ing.words?.length) {
        const color = /^#[0-9a-f]{3,8}$/i.test(ing.color) ? ing.color : GLOW_COLORS[0];
        glow.push({ words: ing.words, color });
      } else if (ing.type === 'unwall') unwall = { overlays: true };
      else if (ing.type === 'veil') {
        css.push(`${VEILED.split(', ').map((s) => `${s}:not(:hover)`).join(', ')} { ${VEIL_CSS[ing.mode] || VEIL_CSS.blur} }`);
        css.push(`${VEILED} { transition: filter .15s ease-out, opacity .15s ease-out !important; }`);
      }
    }
    if (potion.css?.trim()) css.push(potion.css);
    const frameList = [...frames].map(([pattern, rules]) => ({ pattern: WP.match.toRegExpSource(pattern), css: rules.join('\n') }));
    return { css: css.join('\n'), glow, unwall, frames: frameList.filter((f) => f.pattern) };
  }

  const hasFrames = (potion) => (potion.ingredients || []).some((i) => i.frame || i.type === 'glow');

  // Everything below runs inside the page. It must stay self-contained:
  // it is shipped as source text via Function.prototype.toString.
  function potionRuntime(cfg) {
    // Inside an iframe only the frame-scoped rules and the glow apply, and in auto mode
    // only while the top page belongs to one of the potion's sites.
    if (window.top === window) {
      if (cfg.framesOnly) return;
    } else {
      const own = cfg.frames.filter((f) => new RegExp(f.pattern, 'i').test(location.href));
      if (!own.length && !cfg.glow.length) return;
      if (cfg.mode === 'auto') {
        const origins = location.ancestorOrigins || [];
        let top = origins[origins.length - 1];
        if (!top || top === 'null') top = document.referrer ? new URL(document.referrer).origin : '';
        if (!top || !cfg.hostPatterns.some((s) => new RegExp(s, 'i').test(`${top}/`))) return;
      }
      cfg = { ...cfg, mode: 'frame', css: own.map((f) => f.css).join('\n'), unwall: false, customJs: false };
    }
    const KEY = Symbol.for('web-potions');
    const hub =
      globalThis[KEY] ||
      (globalThis[KEY] = {
        potions: {},
        defs: {},
        define(id, fn) {
          this.defs[id] = fn;
        },
        watchers: new Set(),
        watch(fn) {
          this.watchers.add(fn);
          if (!this.ticker) {
            let last = location.href;
            this.ticker = setInterval(() => {
              if (location.href === last) return;
              last = location.href;
              for (const w of this.watchers) w();
            }, 600);
          }
          return () => this.watchers.delete(fn);
        },
      });

    hub.potions[cfg.id]?.stop();
    delete hub.defs[cfg.id];

    const patterns = cfg.patterns.map((s) => new RegExp(s, 'i'));
    const timers = new Set();
    const cleanups = [];
    const state = { name: cfg.name, mode: cfg.mode, live: false, runs: 0, error: null };
    let generation = 0;

    const later = (ms, fn) => {
      const t = setTimeout(() => {
        timers.delete(t);
        fn();
      }, ms);
      timers.add(t);
      return t;
    };
    const every = (ms, fn) => {
      const t = setInterval(fn, ms);
      timers.add(t);
      return t;
    };
    const whenReady = (fn) => {
      const g = generation;
      const go = () => g === generation && fn();
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true });
      else go();
    };
    const throttle = (ms, fn) => {
      let pending = false;
      return () => {
        if (pending) return;
        pending = true;
        later(ms, () => {
          pending = false;
          fn();
        });
      };
    };

    function addSheet(text) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(text);
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
      cleanups.push(() => {
        document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet);
      });
    }

    function startGlow(list) {
      if (!globalThis.CSS?.highlights || !document.body) return;
      const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const tag = cfg.id.replace(/[^a-z0-9]/gi, '');
      const entries = [];
      list.forEach((g, i) => {
        const words = g.words.map((w) => w.trim()).filter(Boolean).sort((a, b) => b.length - a.length);
        if (!words.length) return;
        const name = `wp-glow-${tag}-${i}`;
        const re = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${words.map(esc).join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
        const hl = new Highlight();
        // Later ingredients paint on top where highlights overlap.
        hl.priority = i;
        CSS.highlights.set(name, hl);
        addSheet(`::highlight(${name}) { background-color: ${g.color}; color: #22163A; }`);
        cleanups.push(() => CSS.highlights.delete(name));
        entries.push({ re, hl });
      });
      if (!entries.length) return;
      const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'TEMPLATE']);
      const scan = () => {
        for (const e of entries) e.hl.clear();
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
          acceptNode(n) {
            const p = n.parentElement;
            if (!p || SKIP.has(p.tagName) || p.isContentEditable) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          },
        });
        let hits = 0;
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const text = n.nodeValue;
          if (text.length < 2) continue;
          for (const e of entries) {
            e.re.lastIndex = 0;
            for (let m = e.re.exec(text); m; m = e.re.exec(text)) {
              const r = new Range();
              r.setStart(n, m.index);
              r.setEnd(n, m.index + m[0].length);
              e.hl.add(r);
              hits++;
            }
          }
        }
        state.hits = hits;
      };
      scan();
      const observer = new MutationObserver(throttle(400, scan));
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      cleanups.push(() => observer.disconnect());
    }

    function startUnwall({ overlays }) {
      const changed = [];
      const set = (el, prop, value) => {
        if (el.style.getPropertyValue(prop) === value && el.style.getPropertyPriority(prop) === 'important') return;
        changed.push([el, prop, el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)]);
        el.style.setProperty(prop, value, 'important');
      };
      const vw = () => innerWidth;
      const vh = () => innerHeight;
      const coverage = (el) => {
        const r = el.getBoundingClientRect();
        const w = Math.min(r.right, vw()) - Math.max(r.left, 0);
        const h = Math.min(r.bottom, vh()) - Math.max(r.top, 0);
        return w > 0 && h > 0 ? (w * h) / (vw() * vh()) : 0;
      };
      const isWall = (el, cs) => {
        if (el === document.documentElement || el === document.body || el.localName === 'web-potions-ui') return false;
        if (document.fullscreenElement && (el === document.fullscreenElement || el.contains(document.fullscreenElement))) return false;
        const modal = el.matches('dialog[open], [role="dialog"], [aria-modal="true"]');
        if (cs.position !== 'fixed' && !modal) return false;
        if (coverage(el) < (modal ? 0.08 : 0.3)) return false;
        // Big fixed wrappers that hold the actual content are app shells, not walls.
        if (!modal && el.querySelector('main, article, [role="main"], [role="feed"]')) return false;
        return true;
      };
      const pass = () => {
        const root = document.documentElement;
        const body = document.body;
        if (!body) return;
        for (const el of [root, body]) {
          const cs = getComputedStyle(el);
          if (cs.overflowY === 'hidden' || cs.overflow === 'hidden') set(el, 'overflow-y', 'auto');
          if (cs.pointerEvents === 'none') set(el, 'pointer-events', 'auto');
          if (el === body && cs.position === 'fixed') set(el, 'position', 'static');
        }
        for (const el of document.querySelectorAll('body > [inert], body > * > [inert], main[inert]')) {
          el.removeAttribute('inert');
          cleanups.push(() => el.setAttribute('inert', ''));
        }
        if (!overlays) return;
        const seen = new Set();
        const points = [[0.5, 0.5], [0.5, 0.2], [0.5, 0.8], [0.2, 0.5], [0.8, 0.5]];
        for (const [fx, fy] of points) {
          for (const el of document.elementsFromPoint(vw() * fx, vh() * fy)) {
            if (seen.has(el)) continue;
            seen.add(el);
            const cs = getComputedStyle(el);
            if (isWall(el, cs)) {
              set(el, 'display', 'none');
              break;
            }
            if (cs.filter.includes('blur')) set(el, 'filter', 'none');
            if (cs.pointerEvents === 'none' && coverage(el) > 0.3) set(el, 'pointer-events', 'auto');
          }
        }
      };
      pass();
      const run = throttle(250, pass);
      const observer = new MutationObserver(run);
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'open'] });
      every(2000, pass);
      cleanups.push(() => {
        observer.disconnect();
        for (const [el, prop, value, priority] of changed.reverse()) {
          if (value) el.style.setProperty(prop, value, priority);
          else el.style.removeProperty(prop);
        }
      });
    }

    const api = {
      id: cfg.id,
      name: cfg.name,
      get runs() {
        return state.runs;
      },
      css: (text) => addSheet(text),
      onStop: (fn) => cleanups.push(fn),
      every: (ms, fn) => every(ms, fn),
      later: (ms, fn) => later(ms, fn),
      waitFor(selector, timeout = 15000) {
        return new Promise((resolve, reject) => {
          const found = document.querySelector(selector);
          if (found) return resolve(found);
          const observer = new MutationObserver(() => {
            const el = document.querySelector(selector);
            if (el) {
              observer.disconnect();
              resolve(el);
            }
          });
          observer.observe(document.documentElement, { childList: true, subtree: true });
          cleanups.push(() => observer.disconnect());
          later(timeout, () => {
            observer.disconnect();
            reject(new Error(`waitFor: nothing matched ${selector}`));
          });
        });
      },
    };

    function runCustom() {
      const fn = hub.defs[cfg.id];
      if (!fn) {
        state.error = 'The script has a syntax error, so it never loaded.';
        return;
      }
      state.runs++;
      try {
        const out = fn.call(globalThis, api);
        if (out && typeof out.then === 'function')
          out.catch((e) => {
            state.error = String(e?.message || e);
            console.warn(`[Web Potions] ${cfg.name}:`, e);
          });
      } catch (e) {
        state.error = String(e?.message || e);
        console.warn(`[Web Potions] ${cfg.name}:`, e);
      }
    }

    function start() {
      if (state.live) return;
      state.live = true;
      generation++;
      if (cfg.css) addSheet(cfg.css);
      if (cfg.glow.length) whenReady(() => startGlow(cfg.glow));
      if (cfg.unwall) whenReady(() => startUnwall(cfg.unwall));
      if (cfg.customJs)
        whenReady(() =>
          later(Math.max(0, cfg.delay), () => {
            runCustom();
            if (cfg.repeat > 0) every(Math.max(50, cfg.repeat), runCustom);
          }),
        );
    }

    function halt() {
      if (!state.live) return;
      state.live = false;
      generation++;
      for (const t of timers) {
        clearTimeout(t);
        clearInterval(t);
      }
      timers.clear();
      while (cleanups.length) {
        try {
          cleanups.pop()();
        } catch (e) {
          console.warn(`[Web Potions] ${cfg.name} cleanup:`, e);
        }
      }
    }

    let unwatch = null;
    if (cfg.mode === 'auto') {
      const check = () => (patterns.some((re) => re.test(location.href)) ? start() : halt());
      check();
      unwatch = hub.watch(check);
    } else {
      start();
    }

    state.stop = () => {
      halt();
      unwatch?.();
      delete hub.potions[cfg.id];
      delete hub.defs[cfg.id];
    };
    hub.potions[cfg.id] = state;
  }

  // mode: 'auto' (registered, follows the site patterns), 'manual' (drunk from the popup),
  // 'preview' (live while editing). customJs: false skips the potion's own script.
  // framesOnly: the script skips the top page (it is registered for iframes).
  function sources(potion, { mode = 'auto', customJs = true, framesOnly = false } = {}) {
    const { css, glow, unwall, frames } = compile(potion);
    const hasJs = customJs && !!potion.js?.trim();
    const cfg = {
      id: potion.id,
      name: potion.name || 'Untitled potion',
      mode,
      patterns: (potion.sites || []).map(WP.match.toRegExpSource).filter(Boolean),
      hostPatterns: (potion.sites || []).map(WP.match.hostOnly).map(WP.match.toRegExpSource).filter(Boolean),
      css,
      glow,
      unwall,
      frames,
      customJs: hasJs,
      framesOnly,
      delay: Number(potion.delay) || 0,
      repeat: Number(potion.repeat) || 0,
    };
    const out = [{ code: `(${potionRuntime})(${JSON.stringify(cfg)});` }];
    // The custom script is its own source so a syntax error in it can't take the
    // ingredients down with it.
    if (hasJs)
      out.push({
        code: `globalThis[Symbol.for('web-potions')]?.define(${JSON.stringify(potion.id)}, async function (potion) {\n${potion.js}\n});`,
      });
    return out;
  }

  // Small snippets run against the hub in the page.
  const snippets = {
    stop: (id) => `globalThis[Symbol.for('web-potions')]?.potions?.[${JSON.stringify(id)}]?.stop();`,
    stopAll: () => `(() => { const h = globalThis[Symbol.for('web-potions')]; for (const p of Object.values(h?.potions || {})) p.stop(); })();`,
    status: () =>
      `(() => { const h = globalThis[Symbol.for('web-potions')]; const out = {}; for (const [id, p] of Object.entries(h?.potions || {})) out[id] = { live: p.live, mode: p.mode, runs: p.runs, error: p.error, hits: p.hits }; return out; })();`,
  };

  WP.brew = { compile, sources, snippets, important, hasFrames, GLOW_COLORS, potionRuntime };
})((self.WP = self.WP || {}));
