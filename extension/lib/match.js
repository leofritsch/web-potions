// Site patterns, e.g. "*.reddit.com/*", "news.ycombinator.com/item*", "https://example.com/a/*".
//   - "*" matches anything ("*" alone matches every site)
//   - a leading "*." also matches the bare domain (*.reddit.com/* matches reddit.com)
//   - the scheme is optional; a host without a path means the whole host
//   - a plain domain also matches its www. twin
(function (WP) {
  const escape = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const glob = (s, star) => s.split('*').map(escape).join(star);

  function parse(pattern) {
    let p = String(pattern || '').trim();
    if (!p) return null;
    let scheme = null;
    const m = p.match(/^([a-z*][a-z0-9+.-]*):\/\//i);
    if (m) {
      scheme = m[1].toLowerCase();
      p = p.slice(m[0].length);
    }
    const slash = p.indexOf('/');
    const host = (slash === -1 ? p : p.slice(0, slash)).toLowerCase();
    const path = slash === -1 ? '/*' : p.slice(slash);
    return { scheme, host, path };
  }

  function toRegExpSource(pattern) {
    const parsed = parse(pattern);
    if (!parsed) return null;
    const { scheme, host, path } = parsed;

    const schemeRe = !scheme || scheme === '*' ? (scheme ? 'https?' : '[a-z][a-z0-9+.-]*') : escape(scheme);

    let hostRe;
    if (host === '*' || host === '') hostRe = '[^/]*';
    else if (host.startsWith('*.')) hostRe = '(?:[^/]*\\.)?' + glob(host.slice(2), '[^/]*');
    else if (!host.includes('*') && !host.startsWith('www.') && !/^[\d.]+(:\d+)?$/.test(host) && host.includes('.'))
      hostRe = '(?:www\\.)?' + escape(host);
    else hostRe = glob(host, '[^/]*');
    if (!/:\d+$/.test(host) && host !== '*') hostRe += '(?::\\d+)?';

    let pathRe = glob(path, '.*');
    if (!path.endsWith('*')) pathRe += '/?(?:[?#].*)?';

    return `^${schemeRe}://${hostRe}${pathRe}$`;
  }

  function compile(patterns) {
    return (patterns || [])
      .map(toRegExpSource)
      .filter(Boolean)
      .map((src) => new RegExp(src, 'i'));
  }

  function test(patterns, url) {
    if (!url) return false;
    return compile(patterns).some((re) => re.test(url));
  }

  // Chrome match patterns that cover every page a potion could apply to.
  // Matching is host-wide on purpose: the runtime does the precise check, and it
  // needs to be present on the whole host to catch single-page-app navigations.
  function chromePatterns(patterns) {
    const out = new Set();
    for (const pattern of patterns || []) {
      const parsed = parse(pattern);
      if (!parsed) continue;
      const scheme = parsed.scheme === 'http' || parsed.scheme === 'https' ? parsed.scheme : parsed.scheme === 'file' ? 'file' : '*';
      if (scheme === 'file') {
        out.add('file:///*');
        continue;
      }
      const host = parsed.host.replace(/:\d+$/, '');
      if (!host || host === '*' || (host.includes('*') && !/^\*\.[^*]+$/.test(host))) {
        out.add(`${scheme}://*/*`);
      } else if (host.startsWith('*.')) {
        out.add(`${scheme}://${host}/*`);
      } else {
        out.add(`${scheme}://${host}/*`);
        if (!host.startsWith('www.') && host.includes('.') && !/^[\d.]+$/.test(host)) out.add(`${scheme}://www.${host}/*`);
      }
    }
    return [...out];
  }

  // "reddit.com/r/*" -> "reddit.com/*": used to check an iframe's top page, whose
  // path a frame can't see (only its origin).
  function hostOnly(pattern) {
    const parsed = parse(pattern);
    if (!parsed) return null;
    return `${parsed.scheme ? `${parsed.scheme}://` : ''}${parsed.host || '*'}/*`;
  }

  // The pattern stored on frame ingredients: the frame's whole registrable domain,
  // since embed hosts like "<uuid>.claudeusercontent.com" change per embed.
  function frameSite(url) {
    let host;
    try {
      host = new URL(url).hostname;
    } catch {
      return null;
    }
    const parts = host.split('.');
    if (/^[\d.]+$/.test(host) || parts.length < 3) return `*.${host.replace(/^www\./, '')}/*`;
    const keep = /^(co|com|org|net|gov|ac|edu)$/.test(parts[parts.length - 2]) ? 3 : 2;
    return `*.${parts.slice(-keep).join('.')}/*`;
  }

  const isWebUrl = (url) => /^(https?|file):/i.test(url || '');

  function bareHost(url) {
    try {
      return new URL(url).host.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  // Ready-made patterns for a URL: whole site, the current section, the exact page.
  function suggest(url) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return null;
    }
    const host = u.host.replace(/^www\./, '');
    const isName = host.includes('.') && !/^[\d.]+(:\d+)?$/.test(host);
    const segs = u.pathname.split('/').filter(Boolean);
    const site = isName ? `*.${host}/*` : `${host}/*`;
    const section = segs.length > 1 ? `${host}/${segs.slice(0, Math.min(2, segs.length - 1)).join('/')}/*` : null;
    const page = segs.length ? `${host}${u.pathname}` : null;
    return { site, section, page, host };
  }

  // "www.reddit.com" -> "Reddit", "news.ycombinator.com" -> "Ycombinator"
  function siteName(url) {
    const host = bareHost(url).replace(/:\d+$/, '');
    if (!host) return 'This page';
    if (/^[\d.]+$/.test(host) || host === 'localhost' || host.startsWith('[')) return 'Local';
    const parts = host.split('.');
    let i = parts.length > 1 ? parts.length - 2 : 0;
    if (i > 0 && /^(co|com|org|net|gov|ac|edu)$/.test(parts[i])) i--;
    const core = parts[i];
    return core.charAt(0).toUpperCase() + core.slice(1);
  }

  WP.match = { parse, toRegExpSource, compile, test, chromePatterns, suggest, siteName, bareHost, isWebUrl, hostOnly, frameSite };
})((self.WP = self.WP || {}));
