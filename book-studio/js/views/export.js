/* Export & backup. */
BS.views.export = (function () {
  const u = BS.u, st = BS.store, ic = BS.ic;
  const O = () => ({
    preset: st.S.settings.exportPreset || 'book',
    page: st.S.settings.pageSize || 'A4',
    sectionTitles: st.S.settings.exportSectionTitles !== false,
    highlights: !!st.S.settings.exportHighlights,
    titlePage: st.S.settings.exportTitlePage !== false
  });

  async function run(book, chapterIds, fmt, btn) {
    const opts = Object.assign(O(), { chapterIds });
    await st.flush();
    if (BS.app.current().view.forceSave) BS.app.current().view.forceSave();
    return BS.ui.busy(btn, async () => {
      await new Promise((r) => setTimeout(r, 30));
      if (fmt === 'docx') { BS.exporter.docx(book, opts); BS.ui.toast('DOCX downloaded', { kind: 'success' }); }
      else if (fmt === 'html') { BS.exporter.html(book, opts); BS.ui.toast('HTML downloaded', { kind: 'success' }); }
      else { await BS.exporter.pdf(book, opts); BS.ui.toast('In the print dialog, choose “Save as PDF”.', { duration: 5000 }); }
    }, fmt === 'pdf' ? 'Preparing…' : 'Building…');
  }

  function render(ctx) {
    const book = ctx.book;
    const o = O();
    const words = st.bookWords(book);
    const sel = (name, val, opts) => '<select data-change="opt" data-k="' + name + '">' + opts.map((x) => '<option value="' + x[0] + '"' + (x[0] === val ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select>';
    const chk = (name, on, label) => '<label class="check-label"><input type="checkbox" data-change="optc" data-k="' + name + '" ' + (on ? 'checked' : '') + '>' + label + '</label>';

    let html = '<div class="page"><header class="page-head"><div><h1>Export & Backup</h1><p class="lede">Take your manuscript anywhere, and keep copies of your work safe.</p></div></header>';
    html += '<div class="split"><div>';
    html += '<section class="card" aria-labelledby="h-full"><h2 id="h-full" style="font-size:var(--fs-xl);margin-bottom:var(--s2)">Export the manuscript</h2>' +
      '<p class="muted num" style="margin-bottom:var(--s5)">' + u.esc(book.title) + ' · ' + book.chapters.length + ' chapters · ' + u.fmt(words) + ' words</p>' +
      '<div class="row-wrap"><button class="btn btn-primary" data-act="full" data-f="docx">' + ic('download') + 'Export DOCX</button>' +
      '<button class="btn" data-act="full" data-f="pdf">' + ic('download') + 'Export PDF</button>' +
      '<button class="btn btn-ghost" data-act="full" data-f="html">' + ic('download') + 'HTML</button></div>' +
      '<div class="opt-grid" style="margin-top:var(--s6)"><label class="field"><span class="field-label">Layout</span>' + sel('exportPreset', o.preset, [['book', 'Book — serif, justified, indented'], ['manuscript', 'Submission — 12 pt, double-spaced']]) + '</label>' +
      '<label class="field"><span class="field-label">Page size</span>' + sel('pageSize', o.page, [['A4', 'A4'], ['Letter', 'US Letter']]) + '</label></div>' +
      '<div class="opt-list">' + chk('exportTitlePage', o.titlePage, 'Include a title page') + chk('exportSectionTitles', o.sectionTitles, 'Include section titles (otherwise a scene break is used)') + chk('exportHighlights', o.highlights, 'Keep my highlights') + '</div>' +
      '<p class="muted" style="font-size:var(--fs-sm);margin-top:var(--s4)">Bold, italics, headings, quotations and lists are preserved. Comments, bookmarks, flags and notes stay private and are never exported.</p></section>';

    html += '<section class="card" style="margin-top:var(--s4)" aria-labelledby="h-chx"><h2 id="h-chx" style="font-size:var(--fs-lg);margin-bottom:var(--s3)">Export a single chapter</h2>' +
      (book.chapters.length ? '<div class="list">' + book.chapters.map((c, i) => '<div class="list-item"><span class="num muted" style="min-width:20px">' + (i + 1) + '</span><div class="li-main"><span class="li-title">' + u.esc(c.title) + '</span></div><span class="li-meta">' + u.fmt(st.chapterWords(c)) + '</span>' +
        '<button class="btn btn-ghost btn-sm" data-act="one" data-f="docx" data-id="' + c.id + '">DOCX</button><button class="btn btn-ghost btn-sm" data-act="one" data-f="pdf" data-id="' + c.id + '">PDF</button></div>').join('') + '</div>' : '<p class="empty">No chapters yet.</p>') +
      '</section></div>';

    html += '<div><section class="card" aria-labelledby="h-bk"><h2 id="h-bk" style="font-size:var(--fs-lg);margin-bottom:var(--s2)">Backups</h2>' +
      '<p class="muted" style="font-size:var(--fs-sm);margin-bottom:var(--s4)">Your writing is saved in this browser as you type. A backup is taken automatically each day (the last 14 are kept) and before any restore or deletion. Download a backup file regularly and keep it somewhere safe.</p>' +
      '<div class="row-wrap"><button class="btn btn-primary" data-act="download">' + ic('download') + 'Download backup file</button><button class="btn" data-act="import">' + ic('upload') + 'Restore from file</button></div>' +
      '<div class="row-wrap" style="margin-top:var(--s2)"><button class="btn btn-ghost btn-sm" data-act="saveBackup">' + ic('save') + 'Save a backup now</button></div>' +
      '<p class="muted" style="font-size:var(--fs-xs);margin-top:var(--s4)">' + (BS.db.isMemory() ? 'Warning: browser storage is unavailable; nothing persists after this tab closes.' : st.S.persisted ? 'This browser has granted persistent storage, so it will not clear your library to free space.' : 'Storage is not marked persistent; the browser may clear it under storage pressure. Keep a backup file.') + '</p>' +
      '<h3 style="font-size:var(--fs-sm);margin:var(--s5) 0 var(--s2);color:var(--text-2)">Stored in this browser</h3><div class="list" id="bk-list"><p class="empty"><span class="spinner" aria-hidden="true"></span></p></div></section></div></div>';
    return html + '</div>';
  }

  async function loadBackups(ctx) {
    const list = await st.backups();
    const el = document.getElementById('bk-list');
    if (!el) return;
    ctx.backups = list;
    el.innerHTML = list.length ? list.map((b) => {
      const words = b.books.reduce((n, x) => n + st.bookWords(x), 0);
      return '<div class="list-item"><div class="li-main"><span class="li-title">' + u.esc(b.label) + '</span><div class="li-sub num">' + u.fmtDateTime(b.at) + ' · ' + b.books.length + (b.books.length === 1 ? ' book' : ' books') + ' · ' + u.fmt(words) + ' words</div></div>' +
        '<button class="icon-btn" data-act="bkMenu" data-id="' + b.id + '" aria-label="Backup actions">' + ic('more') + '</button></div>';
    }).join('') : '<p class="empty">No backups yet.</p>';
  }

  return {
    title: () => 'Export & Backup',
    render,
    mount: (root, ctx) => loadBackups(ctx),
    quick: run,
    act: {
      full(el, e, ctx) { run(ctx.book, null, el.dataset.f, el); },
      one(el, e, ctx) { run(ctx.book, [el.dataset.id], el.dataset.f, el); },
      opt(el) { st.saveSettings({ [el.dataset.k]: el.value }); },
      optc(el) { st.saveSettings({ [el.dataset.k]: el.checked }); },
      download(el) { BS.ui.busy(el, () => BS.exporter.backupFile().then(() => BS.ui.toast('Backup downloaded', { kind: 'success' })), 'Preparing…'); },
      async saveBackup(el, e, ctx) {
        await BS.ui.busy(el, async () => { await st.flush(); await st.manualBackup(); }, 'Saving…');
        BS.ui.toast('Backup saved', { kind: 'success' });
        loadBackups(ctx);
      },
      async import() {
        const f = await BS.ui.pickFile('.json,application/json');
        if (!f) return;
        try {
          const data = JSON.parse(await f.text());
          const c = st.validateImport(data);
          const ok = await BS.ui.confirm('Restore from file', 'The file contains ' + c.books + ' book(s), ' + c.versions + ' section versions and ' + c.snapshots + ' manuscript versions. Books already here with the same identity will be replaced by the file’s copy. A safety backup is taken first.', { confirmLabel: 'Restore' });
          if (!ok) return;
          await st.importAll(data);
          BS.ui.toast('Backup restored', { kind: 'success' });
        } catch (err) { BS.ui.toast(err.message || 'Could not read that file.'); }
      },
      bkMenu(el, e, ctx) {
        const b = ctx.backups.find((x) => x.id === el.dataset.id);
        BS.app.menu(el, [
          { label: 'Download this backup', icon: 'download', onClick: () => u.download('book-studio-' + b.id + '.json', JSON.stringify({ app: 'book-studio', format: 1, exportedAt: new Date(b.at).toISOString(), books: b.books }), 'application/json') },
          { label: 'Restore this backup…', icon: 'restore', onClick: async () => {
            const ok = await BS.ui.confirm('Restore backup?', 'Books in this backup will replace their current versions. A safety backup of the current state is taken first.', { confirmLabel: 'Restore' });
            if (!ok) return;
            const n = await st.restoreBackup(b);
            BS.ui.toast(n + (n === 1 ? ' book' : ' books') + ' restored', { kind: 'success' });
          } }
        ]);
      }
    }
  };
})();
