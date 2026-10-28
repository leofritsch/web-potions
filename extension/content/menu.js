// Right-click-style menus: the action menu for a picked element, the CSS styler,
// and small option lists. Used by the brewing window and by the picker inside iframes.
(function () {
  const UI = (self.WPUI = self.WPUI || {});
  if (UI.menus) return;
  const { h } = UI;

  const QUICK_STYLES = [
    ['Hide', 'display: none'],
    ['Blur', 'filter: blur(8px)'],
    ['Dim', 'opacity: .35'],
    ['Grayscale', 'filter: grayscale(1)'],
    ['Bigger text', 'font-size: 1.25em'],
    ['No background', 'background: none'],
    ['Unstick', 'position: static'],
  ];

  let current = null;

  function place(el, pt) {
    // Keep typing in a menu from reaching the page's own keyboard shortcuts.
    el.addEventListener('keydown', (e) => e.stopPropagation());
    el.style.visibility = 'hidden';
    UI.mount().append(el);
    const r = el.getBoundingClientRect();
    el.style.left = `${UI.clamp(pt.x + 6, 8, innerWidth - r.width - 12)}px`;
    el.style.top = `${UI.clamp(pt.y + 6, 8, innerHeight - r.height - 12)}px`;
    el.style.visibility = '';
  }

  function open(el, pt, keys) {
    close();
    place(el, pt);
    current = { el, keys };
    if (keys) addEventListener('keydown', keys, true);
  }

  function close() {
    if (!current) return;
    current.el.remove();
    if (current.keys) removeEventListener('keydown', current.keys, true);
    current = null;
  }

  function accessLabel(label, key) {
    const i = label.toLowerCase().indexOf(key);
    if (key.length !== 1 || i === -1) return label;
    return [label.slice(0, i), h('u', {}, label[i]), label.slice(i + 1)];
  }

  // Builds a keyboard-driven menu from items { key, label, icon?, hint?, run } or 'sep'.
  function itemMenu(header, items, pt, { onEscape } = {}) {
    const buttons = [];
    const el = h(
      'div',
      { class: 'menu', role: 'menu' },
      header,
      items.map((it) => {
        if (it === 'sep') return h('hr');
        const b = h(
          'button',
          { class: 'item', role: 'menuitem', onclick: it.run, onmouseenter: () => focus(buttons.indexOf(b)) },
          it.icon ? UI.icon(it.icon, 1) : h('span', { style: 'width:12px' }),
          h('span', { class: 'label' }, it.key ? accessLabel(it.label, it.key) : it.label),
          (it.hint || it.key) && h('kbd', {}, it.hint || it.key.toUpperCase()),
        );
        b._it = it;
        buttons.push(b);
        return b;
      }),
    );
    let focused = -1;
    const focus = (i) => {
      focused = i;
      buttons.forEach((b, j) => b.classList.toggle('on', j === i));
    };
    open(el, pt, (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      let handled = true;
      if (e.key === 'Escape') onEscape?.();
      else if (e.key === 'ArrowDown') focus((focused + 1) % buttons.length);
      else if (e.key === 'ArrowUp' && focused >= 0) focus((focused - 1 + buttons.length) % buttons.length);
      else if (e.key === 'ArrowUp') buttons.find((b) => b._it.key === 'p')?._it.run();
      else if (e.key === 'Enter' && focused >= 0) buttons[focused]._it.run();
      else {
        const b = buttons.find((x) => x._it.key && x._it.key === e.key.toLowerCase());
        if (b) b._it.run();
        else handled = false;
      }
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
    return el;
  }

  // opts: { picker, onCommit(ingredient), onPreview(ingredient|null), onDone(reason), onParentOut? }
  function actions(el, pt, opts) {
    const sel = UI.selector.unique(el);
    const like = UI.selector.similar(el);
    const r = el.getBoundingClientRect();
    const commit = (ing) => {
      close();
      opts.onCommit(ing);
    };
    const done = (reason) => {
      close();
      opts.onDone?.(reason);
    };
    const items = [
      { key: 'r', icon: 'picker', label: 'Remove', run: () => commit({ type: 'zap', selector: sel }) },
      like && { key: 'a', label: `Remove all ${like.count} like this`, run: () => commit({ type: 'zap', selector: like.selector }) },
      { key: 'b', icon: 'veil', label: 'Blur', run: () => commit({ type: 'style', selector: sel, css: 'filter: blur(10px)' }) },
      {
        key: 'e',
        icon: 'brush',
        label: 'Edit CSS…',
        run: () =>
          styler(sel, pt, {
            onPreview: opts.onPreview,
            onApply: opts.onCommit,
            onCancel: () => opts.onDone?.('cancel'),
          }),
      },
      'sep',
      {
        key: 'p',
        hint: '↑',
        label: 'Select parent',
        run: () => {
          const up = opts.picker?.parent();
          if (up) actions(up, pt, opts);
          else if (opts.onParentOut) {
            close();
            opts.onParentOut();
          }
        },
      },
      {
        key: 'c',
        label: 'Copy selector',
        run: () => {
          navigator.clipboard.writeText(sel).then(
            () => UI.toast('Copied the selector.'),
            () => UI.toast(sel),
          );
          done('copy');
        },
      },
    ].filter(Boolean);
    const header = h('header', {}, h('code', {}, UI.selector.describe(el)), h('small', {}, `${Math.round(r.width)}×${Math.round(r.height)}`));
    itemMenu(header, items, pt, { onEscape: () => done('cancel') });
  }

  // A small CSS editor for one selector, previewing as you type.
  // opts: { css, onPreview(ingredient|null), onApply(ingredient), onCancel() }
  function styler(selector, pt, opts) {
    const area = h('textarea', {
      spellcheck: false,
      value: opts.css || '',
      placeholder: 'color: hotpink;\nfont-size: 18px;',
      'aria-label': 'CSS for this element',
      oninput: () => live(),
      onkeydown: (e) => {
        UI.tabKey(e);
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') apply();
      },
    });
    const live = () => opts.onPreview?.(area.value.trim() ? { type: 'style', selector, css: area.value } : null);
    const cancel = () => {
      close();
      opts.onPreview?.(null);
      opts.onCancel?.();
    };
    const apply = () => {
      const css = area.value.trim();
      if (!css) return cancel();
      close();
      opts.onApply({ type: 'style', selector, css });
    };
    const el = h(
      'div',
      { class: 'menu' },
      h('header', {}, h('code', {}, `Restyle ${selector}`)),
      h(
        'div',
        { class: 'styler' },
        area,
        h(
          'div',
          { class: 'chips' },
          QUICK_STYLES.map(([label, decl]) =>
            h(
              'button',
              {
                class: 'chip',
                onclick: () => {
                  const v = area.value.trim();
                  area.value = (v ? v.replace(/;?$/, ';\n') : '') + decl + ';';
                  live();
                  area.focus();
                },
              },
              label,
            ),
          ),
        ),
        h(
          'div',
          { class: 'row', style: 'display:flex;justify-content:flex-end;gap:6px' },
          h('button', { class: 'btn', onclick: cancel }, 'Cancel'),
          h('button', { class: 'btn primary', onclick: apply }, 'Apply'),
        ),
      ),
    );
    open(el, pt, (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      cancel();
    });
    if (opts.css) live();
    area.focus();
  }

  // A plain list of choices, e.g. the Share menu.
  function list(pt, items) {
    const wrapped = items.map((it) => (it === 'sep' ? it : { ...it, run: () => (close(), it.run()) }));
    const el = itemMenu(null, wrapped, pt, { onEscape: close });
    // Close on any click outside the list, whether on the page or elsewhere in our UI.
    const away = (e) => {
      if (current?.el !== el) return cleanup();
      const inside = e.currentTarget === UI.root ? el.contains(e.target) : UI.isUI(e);
      if (!inside) {
        close();
        cleanup();
      }
    };
    const cleanup = () => {
      removeEventListener('pointerdown', away, true);
      UI.root.removeEventListener('pointerdown', away, true);
    };
    setTimeout(() => {
      addEventListener('pointerdown', away, true);
      UI.root.addEventListener('pointerdown', away, true);
    });
  }

  UI.menus = { actions, styler, list, close, isOpen: () => !!current };
})();
