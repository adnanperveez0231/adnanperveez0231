/* Router, shell and global behaviour. */
BS.app = (function () {
  const u = BS.u, st = BS.store;
  const main = document.getElementById('main');
  const sidebar = document.getElementById('sidebar');
  let current = null;   // { view, ctx }
  let menuEl = null;

  const routes = [
    [/^#?\/?$/, 'library'],
    [/^#\/b\/([^/?]+)\/?$/, 'dashboard'],
    [/^#\/b\/([^/?]+)\/outline$/, 'outline'],
    [/^#\/b\/([^/?]+)\/ch\/([^/?]+)$/, 'chapter'],
    [/^#\/b\/([^/?]+)\/w\/([^/?]+)$/, 'editor'],
    [/^#\/b\/([^/?]+)\/notes$/, 'notes'],
    [/^#\/b\/([^/?]+)\/progress$/, 'progress'],
    [/^#\/b\/([^/?]+)\/review$/, 'review'],
    [/^#\/b\/([^/?]+)\/read$/, 'reader'],
    [/^#\/b\/([^/?]+)\/export$/, 'export']
  ];

  function parse() {
    const [path, qs] = location.hash.split('?');
    const query = Object.fromEntries(new URLSearchParams(qs || ''));
    for (const [re, name] of routes) {
      const m = (path || '').match(re);
      if (m) return { name, params: m.slice(1), query };
    }
    return { name: 'library', params: [], query };
  }

  const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

  async function route() {
    closeMenu();
    document.body.classList.remove('sidebar-open');
    const r = parse();
    let book = null;
    if (r.params[0]) {
      book = st.find(r.params[0]);
      if (!book) { go('#/'); return; }
      if (st.S.settings.lastBookId !== book.id) st.saveSettings({ lastBookId: book.id });
    }
    const view = BS.views[r.name];
    const ctx = { book, params: r.params, query: r.query, name: r.name };
    if (r.name === 'editor') {
      const loc = st.locate(book, r.params[1]);
      if (!loc) { go('#/b/' + book.id); return; }
      Object.assign(ctx, loc);
    }
    if (r.name === 'chapter') {
      ctx.chapter = st.chapter(book, r.params[1]);
      if (!ctx.chapter) { go('#/b/' + book.id + '/outline'); return; }
    }
    if (current && current.view.unmount) await current.view.unmount(current.ctx);
    current = { view, ctx };
    renderSidebar();
    render(true);
  }

  function mobileBar(ctx) {
    const title = ctx.book ? ctx.book.title : 'Library';
    return '<div class="mobile-bar"><button class="icon-btn" data-act="openSidebar" aria-label="Open navigation">' + BS.ic('menu') + '</button><span class="mb-title">' + u.esc(title) + '</span>' + saveStateHtml() + '</div>';
  }

  function render(fresh) {
    if (!current) return;
    const { view, ctx } = current;
    const scroll = fresh ? 0 : main.scrollTop;
    main.className = 'main' + (view.layout === 'editor' ? ' is-editor' : '');
    main.innerHTML = mobileBar(ctx) + view.render(ctx);
    document.title = (view.title ? view.title(ctx) + ' — ' : '') + 'Book Studio';
    if (view.mount) view.mount(main, ctx);
    if (!fresh) main.scrollTop = scroll;
    else main.scrollTop = 0;
    updateSaveState();
  }

  function renderSidebar() {
    sidebar.innerHTML = BS.views.sidebar.render(current ? current.ctx : {});
    updateSaveState();
  }

  function refresh() {
    renderSidebar();
    if (current && current.view.onChange) current.view.onChange(current.ctx);
    else render(false);
  }

  /* ---------- save indicator ---------- */
  function saveStateHtml() { return '<span class="save-state" aria-live="polite"></span>'; }
  let lastStatus = null;
  function updateSaveState() {
    const s = st.S.status;
    const just = lastStatus === 'saving' && s === 'saved';
    lastStatus = s;
    document.querySelectorAll('.save-state').forEach((el) => {
      el.className = 'save-state ' + s + (just ? ' just' : '');
      if (s === 'saving') el.innerHTML = '<span class="pulse" aria-hidden="true"></span>Saving…';
      else if (s === 'error') el.innerHTML = BS.ic('x') + 'Not saved — retrying';
      else el.innerHTML = BS.ic('check') + (st.S.lastSaved ? 'Saved' : 'All changes saved');
    });
  }

  /* ---------- menus ---------- */
  function menu(anchor, items) {
    closeMenu();
    const m = document.createElement('div');
    m.className = 'menu';
    m.setAttribute('role', 'menu');
    m.innerHTML = items.map((it, i) => it.sep ? '<hr>' : it.header ? '<div class="menu-label">' + u.esc(it.header) + '</div>' :
      '<button role="menuitem" data-mi="' + i + '" class="' + (it.danger ? 'danger' : '') + '">' + (it.icon ? BS.ic(it.icon) : '') + '<span>' + u.esc(it.label) + '</span></button>').join('');
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    const w = m.offsetWidth, h = m.offsetHeight;
    let left = Math.min(r.left, innerWidth - w - 8);
    let top = r.bottom + 4;
    if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 4);
    m.style.left = Math.max(8, left) + 'px';
    m.style.top = top + 'px';
    m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mi]');
      if (!b) return;
      closeMenu();
      items[+b.dataset.mi].onClick();
    });
    menuEl = m;
    const first = m.querySelector('button');
    if (first) first.focus();
    setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
  }
  function outside(e) { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }
  function closeMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
    document.removeEventListener('mousedown', outside, true);
  }

  /* ---------- theme ---------- */
  function applyTheme() {
    const t = st.S.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  }

  /* ---------- global actions ---------- */
  const actions = {
    openSidebar() { document.body.classList.add('sidebar-open'); },
    closeSidebar() { document.body.classList.remove('sidebar-open'); },
    cycleTheme() {
      const order = ['system', 'light', 'dark'];
      const next = order[(order.indexOf(st.S.settings.theme) + 1) % 3];
      st.saveSettings({ theme: next });
      applyTheme();
      renderSidebar();
      BS.ui.toast('Theme: ' + ({ system: 'match system', light: 'light', dark: 'dark' })[next]);
    },
    async newBook() {
      const d = await BS.ui.form('Create a new book', [
        { name: 'title', label: 'Title', required: true, autofocus: true },
        { name: 'subtitle', label: 'Subtitle', optional: true },
        { name: 'author', label: 'Author name', optional: true, hint: 'Shown on the title page of exports.' },
        { name: 'description', label: 'Description', type: 'textarea', optional: true },
        { name: 'theme', label: 'Central theme', optional: true },
        { name: 'targetWords', label: 'Target length (words)', type: 'number', value: 80000, min: 0 }
      ], 'Create book', { wide: true });
      if (!d) return;
      const b = st.createBook(d);
      go('#/b/' + b.id);
      BS.ui.toast('“' + b.title + '” created', { kind: 'success' });
    },
    async addChapter(el) {
      const book = current && current.ctx.book;
      if (!book) return;
      const title = await BS.ui.prompt('Add chapter', { label: 'Chapter title', value: 'Chapter ' + (book.chapters.length + 1), confirmLabel: 'Add chapter' });
      if (!title) return;
      const c = st.addChapter(book, title);
      BS.ui.toast('Chapter added', { kind: 'success' });
      if (el && el.dataset.open === 'write') go('#/b/' + book.id + '/w/' + c.sections[0].id);
      setTimeout(() => BS.ui.flash(document.querySelector('[data-chapter-id="' + c.id + '"]')), 30);
    },
    quickCapture() { quickCapture(); }
  };

  async function quickCapture() {
    const book = current && current.ctx.book;
    if (!book) { BS.ui.toast('Open a book first to capture a note.'); return; }
    const ctx = current.ctx;
    const d = await BS.ui.form('Capture a thought', [
      { name: 'body', label: 'Note', type: 'textarea', rows: 5, required: true },
      { name: 'type', label: 'Kind', type: 'select', value: 'idea', options: BS.views.notes.TYPES.map((t) => ({ value: t.id, label: t.label })) }
    ], 'Save note', { intro: ctx.section ? 'Linked to “' + ctx.section.title + '”.' : '' });
    if (!d) return;
    st.addNote(book, { body: d.body, type: d.type, chapterId: ctx.chapter ? ctx.chapter.id : '', sectionId: ctx.section ? ctx.section.id : '' });
    BS.ui.toast('Note saved', { kind: 'success' });
  }

  function dispatch(kind, e) {
    const attr = kind === 'click' ? 'act' : kind;
    const el = e.target.closest('[data-' + attr + ']');
    if (!el) return;
    const name = el.dataset[attr];
    const ctx = current ? current.ctx : {};
    const v = current && current.view;
    if (v && v.act && v.act[name]) { if (kind === 'click' && el.tagName === 'A' && !el.getAttribute('href')) e.preventDefault(); v.act[name](el, e, ctx); return; }
    if (BS.views.sidebar.act[name]) { BS.views.sidebar.act[name](el, e, ctx); return; }
    if (actions[name]) { e.preventDefault(); actions[name](el, e, ctx); }
  }

  function bindGlobal() {
    document.addEventListener('click', (e) => dispatch('click', e));
    document.addEventListener('input', (e) => dispatch('input', e));
    document.addEventListener('change', (e) => dispatch('change', e));
    window.addEventListener('hashchange', route);
    document.addEventListener('keydown', (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (current && current.view.forceSave) current.view.forceSave();
        st.flush().then(() => BS.ui.toast('Saved', { kind: 'success', duration: 1500 }));
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'n') { e.preventDefault(); quickCapture(); }
      if (e.key === 'Escape') closeMenu();
    });
    // chart tooltips
    let tip = null;
    document.addEventListener('mouseover', (e) => {
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (!t) { if (tip) { tip.remove(); tip = null; } return; }
      if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; document.body.appendChild(tip); }
      tip.textContent = t.dataset.tip;
      const r = t.getBoundingClientRect();
      tip.style.left = Math.min(innerWidth - 80, Math.max(80, r.left + r.width / 2)) + 'px';
      tip.style.top = r.top + 'px';
    });
    st.on((type) => {
      if (type === 'status') updateSaveState();
      if (type === 'change') refresh();
      if (type === 'save-error') {
        BS.ui.toast('Could not save to this browser’s storage. Download a backup from Export & Backup.', { duration: 8000 });
        setTimeout(() => st.flush(), 4000);
      }
    });
    window.addEventListener('beforeunload', (e) => {
      if (current && current.view.forceSave) current.view.forceSave(true);
      if (st.S.status !== 'saved') { st.flush(); e.preventDefault(); e.returnValue = ''; }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        if (current && current.view.forceSave) current.view.forceSave();
        st.flush();
      }
    });
  }

  async function init() {
    bindGlobal();
    try {
      await st.load();
    } catch (e) {
      console.error(e);
      main.innerHTML = '<div class="page"><div class="empty-lg"><h2>Your library could not be opened</h2><p>' + u.esc(e.message || e) + '</p></div></div>';
      return;
    }
    applyTheme();
    if (!location.hash && st.S.settings.lastBookId && st.find(st.S.settings.lastBookId)) {
      history.replaceState(null, '', '#/b/' + st.S.settings.lastBookId);
    }
    await route();
    if (BS.db.isMemory()) BS.ui.toast('This browser is blocking storage — your writing will not persist. Export regularly.', { duration: 10000 });
    if (st.S.recovered) BS.ui.toast('Recovered unsaved text in “' + st.S.recovered.title + '”.', { kind: 'success', duration: 6000 });
  }

  return { init, go, refresh, render, renderSidebar, menu, closeMenu, current: () => current, saveStateHtml, updateSaveState, actions, quickCapture };
})();


document.addEventListener('DOMContentLoaded', () => BS.app.init());
