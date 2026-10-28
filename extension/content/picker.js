// The element picker: marching ants follow the cursor, a click locks the element and
// hands it to the panel, which shows the action menu.
(function () {
  const UI = self.WPUI;
  if (UI.Picker) return;
  const { h } = UI;

  const BLOCKED = ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'auxclick', 'contextmenu', 'touchstart'];

  const isFrame = (el) => el?.localName === 'iframe' || el?.localName === 'frame';

  class Picker {
    constructor({ onPick, onExit, bar = true }) {
      this.onPick = onPick;
      this.onExit = onExit;
      this.withBar = bar;
      this.current = null;
      this.trail = [];
      this.locked = false;
      this.active = false;
      this.changes = 0;
      this.handle = this.handle.bind(this);
      this.move = this.move.bind(this);
      this.keys = this.keys.bind(this);
      this.frameMessage = this.frameMessage.bind(this);
      this.redraw = () => this.current && this.draw();
    }

    // The picker inside an iframe asks for "Select parent" past its own root: select
    // the iframe element itself out here.
    frameMessage(e) {
      if (e.data?.__webPotions !== 'select-frame' || !this.active) return;
      const frame = [...document.querySelectorAll('iframe, frame')].find((f) => f.contentWindow === e.source);
      if (!frame) return;
      const r = frame.getBoundingClientRect();
      this.lockOn(frame);
      this.onPick(frame, { x: r.left + 24, y: Math.max(r.top, 0) + 24 });
    }

    start({ message = 'Click anything to zap or restyle it' } = {}) {
      if (this.active) return;
      this.active = true;
      const layer = UI.mount();
      this.tag = h('div', { class: 'pick-tag' });
      this.box = h('div', { class: 'pick-box' }, this.tag);
      this.countEl = h('span', { class: 'count' });
      this.bar = !this.withBar ? null : h(
        'div',
        { class: 'pick-bar' },
        UI.icon('picker', 2),
        h('span', { class: 'msg' }, message),
        h('span', { class: 'keys' }, h('span', {}, h('kbd', {}, '↑'), ' parent'), h('span', {}, h('kbd', {}, 'esc'), ' done')),
        this.countEl,
        h('button', { class: 'btn primary', onclick: () => this.exit() }, 'Done'),
      );
      layer.append(this.box);
      if (this.bar) layer.append(this.bar);
      this.setChanges(this.changes);
      addEventListener('message', this.frameMessage);
      addEventListener('mousemove', this.move, true);
      addEventListener('keydown', this.keys, true);
      addEventListener('scroll', this.redraw, true);
      addEventListener('resize', this.redraw);
      for (const type of BLOCKED) addEventListener(type, this.handle, true);
    }

    setChanges(n) {
      this.changes = n;
      if (this.countEl) this.countEl.textContent = n ? `${n} change${n === 1 ? '' : 's'}` : '';
    }

    // Shows the bar and lock on an element without the user hovering first (right-click flow).
    lockOn(el) {
      this.select(el);
      this.lock();
    }

    targetAt(x, y) {
      const el = document.elementFromPoint(x, y);
      if (!el || el === UI.host || el === document.documentElement || el === document.body) return null;
      return el;
    }

    move(e) {
      if (this.locked) return;
      if (UI.isUI(e)) {
        this.box.style.display = 'none';
        this.current = null;
        return;
      }
      const el = this.targetAt(e.clientX, e.clientY);
      if (el && el !== this.current) this.select(el);
    }

    select(el, keepTrail = false) {
      this.current = el;
      if (!keepTrail) this.trail = [];
      this.draw();
    }

    draw() {
      const el = this.current;
      if (!el?.isConnected) {
        this.box.style.display = 'none';
        return;
      }
      const r = el.getBoundingClientRect();
      const b = this.box;
      if (!r.width && !r.height) {
        b.style.display = 'none';
        return;
      }
      b.style.display = 'block';
      b.style.width = `${Math.max(4, r.width)}px`;
      b.style.height = `${Math.max(4, r.height)}px`;
      b.style.transform = `translate(${r.left}px, ${r.top}px)`;
      const frame = isFrame(el) && !this.locked;
      b.classList.toggle('frame', frame);
      this.tag.replaceChildren(
        UI.selector.describe(el),
        h('small', {}, frame ? 'move inside to pick in this frame' : `${Math.round(r.width)}×${Math.round(r.height)}`),
      );
      this.tag.classList.toggle('below', r.top < 24);
    }

    handle(e) {
      if (UI.isUI(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (e.type !== 'click') return;
      if (this.locked) {
        this.onDismiss?.();
        return;
      }
      const el = this.current || this.targetAt(e.clientX, e.clientY);
      if (!el) return;
      this.select(el);
      this.lock();
      this.onPick(el, { x: e.clientX, y: e.clientY });
    }

    keys(e) {
      if (UI.isUI(e) && e.key !== 'Escape') return;
      if (this.locked) return; // the menu handles its own keys
      if (e.key === 'Escape') this.exit();
      else if (e.key === 'ArrowUp' && this.current?.parentElement && this.current.parentElement !== document.body) {
        this.trail.push(this.current);
        this.select(this.current.parentElement, true);
      } else if (e.key === 'ArrowDown' && this.trail.length) this.select(this.trail.pop(), true);
      else if (e.key === 'Enter' && this.current) {
        const r = this.current.getBoundingClientRect();
        this.lock();
        this.onPick(this.current, { x: r.left + Math.min(r.width / 2, 40), y: r.top + Math.min(r.height / 2, 30) });
      } else return;
      e.preventDefault();
      e.stopPropagation();
    }

    lock() {
      this.locked = true;
      this.box.classList.add('locked');
    }

    unlock() {
      this.locked = false;
      this.box?.classList.remove('locked');
      this.draw();
    }

    parent() {
      const up = this.current?.parentElement;
      if (!up || up === document.body || up === document.documentElement) return null;
      this.trail.push(this.current);
      this.select(up, true);
      return up;
    }

    exit() {
      if (!this.active) return;
      this.active = false;
      this.locked = false;
      removeEventListener('message', this.frameMessage);
      removeEventListener('mousemove', this.move, true);
      removeEventListener('keydown', this.keys, true);
      removeEventListener('scroll', this.redraw, true);
      removeEventListener('resize', this.redraw);
      for (const type of BLOCKED) removeEventListener(type, this.handle, true);
      this.box?.remove();
      this.bar?.remove();
      this.current = null;
      this.onExit?.();
    }
  }

  UI.Picker = Picker;
})();
