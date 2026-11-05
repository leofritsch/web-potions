// Looks at the page for two everyday annoyances, a bar stuck to the bottom of the screen
// and stuck scrolling, and proposes an ingredient for each. It doesn't offer to clear
// dialogs or anything covering the page.
(function () {
  const UI = (self.WPUI = self.WPUI || {});
  if (UI.diagnose) return;

  const LABELS = {
    banner: 'Banner stuck on screen',
    scroll: 'Scrolling is stuck',
  };
  const DIALOG = 'dialog, [role="dialog"], [aria-modal="true"], [role="alertdialog"]';
  const NAV = 'header, nav, [role="banner"], [role="navigation"]';

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

  function isBanner(el, cs) {
    if (cs.position !== 'fixed' || el.closest(DIALOG) || el.matches(NAV)) return false;
    if (cs.visibility === 'hidden' || Number(cs.opacity) === 0 || cs.display === 'none') return false;
    const cov = coverage(el);
    return cov >= 0.05 && cov < 0.3 && el.getBoundingClientRect().top > innerHeight * 0.45;
  }

  UI.diagnose = function diagnose() {
    const html = document.documentElement;
    const body = document.body;
    const found = [];
    if (!body) return found;

    const hits = [];
    const seen = new Set();
    for (const fx of [0.2, 0.5, 0.8]) {
      for (const fy of [0.15, 0.5, 0.85, 0.97]) {
        for (const el of document.elementsFromPoint(innerWidth * fx, innerHeight * fy)) {
          if (seen.has(el) || el === html || el === body || el.localName === 'web-potions-ui') continue;
          seen.add(el);
          if (!isBanner(el, getComputedStyle(el))) continue;
          // Keep the outermost element of a banner; its children don't count twice.
          const inner = hits.findIndex((hit) => el.contains(hit));
          if (inner !== -1) hits[inner] = el;
          else if (!hits.some((hit) => hit.contains(el))) hits.push(el);
        }
      }
    }

    for (const el of hits) {
      found.push({ kind: 'banner', label: LABELS.banner, detail: headline(el), el, fix: [{ type: 'zap', selector: UI.selector.unique(el) }] });
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
