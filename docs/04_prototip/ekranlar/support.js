// Minimal local renderer for .dc.html boards (offline preview only).
// Supports: {{ dotted.path }} lookups, <sc-for list as>, <sc-if value>, onClick handlers, <helmet>.
(function () {
  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState(o) { Object.assign(this.state, typeof o === 'function' ? o(this.state) : o); if (this.__render) this.__render(); }
  }
  window.DCLogic = DCLogic;
  const RX = /\{\{\s*([\w.$]+)\s*\}\}/g;
  function look(path, scopes) {
    const p = path.split('.');
    for (const s of scopes) {
      if (s && Object.prototype.hasOwnProperty.call(s, p[0])) {
        let v = s[p[0]];
        for (const k of p.slice(1)) { if (v == null) return undefined; v = v[k]; }
        return v;
      }
    }
    return undefined;
  }
  const str = (v) => (v == null ? '' : typeof v === 'function' ? '' : String(v));
  function interp(text, scopes) { return text.replace(RX, (_, p) => str(look(p, scopes))); }
  function single(text) { const m = /^\s*\{\{\s*([\w.$]+)\s*\}\}\s*$/.exec(text); return m ? m[1] : null; }
  function render(node, scopes, out) {
    if (node.nodeType === 3) { out.appendChild(document.createTextNode(interp(node.nodeValue, scopes))); return; }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'sc-for') {
      const lp = single(node.getAttribute('list') || '');
      const as = node.getAttribute('as');
      const list = lp ? look(lp, scopes) : null;
      if (Array.isArray(list)) list.forEach((item) => { const sc = {}; sc[as] = item; for (const c of node.childNodes) render(c, [sc].concat(scopes), out); });
      return;
    }
    if (tag === 'sc-if') {
      const vp = single(node.getAttribute('value') || '');
      const v = vp ? look(vp, scopes) : false;
      if (v && v !== 'false') for (const c of node.childNodes) render(c, scopes, out);
      return;
    }
    const isSvg = node.namespaceURI === 'http://www.w3.org/2000/svg';
    const el = isSvg ? document.createElementNS(node.namespaceURI, node.tagName) : document.createElement(tag);
    for (const a of Array.from(node.attributes)) {
      const name = a.name;
      if (/^on[a-z]+$/i.test(name)) {
        const fp = single(a.value); const fn = fp ? look(fp, scopes) : null;
        if (typeof fn === 'function') el.addEventListener(name.slice(2).toLowerCase(), fn);
        continue;
      }
      el.setAttribute(name, interp(a.value, scopes));
    }
    const src = tag === 'template' ? node.content : node;
    for (const c of src.childNodes) render(c, scopes, el);
    out.appendChild(el);
  }
  async function boot() {
    const html = await (await fetch(location.href)).text();
    const tm = /<x-dc>([\s\S]*?)<\/x-dc>/.exec(html);
    const sm = /<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/.exec(html);
    if (!tm) return;
    const t = document.createElement('template'); t.innerHTML = tm[1];
    const helmet = t.content.querySelector('helmet');
    if (helmet) { for (const c of Array.from(helmet.childNodes)) document.head.appendChild(c.cloneNode(true)); helmet.remove(); }
    let comp = null;
    if (sm) { const C = new Function('DCLogic', sm[1] + '\n;return Component;')(DCLogic); comp = new C({}); }
    const host = document.querySelector('x-dc'); const root = document.createElement('div'); root.id = 'dc-root';
    host.replaceWith(root);
    const draw = () => { const vals = comp && comp.renderVals ? comp.renderVals() : {}; const frag = document.createDocumentFragment(); for (const c of t.content.childNodes) render(c, [vals], frag); root.replaceChildren(frag); };
    if (comp) comp.__render = draw;
    draw(); document.documentElement.setAttribute('data-dc-ready', '1');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
