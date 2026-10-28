// Pixel sprites drawn as ASCII grids. Each letter maps to a palette color, "." is transparent.
// Used for the toolbar icon (scripts/make-icons.mjs), the popup and the in-page UI.
(function (WP) {
  const INK = '#22163A';

  const palette = {
    k: INK,
    w: '#FFFFFF',
    l: '#E7DAFF', // lilac glass
    m: '#C9A8FF', // mid lilac
    p: '#9B30FF', // toxic purple
    P: '#6A12C4', // deep purple
    g: '#7CF29A', // slime green
    G: '#22B455',
    c: '#E8B07A', // cork
    C: '#A86B3C',
    y: '#FFF27A',
  };

  const sprites = {
    potion: [
      '......kkkk......',
      '.....kcccCk.....',
      '.....kcccCk.....',
      '......kkkk......',
      '......kwlk...m..',
      '......kwlk..m.m.',
      '.....kkwlkk..m..',
      '....kwwllllk....',
      '...kwmmmmmmmk...',
      '..kwppmppppppk..',
      '..kppppppmpppk..',
      '.kpmpppppppppPk.',
      '.kppppppppppPPk.',
      '..kpppppppPPPk..',
      '...kkPPPPPPkk...',
      '.....kkkkkk.....',
    ],
    picker: [
      'k.......p...',
      'kk.....ppp..',
      'kwk.....p...',
      'kwwk........',
      'kwwwk.......',
      'kwwwwk......',
      'kwwwwwk.....',
      'kwwwkkkk....',
      'kwkwk.......',
      'kk.kwk......',
      'k...kwk.....',
      '.....kk.....',
    ],
    glow: [
      '............',
      '...kkkkk....',
      '..kwwlllk...',
      '.kwlyyyylk..',
      '.kwyyyyyyk..',
      '.klyyyyyyk..',
      '.klyyyyylk..',
      '..kllllkkk..',
      '...kkkkkPPk.',
      '.........kPk',
      '..........kk',
      '............',
    ],
    wall: [
      'kkkkkkkkkkkk',
      'kmmmkmmmmkmk',
      'kkkkkkkkkkkk',
      'kmkmmm..kmmk',
      'kkkkk....kkk',
      'kmmmk...p.mk',
      'kkkk..p...kk',
      'kmmk...p.kmk',
      'kkkkk...kkkk',
      'kmkmmmkmmmmk',
      'kkkkkkkkkkkk',
      '............',
    ],
    veil: [
      '...........k',
      '..........k.',
      '...kkkkkkk..',
      '..kwwwwwkwk.',
      '.kwwwppkwwwk',
      'kwwwpPkppwwk',
      '.kwwpkppwwk.',
      '..kwkwwwwk..',
      '...kkkkkk...',
      '..k.........',
      '.k..........',
      'k...........',
    ],
    brush: [
      '.........kk.',
      '........kmmk',
      '.......kmmk.',
      '......kmmk..',
      '.....kmmk...',
      '....kCCk....',
      '...kcCk.....',
      '..kppk......',
      '.kpppk......',
      '.kppk.......',
      'kpPk........',
      'kkk.........',
    ],
    wand: [
      '.......y....',
      '..y...yyy...',
      '.......y..y.',
      '............',
      '......kk....',
      '.....kwPk...',
      '....kwPk....',
      '...kkPk.....',
      '..kkkk......',
      '.kkkk.......',
      'kkkk........',
      '.kk.........',
    ],
    gear: [
      '....kkkk....',
      '.kk.kmmk.kk.',
      '.kmkkmmkkmk.',
      '..kmmmmmmk..',
      'kkkmmkkmmkkk',
      'kmmmk..kmmmk',
      'kmmmk..kmmmk',
      'kkkmmkkmmkkk',
      '..kmmmmmmk..',
      '.kmkkmmkkmk.',
      '.kk.kmmk.kk.',
      '....kkkk....',
    ],
    lock: [
      '....kkkk....',
      '...k....k...',
      '..k......k..',
      '..k......k..',
      '.kkkkkkkkkk.',
      '.kmmmmmmmmk.',
      '.kmmmkkmmmk.',
      '.kmmmkkmmmk.',
      '.kmmmmkmmmk.',
      '.kmmmmmmmmk.',
      '.kkkkkkkkkk.',
      '............',
    ],
    play: [
      'kk......',
      'kpk.....',
      'kppk....',
      'kpppk...',
      'kpppk...',
      'kppk....',
      'kpk.....',
      'kk......',
    ],
    pencil: [
      '......kk',
      '.....kmk',
      '....kmk.',
      '...kmk..',
      '..kmk...',
      '.kck....',
      'kck.....',
      'kk......',
    ],
    search: [
      '.kkkk...',
      'kwlllk..',
      'klwllk..',
      'klllkk..',
      '.kkkkk..',
      '....kPk.',
      '.....kPk',
      '......kk',
    ],
  };

  // Turns a sprite into an SVG element, merging horizontal runs into single rects.
  function svg(name, scale = 2, doc = typeof document !== 'undefined' ? document : null) {
    const rows = sprites[name];
    const w = rows[0].length;
    const h = rows.length;
    const NS = 'http://www.w3.org/2000/svg';
    const el = doc.createElementNS(NS, 'svg');
    el.setAttribute('width', w * scale);
    el.setAttribute('height', h * scale);
    el.setAttribute('viewBox', `0 0 ${w} ${h}`);
    el.setAttribute('shape-rendering', 'crispEdges');
    el.setAttribute('aria-hidden', 'true');
    for (const run of runs(rows)) {
      const r = doc.createElementNS(NS, 'rect');
      r.setAttribute('x', run.x);
      r.setAttribute('y', run.y);
      r.setAttribute('width', run.len);
      r.setAttribute('height', 1);
      r.setAttribute('fill', palette[run.ch]);
      el.appendChild(r);
    }
    return el;
  }

  function runs(rows) {
    const out = [];
    rows.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        const ch = row[x];
        let len = 1;
        while (row[x + len] === ch) len++;
        if (ch !== '.' && palette[ch]) out.push({ x, y, len, ch });
        x += len;
      }
    });
    return out;
  }

  WP.pixels = { palette, sprites, svg, runs, INK };
})((self.WP = self.WP || {}));
