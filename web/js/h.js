// Tiny DOM helper used by all FishBowl vanilla components.
// Exposes window.h (element creation) and window.fbDef (element registration).
//
// h('div', { class: 'card', style: { padding: '8px' }, onclick: fn }, ...children)
//   children may be: strings, numbers, DOM nodes, arrays, false/null (skipped)
//
// fbDef('fb-popup', class { ... })
//   no-op if the element is already defined (idempotent reloads).

(function () {
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'class' || k === 'className') el.className = v;
        else if (k === 'dataset' && typeof v === 'object') Object.assign(el.dataset, v);
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'ref' && typeof v === 'function') v(el);
        else if (k.startsWith('on') && typeof v === 'function') {
          el.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (k === 'value' && (tag === 'input' || tag === 'textarea' || tag === 'select')) {
          el.value = v;
        } else if (k === 'checked' && tag === 'input') {
          el.checked = !!v;
        } else {
          el.setAttribute(k, v === true ? '' : String(v));
        }
      }
    }
    appendKids(el, children);
    return el;
  }

  function appendKids(parent, kids) {
    for (const k of kids) {
      if (k == null || k === false || k === true) continue;
      if (Array.isArray(k)) { appendKids(parent, k); continue; }
      if (k instanceof Node) { parent.appendChild(k); continue; }
      parent.appendChild(document.createTextNode(String(k)));
    }
  }

  function fbDef(name, cls) {
    if (!customElements.get(name)) customElements.define(name, cls);
  }

  // Replace `el`'s children with `kids` (avoids innerHTML churn).
  function fbReplace(el, ...kids) {
    while (el.firstChild) el.removeChild(el.firstChild);
    appendKids(el, kids);
  }

  window.h = h;
  window.fbDef = fbDef;
  window.fbReplace = fbReplace;
})();
