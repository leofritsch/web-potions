// Looks at the page for the usual annoyances (login walls, overlays, banners stuck to
// the screen, blurred content, locked scrolling) and proposes an ingredient for each.
(function () {
  const UI = (self.WPUI = self.WPUI || {});
  if (UI.diagnose) return;

  const LOGIN =
    /\b(log ?in|sign ?in|sign ?up|create (?:an |a free )?account|join (?:now|free|for free|us)|register|subscribe|continue (?:reading|with)|keep reading|members? only|unlock (?:this|the full))\b/i;
  const RANK = { login: 3, overlay: 2, banner: 1 };
  const LABELS = {
    login: 'Login wall',
    overlay: 'Overlay covering the page',
    banner: 'Banner stuck on screen',
    blur: 'Blurred content',
    scroll: 'Scrolling is locked',
  };

  const clip = (text, n = 46) => {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
  };

  function coverage(el) {
    const r = el.getBoundingClientRect();
    const w = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
    const h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
    return w > 0 && h > 0 ? (w * h) / (innerWidth * innerHeight) : 0;
  }

  function headline(el) {
    const heading = el.querySelector('h1, h2, h3, [role="heading"]');
    const text = heading?.innerText || el.innerText || '';
    return clip(text.split('\n').find((s) => s.trim()));
  }

  function classify(el, cs) {
    const modal = el.matches('dialog[open], [role="dialog"], [aria-modal="true"], [role="alertdialog"]');
    if (cs.position !== 'fixed' && !modal) return null;
    if (cs.visibility === 'hidden' || Number(cs.opacity) === 0 || cs.display === 'none') return null;
    const cov = coverage(el);
    const r = el.getBoundingClientRect();
    const text = (el.innerText || '').slice(0, 3000);
    const nav = el.matches('header, nav, [role="banner"], [role="navigation"]');
    const shell = el.querySelector('main, article, [role="main"], [role="feed"]');
    if (cov >= 0.3 && !shell) return LOGIN.test(text) ? 'login' : 'overlay';
    if (modal && cov >= 0.04) return LOGIN.test(text) ? 'login' : 'overlay';
    if (!nav && cov >= 0.05 && r.top > innerHeight * 0.45) return LOGIN.test(text) ? 'login' : 'banner';
    return null;
  }

  UI.diagnose = function diagnose() {
    const html = document.documentElement;
    const body = document.body;
    const found = [];
    if (!body) return found;

    const hits = [];
    const blurred = [];
    const seen = new Set();
    for (const fx of [0.2, 0.5, 0.8]) {
      for (const fy of [0.15, 0.5, 0.85, 0.97]) {
        for (const el of document.elementsFromPoint(innerWidth * fx, innerHeight * fy)) {
          if (seen.has(el) || el === html || el === body || el.localName === 'web-potions-ui') continue;
          seen.add(el);
          const cs = getComputedStyle(el);
          if (cs.filter.includes('blur') && coverage(el) > 0.2 && !blurred.some((b) => b.contains(el))) blurred.push(el);
          const kind = classify(el, cs);
          if (!kind) continue;
          // Keep the outermost element of a wall; children of one don't count twice.
          const inner = hits.findIndex((h) => el.contains(h.el));
          if (inner !== -1) {
            const prev = hits[inner];
            hits[inner] = { el, kind: RANK[prev.kind] > RANK[kind] ? prev.kind : kind };
          } else if (!hits.some((h) => h.el.contains(el))) hits.push({ el, kind });
        }
      }
    }

    for (const { el, kind } of hits.sort((a, b) => RANK[b.kind] - RANK[a.kind])) {
      found.push({ kind, label: LABELS[kind], detail: headline(el), el, fix: [{ type: 'zap', selector: UI.selector.unique(el) }] });
    }
    for (const el of blurred) {
      found.push({ kind: 'blur', label: LABELS.blur, detail: '', el, fix: [{ type: 'style', selector: UI.selector.unique(el), css: 'filter: none' }] });
    }

    const hidden = (cs) => cs.overflowY === 'hidden' || cs.overflowY === 'clip';
    const hcs = getComputedStyle(html);
    const bcs = getComputedStyle(body);
    const tall = Math.max(html.scrollHeight, body.scrollHeight) > innerHeight + 50;
    if (tall && (hidden(hcs) || hidden(bcs) || bcs.position === 'fixed')) {
      found.push({ kind: 'scroll', label: LABELS.scroll, detail: 'The page is longer than the screen but won’t scroll', el: null, fix: [{ type: 'unscroll' }] });
    }
    return found;
  };

  UI.diagnoseSummary = () => UI.diagnose().map(({ kind, label, detail }) => ({ kind, label, detail }));
})();
