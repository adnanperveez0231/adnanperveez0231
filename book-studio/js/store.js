/* Application state, mutations and persistence.
   Nothing is ever hard-deleted from a book without first passing through the trash
   or a safety backup, so reorganising can't lose writing. */
BS.store = (function () {
  const u = BS.u;
  const S = {
    books: [],
    settings: { theme: 'system', fontSize: 19, measure: 'normal', lastBookId: null, exportPreset: 'book', pageSize: 'A4' },
    status: 'saved',
    lastSaved: null,
    persisted: null
  };
  const listeners = new Set();
  const dirty = new Set();

  const on = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  const emit = (type, data) => listeners.forEach((fn) => { try { fn(type, data); } catch (e) { console.error(e); } });
  const setStatus = (s) => { S.status = s; emit('status'); };

  /* ---------- factories ---------- */
  function newSection(title, level) {
    const now = Date.now();
    return { id: u.uid(), title: title || 'Untitled section', level: level === 2 ? 2 : 1, html: '<p><br></p>', words: 0, chars: 0, comments: {}, bookmarks: {}, flags: {}, createdAt: now, updatedAt: now };
  }
  function newChapter(title) {
    const now = Date.now();
    return { id: u.uid(), title: title || 'Untitled chapter', description: '', objective: '', notes: '', status: 'draft', targetWords: 0, checklist: [], revisions: [], sections: [newSection('Untitled section', 1)], createdAt: now, updatedAt: now };
  }
  function newBook(d) {
    const now = Date.now();
    return {
      id: u.uid(), title: (d.title || '').trim() || 'Untitled book', subtitle: d.subtitle || '', description: d.description || '', theme: d.theme || '', author: d.author || '',
      targetWords: +d.targetWords || 80000, goals: { daily: 500, weekly: 3000, monthly: 12000 },
      chapters: [], notes: [], trash: [], log: {}, last: null, createdAt: now, updatedAt: now
    };
  }

  function migrate(b) {
    const base = newBook({ title: b.title });
    const book = Object.assign(base, b);
    book.goals = Object.assign({ daily: 500, weekly: 3000, monthly: 12000 }, b.goals || {});
    ['chapters', 'notes', 'trash'].forEach((k) => { if (!Array.isArray(book[k])) book[k] = []; });
    book.log = book.log || {};
    book.chapters.forEach((c) => {
      Object.assign(c, Object.assign({ description: '', objective: '', notes: '', status: 'draft', targetWords: 0, checklist: [], revisions: [], sections: [] }, c));
      c.sections.forEach((s) => { s.comments = s.comments || {}; s.bookmarks = s.bookmarks || {}; s.flags = s.flags || {}; s.level = s.level === 2 ? 2 : 1; });
    });
    return book;
  }

  /* ---------- persistence ---------- */
  const scheduleSave = u.debounce(flush, 600);

  function touch(book, opts) {
    if (!book) return;
    book.updatedAt = Date.now();
    dirty.add(book.id);
    setStatus('saving');
    if (opts && opts.now) { scheduleSave.cancel(); return flush(); }
    scheduleSave();
    if (!opts || !opts.silent) emit('change', book);
  }

  async function flush() {
    scheduleSave.cancel();
    const ids = [...dirty];
    dirty.clear();
    if (!ids.length) { setStatus('saved'); return; }
    try {
      for (const id of ids) {
        const b = find(id);
        if (b) await BS.db.put('books', b);
      }
      S.lastSaved = Date.now();
      try { localStorage.removeItem('bs-pending'); } catch (e) { /* ignore */ }
      setStatus('saved');
      emit('saved');
      maybeAutoBackup();
    } catch (e) {
      console.error(e);
      ids.forEach((id) => dirty.add(id));
      setStatus('error');
      emit('save-error', e);
    }
  }

  async function load() {
    await BS.db.ready();
    S.books = (await BS.db.all('books')).map(migrate);
    S.books.sort((a, b) => b.updatedAt - a.updatedAt);
    const st = await BS.db.get('meta', 'settings');
    if (st) Object.assign(S.settings, st);
    recoverPending();
    try {
      if (navigator.storage && navigator.storage.persist) S.persisted = await navigator.storage.persist();
    } catch (e) { S.persisted = null; }
    maybeAutoBackup();
  }

  // The editor mirrors unsaved text into localStorage synchronously; recover it if the tab closed mid-save.
  function recoverPending() {
    let p = null;
    try { p = JSON.parse(localStorage.getItem('bs-pending') || 'null'); } catch (e) { p = null; }
    if (!p) return;
    const book = find(p.bookId);
    const loc = book && locate(book, p.sectionId);
    if (loc && p.at > (loc.section.updatedAt || 0) && p.html !== loc.section.html) {
      setSectionContent(book, loc.section, p.html, p.words, p.chars);
      S.recovered = { title: loc.section.title };
    }
    try { localStorage.removeItem('bs-pending'); } catch (e) { /* ignore */ }
  }

  function saveSettings(patch) {
    Object.assign(S.settings, patch);
    return BS.db.put('meta', S.settings, 'settings');
  }

  /* ---------- lookups ---------- */
  const find = (id) => S.books.find((b) => b.id === id) || null;
  function locate(book, sectionId) {
    for (let ci = 0; ci < book.chapters.length; ci++) {
      const c = book.chapters[ci];
      const si = c.sections.findIndex((s) => s.id === sectionId);
      if (si >= 0) return { chapter: c, section: c.sections[si], ci, si };
    }
    return null;
  }
  const chapter = (book, id) => book.chapters.find((c) => c.id === id) || null;
  const chapterWords = (c) => c.sections.reduce((n, s) => n + (s.words || 0), 0);
  const bookWords = (b) => b.chapters.reduce((n, c) => n + chapterWords(c), 0);
  const allSections = (b) => b.chapters.flatMap((c) => c.sections.map((s) => ({ chapter: c, section: s })));

  /* ---------- books ---------- */
  function createBook(d) {
    const b = newBook(d);
    const c = newChapter('Chapter 1');
    b.chapters.push(c);
    S.books.unshift(b);
    touch(b, { now: true });
    emit('change', b);
    return b;
  }
  function updateBook(book, patch) { Object.assign(book, patch); touch(book); }
  async function deleteBook(id) {
    const b = find(id);
    if (!b) return;
    await safetyBackup('Before deleting “' + b.title + '”');
    S.books = S.books.filter((x) => x.id !== id);
    await BS.db.del('books', id);
    await BS.db.delByIndex('versions', 'book', id);
    await BS.db.delByIndex('snapshots', 'book', id);
    emit('change');
  }

  /* ---------- chapters ---------- */
  function addChapter(book, title, index) {
    const c = newChapter(title || 'Chapter ' + (book.chapters.length + 1));
    if (index == null || index > book.chapters.length) book.chapters.push(c); else book.chapters.splice(index, 0, c);
    touch(book);
    return c;
  }
  function updateChapter(book, c, patch, silent) { Object.assign(c, patch, { updatedAt: Date.now() }); touch(book, { silent }); }
  function moveChapter(book, from, to) {
    if (to < 0 || to >= book.chapters.length || from === to) return;
    const [c] = book.chapters.splice(from, 1);
    book.chapters.splice(to, 0, c);
    touch(book);
  }
  function trashChapter(book, id) {
    const i = book.chapters.findIndex((c) => c.id === id);
    if (i < 0) return;
    const [c] = book.chapters.splice(i, 1);
    book.trash.unshift({ id: u.uid(), kind: 'chapter', item: c, index: i, deletedAt: Date.now() });
    if (book.last && c.sections.some((s) => s.id === book.last.sectionId)) book.last = null;
    touch(book);
  }

  /* ---------- sections ---------- */
  function addSection(book, chapterId, opts) {
    opts = opts || {};
    const c = chapter(book, chapterId);
    if (!c) return null;
    const s = newSection(opts.title, opts.level);
    let idx = c.sections.length;
    if (opts.after) {
      const i = c.sections.findIndex((x) => x.id === opts.after);
      if (i >= 0) idx = i + 1;
    }
    c.sections.splice(idx, 0, s);
    c.updatedAt = Date.now();
    touch(book);
    return s;
  }
  function updateSection(book, s, patch, silent) { Object.assign(s, patch, { updatedAt: Date.now() }); touch(book, { silent }); }
  function setSectionContent(book, s, html, words, chars) {
    const today = u.dayKey();
    const delta = (words || 0) - (s.words || 0);
    if (delta) book.log[today] = (book.log[today] || 0) + delta;
    s.html = html;
    s.words = words || 0;
    s.chars = chars || 0;
    s.updatedAt = Date.now();
    const loc = locate(book, s.id);
    if (loc) loc.chapter.updatedAt = s.updatedAt;
    book.last = Object.assign({}, book.last && book.last.sectionId === s.id ? book.last : {}, { sectionId: s.id, at: s.updatedAt });
    touch(book, { silent: true });
  }
  function moveSection(book, sectionId, toChapterId, toIndex) {
    const loc = locate(book, sectionId);
    const dest = chapter(book, toChapterId);
    if (!loc || !dest) return;
    loc.chapter.sections.splice(loc.si, 1);
    if (toIndex == null || toIndex > dest.sections.length) toIndex = dest.sections.length;
    dest.sections.splice(toIndex, 0, loc.section);
    loc.chapter.updatedAt = dest.updatedAt = Date.now();
    touch(book);
  }
  function trashSection(book, sectionId) {
    const loc = locate(book, sectionId);
    if (!loc) return;
    loc.chapter.sections.splice(loc.si, 1);
    book.trash.unshift({ id: u.uid(), kind: 'section', item: loc.section, chapterId: loc.chapter.id, index: loc.si, deletedAt: Date.now() });
    if (book.last && book.last.sectionId === sectionId) book.last = null;
    touch(book);
  }

  /* ---------- notes & research ---------- */
  function addNote(book, d) {
    const now = Date.now();
    const n = Object.assign({ id: u.uid(), type: 'idea', title: '', body: '', url: '', source: '', chapterId: '', sectionId: '', pinned: false, used: false, createdAt: now, updatedAt: now }, d);
    book.notes.unshift(n);
    touch(book);
    return n;
  }
  function updateNote(book, n, patch, silent) { Object.assign(n, patch, { updatedAt: Date.now() }); touch(book, { silent }); }
  function trashNote(book, id) {
    const i = book.notes.findIndex((n) => n.id === id);
    if (i < 0) return;
    const [n] = book.notes.splice(i, 1);
    book.trash.unshift({ id: u.uid(), kind: 'note', item: n, index: i, deletedAt: Date.now() });
    touch(book);
  }

  /* ---------- trash ---------- */
  function restoreTrash(book, trashId) {
    const i = book.trash.findIndex((t) => t.id === trashId);
    if (i < 0) return null;
    const [t] = book.trash.splice(i, 1);
    if (t.kind === 'chapter') book.chapters.splice(Math.min(t.index, book.chapters.length), 0, t.item);
    else if (t.kind === 'note') book.notes.splice(Math.min(t.index, book.notes.length), 0, t.item);
    else {
      let c = chapter(book, t.chapterId);
      if (!c) {
        c = newChapter('Restored sections');
        c.sections = [];
        book.chapters.push(c);
      }
      c.sections.splice(Math.min(t.index, c.sections.length), 0, t.item);
    }
    touch(book);
    return t;
  }
  function purgeTrash(book, trashId) {
    book.trash = trashId ? book.trash.filter((t) => t.id !== trashId) : [];
    touch(book);
  }

  /* ---------- section versions (drafts) ---------- */
  async function saveVersion(book, s, label, auto) {
    const loc = locate(book, s.id);
    const v = { id: u.uid(), bookId: book.id, sectionId: s.id, chapterId: loc ? loc.chapter.id : '', at: Date.now(), label: label || '', auto: !!auto, html: s.html, words: s.words || 0, title: s.title };
    await BS.db.put('versions', v);
    if (auto) {
      const list = await versions(s.id);
      const autos = list.filter((x) => x.auto);
      for (const old of autos.slice(40)) await BS.db.del('versions', old.id);
    }
    emit('versions', s.id);
    return v;
  }
  async function versions(sectionId) {
    const list = await BS.db.byIndex('versions', 'section', sectionId);
    return list.sort((a, b) => b.at - a.at);
  }
  const deleteVersion = (id) => BS.db.del('versions', id);

  /* ---------- manuscript snapshots ---------- */
  function snapshotData(book) {
    return book.chapters.map((c) => ({ id: c.id, title: c.title, sections: c.sections.map((s) => ({ id: s.id, title: s.title, level: s.level, html: s.html, words: s.words, chars: s.chars })) }));
  }
  async function saveSnapshot(book, label, kind) {
    const snap = { id: u.uid(), bookId: book.id, at: Date.now(), label: label || '', kind: kind || 'manual', words: bookWords(book), chapters: snapshotData(book) };
    await BS.db.put('snapshots', snap);
    return snap;
  }
  async function snapshots(bookId) {
    const list = await BS.db.byIndex('snapshots', 'book', bookId);
    return list.sort((a, b) => b.at - a.at);
  }
  const deleteSnapshot = (id) => BS.db.del('snapshots', id);
  async function restoreSnapshot(book, snap) {
    await saveSnapshot(book, 'Before restoring “' + (snap.label || u.fmtDateTime(snap.at)) + '”', 'safety');
    const byId = new Map(book.chapters.map((c) => [c.id, c]));
    const secById = new Map(allSections(book).map((x) => [x.section.id, x.section]));
    const keep = new Set();
    const chapters = snap.chapters.map((sc) => {
      const cur = byId.get(sc.id);
      const c = cur ? Object.assign({}, cur) : newChapter(sc.title);
      c.title = sc.title;
      c.sections = sc.sections.map((ss) => {
        keep.add(ss.id);
        const s = secById.get(ss.id) ? Object.assign({}, secById.get(ss.id)) : newSection(ss.title, ss.level);
        return Object.assign(s, { id: ss.id, title: ss.title, level: ss.level, html: ss.html, words: ss.words, chars: ss.chars, updatedAt: Date.now() });
      });
      return c;
    });
    // anything that exists now but not in the snapshot goes to the trash, not away
    for (const [id, s] of secById) {
      if (!keep.has(id)) {
        const loc = locate(book, id);
        book.trash.unshift({ id: u.uid(), kind: 'section', item: s, chapterId: loc ? loc.chapter.id : '', index: 0, deletedAt: Date.now() });
      }
    }
    book.chapters = chapters;
    touch(book);
  }

  /* ---------- backups ---------- */
  async function maybeAutoBackup() {
    if (!S.books.length) return;
    const id = 'auto-' + u.dayKey();
    try {
      const existing = await BS.db.get('backups', id);
      if (existing && Date.now() - existing.at < 6 * 3600e3) return;
      await BS.db.put('backups', { id, at: Date.now(), kind: 'auto', label: 'Daily backup', books: u.clone(S.books) });
      await prune('auto', 14);
    } catch (e) { console.warn('auto backup failed', e); }
  }
  async function safetyBackup(label) {
    await BS.db.put('backups', { id: 'safety-' + Date.now(), at: Date.now(), kind: 'safety', label, books: u.clone(S.books) });
    await prune('safety', 10);
  }
  async function manualBackup(label) {
    await BS.db.put('backups', { id: 'manual-' + Date.now(), at: Date.now(), kind: 'manual', label: label || 'Saved backup', books: u.clone(S.books) });
    await prune('manual', 30);
  }
  async function prune(kind, keep) {
    const list = (await BS.db.all('backups')).filter((b) => b.kind === kind).sort((a, b) => b.at - a.at);
    for (const old of list.slice(keep)) await BS.db.del('backups', old.id);
  }
  async function backups() {
    return (await BS.db.all('backups')).sort((a, b) => b.at - a.at);
  }
  async function restoreBackup(backup) {
    await flush();
    await safetyBackup('Before restoring backup from ' + u.fmtDateTime(backup.at));
    const restored = backup.books.map(migrate);
    for (const b of restored) {
      const i = S.books.findIndex((x) => x.id === b.id);
      if (i >= 0) S.books[i] = b; else S.books.push(b);
      await BS.db.put('books', b);
    }
    emit('change');
    return restored.length;
  }

  async function exportAll() {
    await flush();
    return {
      app: 'book-studio', format: 1, exportedAt: new Date().toISOString(),
      books: S.books, versions: await BS.db.all('versions'), snapshots: await BS.db.all('snapshots')
    };
  }
  function validateImport(data) {
    if (!data || data.app !== 'book-studio' || !Array.isArray(data.books)) throw new Error('This file is not a Book Studio backup.');
    return { books: data.books.length, versions: (data.versions || []).length, snapshots: (data.snapshots || []).length };
  }
  async function importAll(data) {
    validateImport(data);
    await flush();
    await safetyBackup('Before importing a backup file');
    for (const raw of data.books) {
      const b = migrate(raw);
      const i = S.books.findIndex((x) => x.id === b.id);
      if (i >= 0) S.books[i] = b; else S.books.push(b);
      await BS.db.put('books', b);
    }
    if (Array.isArray(data.versions)) await BS.db.putMany('versions', data.versions);
    if (Array.isArray(data.snapshots)) await BS.db.putMany('snapshots', data.snapshots);
    emit('change');
  }

  /* ---------- statistics ---------- */
  function wordsBetween(book, from, to) { // inclusive Date range
    let n = 0;
    for (let d = new Date(from); d <= to; d = u.addDays(d, 1)) n += book.log[u.dayKey(d)] || 0;
    return Math.max(0, n);
  }
  function today(book) { return Math.max(0, book.log[u.dayKey()] || 0); }
  function thisWeek(book) { const now = new Date(); return wordsBetween(book, u.startOfWeek(now), now); }
  function thisMonth(book) { const now = new Date(); return wordsBetween(book, new Date(now.getFullYear(), now.getMonth(), 1), now); }
  function streaks(book) {
    const wrote = (d) => (book.log[u.dayKey(d)] || 0) > 0;
    let d = new Date();
    if (!wrote(d)) d = u.addDays(d, -1);
    let current = 0;
    while (wrote(d)) { current++; d = u.addDays(d, -1); }
    const keys = Object.keys(book.log).filter((k) => book.log[k] > 0).sort();
    let longest = 0, run = 0, prev = null;
    for (const k of keys) {
      const day = u.parseDay(k);
      run = prev && Math.round((day - prev) / 864e5) === 1 ? run + 1 : 1;
      longest = Math.max(longest, run);
      prev = day;
    }
    return { current, longest, daysWritten: keys.length, wroteToday: wrote(new Date()) };
  }

  return {
    S, on, emit, load, flush, touch, saveSettings,
    find, locate, chapter, chapterWords, bookWords, allSections,
    createBook, updateBook, deleteBook,
    addChapter, updateChapter, moveChapter, trashChapter,
    addSection, updateSection, setSectionContent, moveSection, trashSection,
    addNote, updateNote, trashNote,
    restoreTrash, purgeTrash,
    saveVersion, versions, deleteVersion,
    saveSnapshot, snapshots, deleteSnapshot, restoreSnapshot, snapshotData,
    backups, manualBackup, restoreBackup, safetyBackup, exportAll, validateImport, importAll,
    wordsBetween, today, thisWeek, thisMonth, streaks
  };
})();
