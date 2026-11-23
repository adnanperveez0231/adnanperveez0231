/* Review & revision: status board, open items, manuscript versions, and the reading view. */
BS.views.review = (function () {
  const u = BS.u, st = BS.store, ic = BS.ic;

  function render(ctx) {
    const book = ctx.book;
    const b = '#/b/' + book.id;
    let html = '<div class="page"><header class="page-head"><div><h1>Review & Revision</h1><p class="lede">Move chapters from draft to final, work through what needs improving, and compare manuscript versions.</p></div>' +
      '<a class="btn btn-primary" href="' + b + '/read">' + ic('read') + 'Read the manuscript</a></header>';

    // board
    const cols = [['draft', 'Draft'], ['review', 'In Review'], ['final', 'Finalized']];
    html += '<section aria-label="Chapter status board"><div class="board">' + cols.map(([k, label]) => {
      const list = book.chapters.filter((c) => c.status === k);
      return '<div class="board-col"><h3><span class="dot ' + k + '"></span>' + label + '<span class="n">' + list.length + '</span></h3>' +
        (list.length ? list.map((c) => {
          const open = c.checklist.filter((x) => !x.done).length + c.revisions.filter((x) => !x.done).length;
          const flags = c.sections.reduce((n, s) => n + Object.keys(s.flags).length, 0);
          return '<div class="board-card" data-chapter-id="' + c.id + '"><a href="' + b + '/ch/' + c.id + '">' + u.esc(c.title) + '</a>' +
            '<div class="bc-meta"><span>' + u.fmt(st.chapterWords(c)) + ' words' + (open ? ' · ' + open + ' open' : '') + (flags ? ' · ' + flags + ' flagged' : '') + '</span>' +
            '<select data-change="status" data-id="' + c.id + '" aria-label="Status of ' + u.esc(c.title) + '">' + cols.map(([v, l]) => '<option value="' + v + '"' + (v === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div></div>';
        }).join('') : '<p class="empty" style="padding:var(--s3) 0">None</p>') + '</div>';
    }).join('') + '</div></section>';

    // open items
    const items = [];
    book.chapters.forEach((c) => {
      c.revisions.filter((r) => !r.done).forEach((r) => items.push({ c, kind: 'rev', id: r.id, text: r.text, at: r.at }));
      c.checklist.filter((r) => !r.done).forEach((r) => items.push({ c, kind: 'check', id: r.id, text: r.text }));
      c.sections.forEach((s) => Object.keys(s.flags).forEach((pid) => items.push({ c, s, kind: 'flag', pid, text: s.flags[pid].note || s.flags[pid].excerpt, at: s.flags[pid].at })));
    });
    html += '<div class="split block"><section aria-labelledby="h-open"><div class="block-head"><h2 id="h-open">Open Revisions</h2><p>' + items.length + ' ' + (items.length === 1 ? 'item' : 'items') + '</p></div><div class="card card-tight"><div class="list">' +
      (items.length ? items.map((it) => '<div class="list-item">' +
        (it.kind === 'flag' ? '<span title="Flagged passage" style="color:var(--rev-line)">' + ic('flag') + '</span>' : '<input type="checkbox" data-change="resolve" data-kind="' + it.kind + '" data-ch="' + it.c.id + '" data-id="' + it.id + '" aria-label="Mark done">') +
        '<div class="li-main"><span class="li-title" style="white-space:normal">' + u.esc(u.excerpt(it.text, 160)) + '</span><div class="li-sub">' + u.esc(it.c.title) + (it.s ? ' › ' + u.esc(it.s.title) : '') + ' · ' + ({ rev: 'Comment', check: 'Checklist', flag: 'Flagged passage' })[it.kind] + '</div></div>' +
        (it.kind === 'flag' ? '<a class="btn btn-ghost btn-sm" href="' + b + '/w/' + it.s.id + '?p=' + it.pid + '">Open</a>' : '<a class="btn btn-ghost btn-sm" href="' + b + '/ch/' + it.c.id + '">Open</a>') +
        '</div>').join('') : '<p class="empty">Nothing waiting. Add checklist items and comments from a chapter’s page, or flag passages in the editor.</p>') + '</div></div></section>';

    // versions
    html += '<section aria-labelledby="h-ver"><div class="block-head"><h2 id="h-ver">Manuscript Versions</h2></div><div class="card"><div class="add-row" style="margin-top:0"><input id="snap-label" placeholder="Name, e.g. “First complete draft”" aria-label="Version name"><button class="btn btn-primary" data-act="snapshot">' + ic('save') + 'Save</button></div>' +
      '<p class="muted" style="font-size:var(--fs-sm);margin-top:var(--s2)">Saves a copy of the whole manuscript you can compare with or return to.</p>' +
      '<div class="list" id="snap-list" style="margin-top:var(--s3)"><p class="empty"><span class="spinner" aria-hidden="true"></span></p></div></div></section></div>';
    return html + '</div>';
  }

  async function loadSnaps(ctx) {
    const list = await st.snapshots(ctx.book.id);
    const el = document.getElementById('snap-list');
    if (!el) return;
    el.innerHTML = list.length ? list.map((s) => '<div class="list-item"><div class="li-main"><span class="li-title">' + u.esc(s.label || 'Manuscript version') + '</span><div class="li-sub num">' + u.fmtDateTime(s.at) + ' · ' + u.fmt(s.words) + ' words</div></div>' +
      '<button class="icon-btn" data-act="snapMenu" data-id="' + s.id + '" aria-label="Version actions">' + ic('more') + '</button></div>').join('')
      : '<p class="empty">No manuscript versions yet.</p>';
    ctx.snaps = list;
  }

  function compareSnapshot(ctx, snap) {
    const book = ctx.book;
    const cur = st.snapshotData(book);
    const secText = (ch) => ch.sections.map((s) => u.blockTexts(s.html)).flat();
    let html = '';
    let added = 0, removed = 0;
    const seen = new Set();
    cur.forEach((c) => {
      const old = snap.chapters.find((x) => x.id === c.id);
      seen.add(c.id);
      const res = BS.diff.paragraphs(old ? secText(old) : [], secText(c));
      const s = BS.diff.stats(res);
      added += s.added; removed += s.removed;
      if (!s.added && !s.removed && old && old.title === c.title) return;
      html += '<h3 class="diff-ch">' + u.esc(c.title) + (old ? (old.title !== c.title ? ' <span class="muted">(was “' + u.esc(old.title) + '”)</span>' : '') : ' <span class="muted">(new chapter)</span>') +
        ' <span class="muted num" style="font-weight:400">+' + u.fmt(s.added) + ' / −' + u.fmt(s.removed) + '</span></h3>' + BS.diff.render(res, { collapse: true });
    });
    snap.chapters.filter((c) => !seen.has(c.id)).forEach((c) => {
      const res = BS.diff.paragraphs(secText(c), []);
      removed += BS.diff.stats(res).removed;
      html += '<h3 class="diff-ch">' + u.esc(c.title) + ' <span class="muted">(no longer in the manuscript)</span></h3>' + BS.diff.render(res, { collapse: true });
    });
    BS.ui.modal({
      title: 'Compare with “' + (snap.label || u.fmtDateTime(snap.at)) + '”',
      full: true,
      body: '<div class="diff-stats"><span>' + u.fmtDateTime(snap.at) + ' → now</span><span class="a">+' + u.fmt(added) + ' words added</span><span class="r">−' + u.fmt(removed) + ' words removed</span></div><div class="diff">' + (html || '<p class="diff-skip">No differences.</p>') + '</div>'
    });
  }

  return {
    title: () => 'Review & Revision',
    render,
    mount: (root, ctx) => loadSnaps(ctx),
    act: {
      status(el, e, ctx) {
        const c = st.chapter(ctx.book, el.dataset.id);
        st.updateChapter(ctx.book, c, { status: el.value });
        if (el.value === 'final') BS.ui.toast('“' + c.title + '” finalized', { kind: 'success' });
        setTimeout(() => BS.ui.flash(document.querySelector('.board-card[data-chapter-id="' + c.id + '"]')), 20);
      },
      resolve(el, e, ctx) {
        const c = st.chapter(ctx.book, el.dataset.ch);
        const list = el.dataset.kind === 'rev' ? c.revisions : c.checklist;
        const it = list.find((x) => x.id === el.dataset.id);
        it.done = true; it.doneAt = Date.now();
        el.closest('.list-item').style.opacity = '.4';
        setTimeout(() => st.updateChapter(ctx.book, c, {}), 350);
      },
      async snapshot(el, e, ctx) {
        const label = document.getElementById('snap-label').value.trim();
        await BS.ui.busy(el, async () => { await st.flush(); await st.saveSnapshot(ctx.book, label); }, 'Saving…');
        document.getElementById('snap-label').value = '';
        BS.ui.toast('Manuscript version saved', { kind: 'success' });
        loadSnaps(ctx);
      },
      snapMenu(el, e, ctx) {
        const snap = ctx.snaps.find((s) => s.id === el.dataset.id);
        BS.app.menu(el, [
          { label: 'Compare with current', icon: 'compare', onClick: () => compareSnapshot(ctx, snap) },
          { label: 'Restore this version…', icon: 'restore', onClick: async () => {
            const ok = await BS.ui.confirm('Restore manuscript version?', 'The current manuscript is saved as a new version first. Sections that did not exist in this version move to the trash, so nothing is lost.', { confirmLabel: 'Restore' });
            if (!ok) return;
            await st.restoreSnapshot(ctx.book, snap);
            BS.ui.toast('Manuscript restored', { kind: 'success' });
          } },
          { sep: true },
          { label: 'Delete version', icon: 'trash', danger: true, onClick: async () => {
            if (!(await BS.ui.confirm('Delete version?', 'This saved manuscript version will be removed permanently.', { confirmLabel: 'Delete', danger: true }))) return;
            await st.deleteSnapshot(snap.id);
            loadSnaps(ctx);
          } }
        ]);
      }
    }
  };
})();

/* Whole-manuscript reading mode. */
BS.views.reader = (function () {
  const u = BS.u, st = BS.store, ic = BS.ic;
  let marks = false;
  return {
    title: (ctx) => 'Reading — ' + ctx.book.title,
    render(ctx) {
      const book = ctx.book;
      const b = '#/b/' + book.id;
      const chapters = ctx.query.ch ? book.chapters.filter((c) => c.id === ctx.query.ch) : book.chapters;
      const words = chapters.reduce((n, c) => n + st.chapterWords(c), 0);
      let html = '<div class="page"><div class="reader-bar"><a class="btn btn-ghost btn-sm" href="' + b + '/review">' + ic('left') + 'Review</a>' +
        '<span class="muted num" style="font-size:var(--fs-sm)">' + u.fmt(words) + ' words · about ' + Math.max(1, Math.round(words / 250)) + ' min read</span>' +
        '<label class="check-label"><input type="checkbox" data-change="marks" ' + (marks ? 'checked' : '') + '>Show highlights</label></div>';
      html += '<article class="reader' + (marks ? ' show-marks' : '') + '">';
      if (!ctx.query.ch) {
        html += '<header class="r-title"><h1>' + u.esc(book.title) + '</h1>' + (book.subtitle ? '<p>' + u.esc(book.subtitle) + '</p>' : '') + (book.author ? '<p style="font-size:18px">' + u.esc(book.author) + '</p>' : '') + '</header>';
        if (book.chapters.length > 1) html += '<nav class="reader-toc" aria-label="Contents"><h2 style="font-size:var(--fs-sm);color:var(--text-3);text-transform:uppercase;letter-spacing:.06em">Contents</h2><ol>' + book.chapters.map((c) => '<li><a href="#r-' + c.id + '" data-act="jump" data-id="' + c.id + '">' + u.esc(c.title) + '</a></li>').join('') + '</ol></nav>';
      }
      chapters.forEach((c) => {
        html += '<h1 class="r-ch" id="r-' + c.id + '">' + u.esc(c.title) + '<a class="r-edit" href="' + b + '/ch/' + c.id + '">Details</a></h1>';
        c.sections.forEach((s, i) => {
          const showTitle = !(c.sections.length === 1 && /^untitled section$/i.test(s.title));
          if (showTitle) html += (s.level === 2 ? '<h3 class="r-sec">' : '<h2 class="r-sec">') + u.esc(s.title) + '<a class="r-edit" href="' + b + '/w/' + s.id + '">Edit</a>' + (s.level === 2 ? '</h3>' : '</h2>');
          html += '<div class="prose">' + (s.words ? s.html : '<p class="muted" style="font-family:var(--font-ui);font-size:var(--fs-sm)">Not written yet. <a href="' + b + '/w/' + s.id + '">Write this section</a></p>') + '</div>';
        });
      });
      if (!chapters.length) html += '<p class="empty">Nothing to read yet.</p>';
      return html + '</article></div>';
    },
    act: {
      marks(el) { marks = el.checked; document.querySelector('.reader').classList.toggle('show-marks', marks); },
      jump(el, e) { e.preventDefault(); const t = document.getElementById('r-' + el.dataset.id); if (t) t.scrollIntoView({ behavior: 'smooth' }); }
    }
  };
})();
