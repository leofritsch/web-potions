// The picker inside an iframe. The brewing window lives in the top page; whatever
// is picked here is sent up as an ingredient scoped to this frame's site.
(function () {
  const UI = (self.WPUI = self.WPUI || {});
  if (UI.frameReady || window.top === window) return;
  UI.frameReady = true;

  let picker = null;
  let fromContext = false;
  let temp = null;

  // Live preview for the styler, applied locally: no round trip while typing.
  function preview(ing) {
    if (temp) document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== temp);
    temp = null;
    if (!ing) return;
    temp = new CSSStyleSheet();
    temp.replaceSync(`${ing.selector} { ${WP.brew.important(ing.css)} }`);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, temp];
  }

  const menuOptions = () => ({
    picker,
    onPreview: preview,
    onCommit(ing) {
      preview(null);
      UI.send({ type: 'frame-ingredient', ingredient: ing, frameUrl: location.href });
      if (fromContext) return stop();
      picker?.unlock();
      if (picker) {
        picker.box.style.display = 'none';
        picker.current = null;
      }
    },
    onDone() {
      preview(null);
      if (fromContext) stop();
      else picker?.unlock();
    },
    onParentOut() {
      stop({ quiet: true });
      parent.postMessage({ __webPotions: 'select-frame' }, '*');
    },
  });

  function start(context = false) {
    fromContext = context;
    if (picker) return picker;
    picker = new UI.Picker({
      bar: false,
      onPick: (el, pt) => UI.menus.actions(el, pt, menuOptions()),
      onExit: () => {
        picker = null;
        UI.menus.close();
        preview(null);
        UI.send({ type: 'frame-exit' });
      },
    });
    picker.onDismiss = () => {
      UI.menus.close();
      preview(null);
      if (fromContext) stop();
      else picker.unlock();
    };
    picker.start();
    return picker;
  }

  function stop({ quiet = true } = {}) {
    if (!picker) return;
    const p = picker;
    picker = null;
    if (quiet) p.onExit = null;
    p.exit();
    UI.menus.close();
    preview(null);
  }

  function zapContext() {
    const el = self.__wpCtx?.el;
    if (!el?.isConnected || el === document.documentElement) return;
    const p = start(true);
    p.lockOn(el);
    UI.menus.actions(el, { x: self.__wpCtx.x, y: self.__wpCtx.y }, menuOptions());
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== 'wp:frame') return false;
    UI.loadFont();
    if (msg.action === 'start') start();
    else if (msg.action === 'stop') stop();
    else if (msg.action === 'zap-context') zapContext();
    return false;
  });
})();
