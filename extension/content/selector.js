// CSS selectors for picked elements: one that pins down exactly this element, and
// one that catches its look-alikes ("remove all like this").
(function () {
  const UI = (self.WPUI = self.WPUI || {});
  if (UI.selector) return;

  const esc = (s) => CSS.escape(s);
  const count = (sel) => {
    try {
      return document.querySelectorAll(sel).length;
    } catch {
      return 0;
    }
  };

  // Class names and ids minted by build tools change on every deploy; skip them.
  const GENERATED = [
    /\d{3,}/,
    /^(css|sc|jsx|emotion|styled|tw|svelte|astro|r|x)-[a-z0-9]{4,}/i,
    /^x[a-z0-9]{6,}$/,
    /^_[a-zA-Z0-9_-]{4,}$/,
    /[_-]{1,3}[a-zA-Z0-9]{5,}$(?<=\d.*)/,
    /^[a-zA-Z]{1,2}[A-Z][a-zA-Z]{3,}$/,
    /[:[\]]/,
  ];
  const STATEFUL = /^(is-|has-)?(active|hover|hovered|focus|focused|open|opened|selected|visible|hidden|show|shown|expanded|collapsed|loading|loaded|animating|current)$/i;
  const stable = (name) => !!name && name.length < 40 && !GENERATED.some((re) => re.test(name)) && !STATEFUL.test(name);

  const TEST_ATTRS = ['data-testid', 'data-test-id', 'data-test', 'data-qa', 'data-cy', 'data-component', 'data-module'];

  function stableClasses(el) {
    return [...el.classList].filter(stable);
  }

  function segment(el) {
    const tag = el.localName;
    for (const attr of TEST_ATTRS) {
      const v = el.getAttribute(attr);
      if (v && stable(v.replace(/[-_]/g, ''))) return `${tag}[${attr}="${esc(v)}"]`;
    }
    const cls = stableClasses(el).slice(0, 2);
    return tag + cls.map((c) => '.' + esc(c)).join('');
  }

  function nth(el) {
    let i = 1;
    for (let s = el.previousElementSibling; s; s = s.previousElementSibling) i++;
    return `:nth-child(${i})`;
  }

  function unique(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id && stable(el.id)) {
      const s = '#' + esc(el.id);
      if (count(s) === 1) return s;
    }
    const parts = [];
    for (let cur = el; cur && cur.nodeType === 1 && cur !== document.documentElement; cur = cur.parentElement) {
      let part = segment(cur);
      if (count([part, ...parts].join(' > ')) === 1 && parts.length) return [part, ...parts].join(' > ');
      const parent = cur.parentElement;
      if (parent && [...parent.children].filter((s) => s !== cur && s.matches(part)).length) part += nth(cur);
      parts.unshift(part);
      const sel = parts.join(' > ');
      if (count(sel) === 1) return sel;
      const up = cur.parentElement;
      if (up?.id && stable(up.id)) {
        const anchored = `#${esc(up.id)} > ${sel}`;
        if (count(anchored) === 1) return anchored;
      }
    }
    return parts.join(' > ');
  }

  // A broader selector for elements that look like this one, or null if there are none.
  function similar(el) {
    const tag = el.localName;
    const candidates = [];
    for (const attr of TEST_ATTRS) {
      const v = el.getAttribute(attr);
      if (v) candidates.push(`${tag}[${attr}="${esc(v)}"]`);
    }
    const cls = stableClasses(el);
    if (cls.length) candidates.push(tag + cls.slice(0, 3).map((c) => '.' + esc(c)).join(''));
    if (cls.length > 1) candidates.push(tag + '.' + esc(cls[0]));
    if (tag.includes('-')) candidates.push(tag);
    if (el.parentElement && el.parentElement !== document.body) candidates.push(`${unique(el.parentElement)} > ${segment(el)}`);
    for (const sel of candidates) {
      const n = count(sel);
      if (n > 1 && n < 400 && el.matches(sel)) return { selector: sel, count: n };
    }
    return null;
  }

  function describe(el) {
    const tag = el.localName;
    const id = el.id && stable(el.id) ? '#' + el.id : '';
    const cls = stableClasses(el).slice(0, 2).map((c) => '.' + c).join('');
    const label = tag + id + cls;
    return label.length > 42 ? label.slice(0, 41) + '…' : label;
  }

  UI.selector = { unique, similar, describe, count };
})();
