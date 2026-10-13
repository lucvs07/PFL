(() => {
  const path = (el) => {
    const parts = [];
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const sib = n.parentElement ? Array.from(n.parentElement.children).filter((c) => c.tagName === n.tagName) : [n];
      const cls = (typeof n.className === 'string' ? n.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
      parts.unshift(`${n.tagName.toLowerCase()}${cls ? '.' + cls : ''}:${sib.indexOf(n)}`);
    }
    return parts.join(' > ');
  };
  window.__pflSnapshot = () => {
    const out = {};
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      out[path(el)] = { x: Math.round(r.x), y: Math.round(r.y + window.scrollY), w: Math.round(r.width), h: Math.round(r.height), fs: getComputedStyle(el).fontSize };
    }
    return out;
  };
})();
