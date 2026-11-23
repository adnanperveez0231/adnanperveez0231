/* Personal notes & research library. */
BS.views.notes = (function () {
  const u = BS.u, st = BS.store, ic = BS.ic;
  const TYPES = [
    { id: 'idea', label: 'Thought', icon: 'lightbulb' },
    { id: 'research', label: 'Research', icon: 'search' },
    { id: 'quote', label: 'Quote', icon: 'quote' },
    { id: 'observation', label: 'Observation', icon: 'review' },
    { id: 'include', label: 'To include', icon: 'pin' },
    { id: 'future', label: 'Future chapter', icon: 'book' },
    { id: 'reflection', label: 'Reflection', icon: 'pen' }
  ];
  const typeOf = (id) => TYPES.find((t) => t.id === id) || TYPES[0];
  const typeLabel = (id) => typeOf(id).label;
  const F = { type: '', chapter: '', q: '', showUsed: true, sel: null };

  function filtered(book) {
    const q = F.q.trim().toLowerCase();
    return book.notes.filter((n) => {
      if (F.type && n.type !== F.type) return false;
      if (F.chapter === '__none' && n.chapterId) return false;
      if (F.chapter && F.chapter !== '__none' && n.chapterId !== F.chapter) return false;
      if (!F.showUsed && n.used) return false;
      if (q && !(n.title + ' ' + n.body + ' ' + n.source + ' ' + n.url).toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
  }

  function rowHtml(book, n) {
    const t = typeOf(n.type);
    const ch = n.chapterId && st.chapter(book, n.chapterId);
    return '<button class="note-row' + (F.sel === n.id ? ' on' : '') + '" data-act="select" data-id="' + n.id + '">' +
      '<div class="nt">' + ic(t.icon) + '<span>' + u.esc(n.title || u.excerpt(n.body, 60) || 'Untitled note') + '</span>' + (n.pinned ? ic('pin') : '') + '</div>' +
      (n.title && n.body ? '<div class="nb">' + u.esc(u.excerpt(n.body, 140)) + '</div>' : '') +
      '<div class="nm"><span>' + t.label + '</span>' + (ch ? '<span>· ' + u.esc(u.excerpt(ch.title, 28)) + '</span>' : '') + (n.used ? '<span>· incorporated</span>' : '') + '</div></button>';
  }

  function editorHtml(book, n) {
    if (!n) return '<div class="card"><p class="empty">Select a note to read or edit it, or capture a new one above.</p></div>';
    const ch = n.chapterId && st.chapter(book, n.chapterId);
    const chOpts = [{ value: '', label: 'Not linked' }].concat(book.chapters.map((c) => ({ value: c.id, label: c.title })));
    const secOpts = [{ value: '', label: ch ? 'Whole chapter' : '—' }].concat(ch ? ch.sections.map((s) => ({ value: s.id, label: s.title })) : []);
    const sel = (name, opts, val, label) => '<label class="field"><span class="field-label">' + label + '</span><select data-change="field" data-f="' + name + '"' + (name === 'sectionId' && !ch ? ' disabled' : '') + '>' +
      opts.map((o) => '<option value="' + u.esc(o.value) + '"' + (o.value === val ? ' selected' : '') + '>' + u.esc(o.label) + '</option>').join('') + '</select></label>';
    return '<div class="card note-editor" data-note="' + n.id + '">' +
      '<input class="ne-title" placeholder="Title" value="' + u.esc(n.title) + '" data-input="field" data-f="title" aria-label="Note title">' +
      '<textarea class="ne-body" placeholder="Write the note…" data-input="field" data-f="body" aria-label="Note text">' + u.esc(n.body) + '</textarea>' +
      '<div class="ne-meta">' +
      sel('type', TYPES.map((t) => ({ value: t.id, label: t.label })), n.type, 'Kind') +
      '<label class="field"><span class="field-label">Source or attribution</span><input value="' + u.esc(n.source) + '" data-input="field" data-f="source" placeholder="Author, book, interview…"></label>' +
      '<label class="field" style="grid-column:1/-1"><span class="field-label">Reference link</span><div class="row"><input type="url" value="' + u.esc(n.url) + '" data-input="field" data-f="url" placeholder="https://">' +
      (n.url ? '<a class="icon-btn" href="' + u.esc(n.url) + '" target="_blank" rel="noopener noreferrer" aria-label="Open link">' + ic('link') + '</a>' : '') + '</div></label>' +
      sel('chapterId', chOpts, n.chapterId, 'Chapter') + sel('sectionId', secOpts, n.sectionId, 'Section') +
      '</div>' +
      '<div class="ne-foot"><div class="row-wrap" style="gap:var(--s4)"><label class="check-label"><input type="checkbox" data-change="flag" data-f="pinned" ' + (n.pinned ? 'checked' : '') + '>Pinned</label>' +
      '<label class="check-label"><input type="checkbox" data-change="flag" data-f="used" ' + (n.used ? 'checked' : '') + '>Incorporated into manuscript</label></div>' +
      '<div class="row">' + (n.sectionId ? '<a class="btn btn-ghost btn-sm" href="#/b/' + book.id + '/w/' + n.sectionId + '">' + ic('pen') + 'Open section</a>' : '') +
      '<button class="icon-btn" data-act="remove" aria-label="Delete note" title="Delete note">' + ic('trash') + '</button></div></div>' +
      '<p class="muted num" style="font-size:var(--fs-xs);margin-top:var(--s3)">Created ' + u.fmtDateTime(n.createdAt) + ' · updated ' + u.ago(n.updatedAt) + '</p>' +
      '</div>';
  }

  function render(ctx) {
    const book = ctx.book;
    if (ctx.query.n) F.sel = ctx.query.n;
    if (ctx.query.ch) F.chapter = ctx.query.ch;
    if (F.sel && !book.notes.some((n) => n.id === F.sel)) F.sel = null;
    const list = filtered(book);
    if (!F.sel && list[0] && innerWidth > 960) F.sel = list[0].id;
    const counts = {};
    book.notes.forEach((n) => { counts[n.type] = (counts[n.type] || 0) + 1; });
    const sel = book.notes.find((n) => n.id === F.sel);

    let html = '<div class="page"><header class="page-head"><div><h1>Notes & Research</h1><p class="lede">Thoughts, sources, quotes and reflections — kept beside the manuscript, linked to the chapters they belong to.</p></div>' +
      '<button class="btn btn-primary" data-act="newNote">' + ic('plus') + 'New note</button></header>';
    html += '<form class="capture" id="capture"><textarea name="body" placeholder="Capture a thought before it slips away…" aria-label="Quick note"></textarea>' +
      '<select name="type" aria-label="Kind" style="width:auto">' + TYPES.map((t) => '<option value="' + t.id + '">' + t.label + '</option>').join('') + '</select>' +
      '<button class="btn" type="submit">Save</button></form>';
    html += '<div class="notes-layout"><div>';
    html += '<div class="filters"><input type="search" placeholder="Search notes" value="' + u.esc(F.q) + '" data-input="search" aria-label="Search notes">' +
      '<div class="chips"><button class="chip' + (!F.type ? ' on' : '') + '" data-act="type" data-t="">All <span class="n">' + book.notes.length + '</span></button>' +
      TYPES.filter((t) => counts[t.id]).map((t) => '<button class="chip' + (F.type === t.id ? ' on' : '') + '" data-act="type" data-t="' + t.id + '">' + t.label + ' <span class="n">' + counts[t.id] + '</span></button>').join('') + '</div>' +
      '<div class="row"><select data-change="chapterFilter" aria-label="Filter by chapter"><option value="">All chapters</option><option value="__none"' + (F.chapter === '__none' ? ' selected' : '') + '>Not linked to a chapter</option>' +
      book.chapters.map((c) => '<option value="' + c.id + '"' + (F.chapter === c.id ? ' selected' : '') + '>' + u.esc(c.title) + '</option>').join('') + '</select>' +
      '<label class="check-label" style="white-space:nowrap"><input type="checkbox" data-change="showUsed" ' + (F.showUsed ? 'checked' : '') + '>Incorporated</label></div></div>';
    html += '<div class="note-list" id="note-list">' + (list.length ? list.map((n) => rowHtml(book, n)).join('') : '<p class="empty">' + (book.notes.length ? 'No notes match these filters.' : 'Your library is empty. Capture your first thought above.') + '</p>') + '</div>';
    html += '</div><div id="note-editor">' + editorHtml(book, sel) + '</div></div></div>';
    return html;
  }

  const saveSoon = u.debounce((book, n, patch) => st.updateNote(book, n, patch, true), 350);

  function mount(root, ctx) {
    const f = root.querySelector('#capture');
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const body = f.body.value.trim();
      if (!body) { f.body.focus(); return; }
      const n = st.addNote(ctx.book, { body, type: f.type.value, chapterId: F.chapter && F.chapter !== '__none' ? F.chapter : '' });
      F.sel = n.id;
      BS.ui.toast('Note saved', { kind: 'success' });
      setTimeout(() => BS.ui.flash(document.querySelector('[data-id="' + n.id + '"]')), 20);
    });
    f.body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) f.requestSubmit(); });
    if (ctx.query.n) { const el = root.querySelector('.note-editor .ne-body'); if (el) el.focus(); }
  }

  function current(ctx) { return ctx.book.notes.find((n) => n.id === F.sel); }

  return {
    TYPES, typeLabel,
    title: () => 'Notes & Research',
    render, mount,
    unmount: () => saveSoon.flush(),
    act: {
      select(el, e, ctx) {
        saveSoon.flush();
        F.sel = el.dataset.id;
        document.querySelectorAll('.note-row').forEach((r) => r.classList.toggle('on', r.dataset.id === F.sel));
        document.getElementById('note-editor').innerHTML = editorHtml(ctx.book, current(ctx));
        if (innerWidth <= 960) document.getElementById('note-editor').scrollIntoView({ behavior: 'smooth' });
      },
      newNote(el, e, ctx) {
        const n = st.addNote(ctx.book, { type: F.type || 'idea', chapterId: F.chapter && F.chapter !== '__none' ? F.chapter : '' });
        F.sel = n.id;
        setTimeout(() => { const t = document.querySelector('.ne-title'); if (t) t.focus(); }, 30);
      },
      type(el) { F.type = el.dataset.t; BS.app.render(false); },
      chapterFilter(el) { F.chapter = el.value; if (location.hash.includes('?')) history.replaceState(null, '', location.hash.split('?')[0]); BS.app.render(false); },
      showUsed(el) { F.showUsed = el.checked; BS.app.render(false); },
      search: u.debounce((el) => {
        F.q = el.value;
        const ctx = BS.app.current().ctx;
        const list = filtered(ctx.book);
        document.getElementById('note-list').innerHTML = list.length ? list.map((n) => rowHtml(ctx.book, n)).join('') : '<p class="empty">No notes match.</p>';
      }, 150),
      field(el, e, ctx) {
        const n = current(ctx);
        if (!n) return;
        const f = el.dataset.f;
        const patch = { [f]: el.value };
        if (f === 'chapterId') patch.sectionId = '';
        Object.assign(n, patch);
        st.S.status = 'saving';
        BS.app.updateSaveState();
        if (e.type === 'change') { saveSoon.cancel(); st.updateNote(ctx.book, n, patch); return; }
        saveSoon(ctx.book, n, patch);
        const row = document.querySelector('.note-row[data-id="' + n.id + '"]');
        if (row) { const tmp = document.createElement('div'); tmp.innerHTML = rowHtml(ctx.book, n); row.replaceWith(tmp.firstChild); }
      },
      flag(el, e, ctx) {
        const n = current(ctx);
        st.updateNote(ctx.book, n, { [el.dataset.f]: el.checked });
        if (el.dataset.f === 'used' && el.checked) BS.ui.toast('Marked as incorporated', { kind: 'success' });
      },
      remove(el, e, ctx) {
        const n = current(ctx);
        st.trashNote(ctx.book, n.id);
        F.sel = null;
        BS.ui.toast('Note moved to trash', { action: 'Undo', onAction: () => { const t = ctx.book.trash.find((x) => x.item.id === n.id); if (t) { st.restoreTrash(ctx.book, t.id); F.sel = n.id; } } });
      }
    }
  };
})();
