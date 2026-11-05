// The page that opens on install.
(function () {
  const $ = (id) => document.getElementById(id);
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  WP.pixels.sprites.mirror = [
    '..............yy..............',
    '.............kkkk.............',
    '..........kkkkkkkkkk..........',
    '........kkkyyyyyyyykkk........',
    '.......kkyyyyyyyyyyyykk.......',
    '......kkyyyykkkkkkyyyykk......',
    '.....kkyyykkkPPPPkkkyyykk.....',
    '.....kyyykpPpPpPpPpPkyyck.....',
    '....kyyykPPpPPPpPPPpPkccck....',
    '...kkyykpPpPpPpwpPpPpPkcckk...',
    '...kyykpPpPpPpwwPpPpPpPkcck...',
    '..kkyykpppppppwppppppppkcckk..',
    '..kyykpppppppwwppppyppppkcck..',
    '..kyykppppppwwppppyyypppkcck..',
    '..kykpppppppwwpppppypppppkck..',
    '.kyykppppppwwppppppppppppkcck.',
    '.kyykppppppwwppppppppppppkcCk.',
    '.kyykpppppwwpppppppppppppkCCk.',
    '.kyyppppppwpppppppppppppppCCk.',
    '.kyympmpywwpmpmpmpmpmpmpmpCCk.',
    '.kykpmpmpmpmpmpmpmpmpwpmpmkCk.',
    '.kyympmmmpmmmpmmmpmmmpmmmpCCk.',
    '.kyymmpmmmpmmmpmmmpmmmpmmmCCk.',
    '.kyykmmmmmmmmmmmmmmmmmmmmkCCk.',
    '.kyykmmmmmwmmmmmmmmmmmmmmkCCk.',
    '.kyykmmmmwwwmmmmmmmmmmmmmkCCk.',
    '..kykmmmmmwmmmmmmmmgmmmmmkCk..',
    '..kcckmmmmmmmmmmmmgggmmmkCCk..',
    '..kcckmmmmmmmmmmmmmgmmmmkCCk..',
    '..kkcckmmmmmmmmmmmmmmmmkCCkk..',
    '...kcckmmmmmmmmmmmmmmmmkCCk...',
    '...kkccklmlmlmymlmlmlmkCCkk...',
    '....kcccklmlmlmlmlmlmkCCCk....',
    '.....kccckllllllllllkCCCk.....',
    '.....kkccCkkklmllkkkCCCkk.....',
    '......kkCCCCkkkkkkCCCCkk......',
    '.......kkCCCCCCCCCCCCkk.......',
    '........kkkCCCCCCCCkkk........',
    '..........kkkkkkkkkk..........',
    '............kCCCCk............',
    '.........kCCCCCCCCCCk.........',
    '.........kkkkkkkkkkkk.........',
  ];
  $('wand').append(WP.pixels.svg('wand', 7));
  $('mirror').append(WP.pixels.svg('mirror', 6));

  // --- the same fake page, before and after -------------------------------------------

  const page = () => $('site-template').content.cloneNode(true);
  document.querySelector('.scene.before').append(page());
  document.querySelector('.scene.after').append(page());

  // --- a night sky, dithered like it's 2001 ---------------------------------------------

  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const SKY = ['#170A36', '#26104F', '#3D1680', '#6A12C4', '#9B30FF', '#FF7AD9', '#7CF29A'];
  function paintSky(canvas, { glow = 1 } = {}) {
    const ctx = canvas.getContext('2d');
    const { width: w, height: h } = canvas;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = y / h;
        const ripple = Math.sin(x * 0.045 + 2 * Math.sin(x * 0.013)) * 0.1 + Math.sin(x * 0.11 + 1) * 0.03;
        const v = Math.max(0, Math.min(1, (t * 0.82 + ripple * (0.3 + t)) ** 1.7 * glow));
        const i = Math.min(SKY.length - 1, Math.floor(v * (SKY.length - 1) + BAYER[y % 4][x % 4] / 16));
        ctx.fillStyle = SKY[i];
        ctx.fillRect(x, y, 1, 1);
      }
    }
    // Stars, from a fixed recipe so they land in the same place every time.
    let seed = 7;
    const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let n = Math.round((w * h) / 260); n > 0; n--) {
      const x = Math.floor(next() * w);
      const y = Math.floor(next() * h * 0.7);
      ctx.fillStyle = next() > 0.8 ? '#FFE27A' : '#FFFFFF';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  for (const canvas of document.querySelectorAll('canvas.sky')) paintSky(canvas);
  document.querySelectorAll('.after .pic canvas').forEach((canvas) => {
    paintSky(canvas, { glow: 1.2 });
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFE27A';
    ctx.fillRect(108, 4, 8, 6);
    ctx.fillRect(109, 3, 6, 8);
  });

  // --- the wand sweeps once, then the seam is yours to drag -----------------------------

  const hero = $('hero');
  const slider = $('slider');
  const seam = (value) => hero.style.setProperty('--seam', `${value}%`);
  const REST = 46;
  let touched = false;

  slider.addEventListener('input', () => {
    touched = true;
    seam(slider.value);
    $('drag-tag').classList.add('gone');
  });

  if (calm) {
    slider.value = REST;
    seam(REST);
  } else {
    const start = performance.now();
    const LONG = 1500;
    const sweep = (now) => {
      if (touched) return;
      const t = Math.min(1, (now - start) / LONG);
      const eased = 1 - (1 - t) ** 3;
      const value = 100 - (100 - REST) * eased;
      slider.value = value;
      seam(value);
      if (t < 1) requestAnimationFrame(sweep);
    };
    requestAnimationFrame(sweep);
    // Animation frames pause in a tab that isn't showing, so make sure it lands anyway.
    setTimeout(() => {
      if (touched) return;
      slider.value = REST;
      seam(REST);
    }, LONG + 100);
  }

  // --- setup, ticking itself off as you do it ---------------------------------------------

  async function refresh() {
    const status = await chrome.runtime.sendMessage({ type: 'status' }).catch(() => null);
    $('check-scripts').classList.toggle('done', !!status?.userScripts);
    const settings = await chrome.action?.getUserSettings?.().catch(() => null);
    $('check-pin').classList.toggle('done', !!settings?.isOnToolbar);
  }
  $('open-setup').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'openSetup' }));
  addEventListener('focus', refresh);
  setInterval(refresh, 3000);
  refresh();
})();
