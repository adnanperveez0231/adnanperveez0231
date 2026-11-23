/* Dialogs, toasts and small interaction helpers. */
BS.ui = (function () {
  const u = BS.u;

  function toast(message, opts) {
    opts = opts || {};
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = 'toast' + (opts.kind ? ' toast-' + opts.kind : '');
    el.innerHTML = (opts.kind === 'success' ? BS.ic('check', 'toast-ic') : '') + '<span>' + u.esc(message) + '</span>' +
      (opts.action ? '<button class="btn btn-ghost btn-sm" type="button">' + u.esc(opts.action) + '</button>' : '');
    root.appendChild(el);
    const remove = () => { el.classList.add('out'); setTimeout(() => el.remove(), 200); };
    if (opts.action) el.querySelector('button').onclick = () => { remove(); opts.onAction && opts.onAction(); };
    setTimeout(remove, opts.duration || (opts.action ? 7000 : 3200));
  }

  let openCount = 0;
  function modal(o) {
    return new Promise((resolve) => {
      const root = document.getElementById('modal-root');
      const wrap = document.createElement('div');
      wrap.className = 'modal-wrap';
      const prev = document.activeElement;
      wrap.innerHTML =
        '<div class="modal' + (o.wide ? ' modal-wide' : '') + (o.full ? ' modal-full' : '') + '" role="dialog" aria-modal="true" aria-labelledby="mt-' + (++openCount) + '">' +
          '<header class="modal-head"><h2 id="mt-' + openCount + '">' + u.esc(o.title) + '</h2>' +
          '<button class="icon-btn" data-close aria-label="Close">' + BS.ic('x') + '</button></header>' +
          '<div class="modal-body">' + (o.body || '') + '</div>' +
          (o.actions && o.actions.length ? '<footer class="modal-foot">' + o.actions.map((a, i) =>
            '<button type="button" class="btn ' + (a.kind === 'primary' ? 'btn-primary' : a.kind === 'danger' ? 'btn-danger' : 'btn-ghost') + '" data-i="' + i + '">' + u.esc(a.label) + '</button>').join('') + '</footer>' : '') +
        '</div>';
      root.appendChild(wrap);
      let done = false;
      const close = (val) => {
        if (done) return;
        done = true;
        document.removeEventListener('keydown', onKey, true);
        wrap.classList.add('out');
        setTimeout(() => wrap.remove(), 150);
        if (prev && prev.focus) prev.focus();
        resolve(val);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); close(undefined); }
        if (e.key === 'Enter' && o.enterSubmits !== false && e.target.tagName === 'INPUT') {
          const primary = (o.actions || []).findIndex((a) => a.kind === 'primary' || a.kind === 'danger');
          if (primary >= 0) { e.preventDefault(); wrap.querySelector('[data-i="' + primary + '"]').click(); }
        }
      };
      document.addEventListener('keydown', onKey, true);
      wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(undefined); });
      wrap.querySelector('[data-close]').onclick = () => close(undefined);
      wrap.querySelectorAll('[data-i]').forEach((b) => {
        b.onclick = () => {
          const a = o.actions[+b.dataset.i];
          if (a.validate && !a.validate(wrap)) return;
          close(a.value !== undefined ? a.value : (a.collect ? a.collect(wrap) : a.label));
        };
      });
      if (o.mount) o.mount(wrap.querySelector('.modal'), close);
      const f = wrap.querySelector('[autofocus]') || wrap.querySelector('input,textarea,select') || wrap.querySelector('.modal-foot .btn-primary');
      if (f) f.focus();
    });
  }

  function confirm(title, message, opts) {
    opts = opts || {};
    return modal({
      title,
      body: '<p class="modal-text">' + u.esc(message) + '</p>',
      actions: [{ label: 'Cancel', value: false }, { label: opts.confirmLabel || 'Confirm', kind: opts.danger ? 'danger' : 'primary', value: true }]
    }).then((v) => v === true);
  }

  function field(f) {
    const id = 'f-' + f.name;
    const val = u.esc(f.value == null ? '' : f.value);
    let input;
    if (f.type === 'textarea') input = '<textarea id="' + id + '" name="' + f.name + '" rows="' + (f.rows || 3) + '" placeholder="' + u.esc(f.placeholder || '') + '">' + val + '</textarea>';
    else if (f.type === 'select') input = '<select id="' + id + '" name="' + f.name + '">' + f.options.map((o) => '<option value="' + u.esc(o.value) + '"' + (String(o.value) === String(f.value) ? ' selected' : '') + '>' + u.esc(o.label) + '</option>').join('') + '</select>';
    else input = '<input id="' + id + '" name="' + f.name + '" type="' + (f.type || 'text') + '" value="' + val + '" placeholder="' + u.esc(f.placeholder || '') + '"' + (f.min != null ? ' min="' + f.min + '"' : '') + (f.autofocus ? ' autofocus' : '') + '>';
    return '<label class="field" for="' + id + '"><span class="field-label">' + u.esc(f.label) + (f.optional ? ' <span class="muted">(optional)</span>' : '') + '</span>' + input + (f.hint ? '<span class="field-hint">' + u.esc(f.hint) + '</span>' : '') + '</label>';
  }

  function form(title, fields, confirmLabel, opts) {
    opts = opts || {};
    return modal({
      title,
      wide: opts.wide,
      body: (opts.intro ? '<p class="modal-text">' + u.esc(opts.intro) + '</p>' : '') + '<div class="form">' + fields.map(field).join('') + '</div>',
      actions: [
        { label: 'Cancel', value: null },
        {
          label: confirmLabel || 'Save', kind: opts.danger ? 'danger' : 'primary',
          validate: (w) => {
            for (const f of fields) {
              if (f.required) {
                const el = w.querySelector('[name="' + f.name + '"]');
                if (!el.value.trim()) { el.focus(); el.classList.add('invalid'); return false; }
              }
            }
            return true;
          },
          collect: (w) => {
            const out = {};
            fields.forEach((f) => { out[f.name] = w.querySelector('[name="' + f.name + '"]').value; });
            return out;
          }
        }
      ]
    }).then((v) => v || null);
  }

  function prompt(title, o) {
    o = o || {};
    return form(title, [{ name: 'v', label: o.label || 'Name', value: o.value || '', placeholder: o.placeholder, required: true, autofocus: true }], o.confirmLabel || 'Save').then((r) => (r ? r.v.trim() : null));
  }

  async function busy(btn, fn, label) {
    if (!btn || btn.disabled) return;
    const html = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('is-busy');
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>' + u.esc(label || 'Working…') + '</span>';
    try { return await fn(); }
    finally { btn.disabled = false; btn.classList.remove('is-busy'); btn.innerHTML = html; }
  }

  // Briefly mark a freshly created/changed element.
  function flash(el) {
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  function pickFile(accept) {
    return new Promise((resolve) => {
      const i = document.createElement('input');
      i.type = 'file';
      i.accept = accept || '';
      i.onchange = () => resolve(i.files[0] || null);
      i.click();
    });
  }

  const statusLabels = { draft: 'Draft', review: 'In Review', final: 'Finalized' };

  return { toast, modal, confirm, form, prompt, field, busy, flash, pickFile, statusLabels };
})();
