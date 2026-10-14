// Auditoria injetável: cole no console ou injete com o Playwright e chame window.__pflAudit().
(() => {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(',').map((x) => parseFloat(x));
    return { r, g, b, a };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const bgOf = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.9) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  // tamanho efetivo de toque: o maior entre o elemento e o seu ::after posicionado (área expandida)
  const hitBox = (el) => {
    const host = el.matches('input[type="radio"], input[type="checkbox"]') ? el.closest('label') || el : el;
    const r = host.getBoundingClientRect();
    const after = getComputedStyle(el, '::after');
    if (after.content !== 'none' && after.position === 'absolute') {
      const insets = ['top', 'right', 'bottom', 'left'].map((k) => parseFloat(after[k]) || 0);
      return { w: r.width - insets[1] - insets[3], h: r.height - insets[0] - insets[2] };
    }
    return { w: r.width, h: r.height };
  };

  window.__pflAudit = () => {
    const doc = document.documentElement;
    const smallTargets = [];
    for (const el of document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], summary')) {
      if (!visible(el) || el.disabled) continue;
      const { w, h } = hitBox(el);
      if (w < 44 - 0.5 || h < 44 - 0.5) {
        smallTargets.push({ text: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 30), cls: String(el.className).slice(0, 40), w: Math.round(w), h: Math.round(h) });
      }
    }
    const lowContrast = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent.trim();
      const el = n.parentElement;
      if (!text || !el || !visible(el) || el.closest('[aria-hidden="true"], canvas')) continue;
      const s = getComputedStyle(el);
      const fg = parse(s.color);
      if (!fg) continue;
      const bg = bgOf(el);
      const size = parseFloat(s.fontSize);
      const large = size >= 24 || (size >= 18.66 && parseInt(s.fontWeight, 10) >= 700);
      const r = ratio(fg, bg);
      if (r < (large ? 3 : 4.5)) {
        lowContrast.push({ text: text.slice(0, 30), cls: String(el.className).slice(0, 40), ratio: Math.round(r * 100) / 100, fg: s.color, bg: `rgb(${bg.r}, ${bg.g}, ${bg.b})` });
      }
    }
    // elementos que passam da borda direita da viewport (causa provável de rolagem horizontal)
    const wide = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > doc.clientWidth + 1 && getComputedStyle(el).position !== 'fixed') wide.push({ cls: String(el.className).slice(0, 40) || el.tagName, right: Math.round(r.right) });
    }
    return {
      overflowX: doc.scrollWidth > doc.clientWidth,
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      overflowers: wide.slice(0, 8),
      smallTargets,
      lowContrast,
    };
  };
})();
