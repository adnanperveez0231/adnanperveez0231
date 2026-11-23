/* Chapter details: purpose, notes, status, revision checklist and comments. */
BS.views.chapter = (function () {
  const u = BS.u, st = BS.store, ic = BS.ic;

  function render(ctx) {
    const book = ctx.book, c = ctx.chapter;
    const b = '#/b/' + book.id;
    const idx = book.chapters.indexOf(c);
    const words = st.chapterWords(c);
    const linked = book.notes.filter((n) => n.chapterId === c.id);
    const seg = ['draft', 'review', 'final'].map((s) => '<button type="button" class="' + (c.status === s ? 'on' : '') + '" data-act="setStatus" data-s="' + s + '" aria-pressed="' + (c.status === s) + '">' + BS.ui.statusLabels[s] + '</button>').join('');
    const prev = book.chapters[idx - 1], next = book.chapters[idx + 1];

    let html = '<div class="page">';
    html += '<p class="eyebrow"><a href="' + b + '/outline">Outline</a>' + ic('right', 'sm') + '<span class="num">Chapter ' + (idx + 1) + ' of ' + book.chapters.length + '</span></p>';
    html += '<header class="page-head" style="align-items:flex-start"><div class="grow"><input class="inline-title" value="' + u.esc(c.title) + '" data-change="title" aria-label="Chapter title">' +
      '<p class="muted num" style="margin-top:var(--s2)">' + u.fmt(words) + ' words' + (c.targetWords ? ' of ' + u.fmt(c.targetWords) + ' planned' : '') + ' · ' + c.sections.length + (c.sections.length === 1 ? ' section' : ' sections') + ' · edited ' + u.ago(c.updatedAt) + '</p></div>' +
      '<div class="row">' + (c.sections[0] ? '<a class="btn btn-primary" href="' + b + '/w/' + (c.sections.find((s) => book.last && s.id === book.last.sectionId) || c.sections[0]).id + '">' + ic('pen') + 'Write this chapter</a>' : '') +
      '<button class="icon-btn" data-act="menu" aria-label="Chapter options">' + ic('more') + '</button></div></header>';

    html += '<div class="split">';
    // left column
    html += '<div>';
    html += '<section class="card"><h3>Purpose</h3><div class="form">' +
      '<label class="field"><span class="field-label">What this chapter is about</span><textarea rows="3" data-input="field" data-f="description" placeholder="A short summary in your own words">' + u.esc(c.description) + '</textarea></label>' +
      '<label class="field"><span class="field-label">Objective</span><textarea rows="2" data-input="field" data-f="objective" placeholder="What should the reader understand or feel by the end?">' + u.esc(c.objective) + '</textarea></label>' +
      '</div></section>';

    html += '<section class="card" style="margin-top:var(--s4)"><div class="row" style="justify-content:space-between;margin-bottom:var(--s3)"><h3 style="margin:0">Sections</h3><button class="btn btn-ghost btn-sm" data-act="addSection">' + ic('plus') + 'Add section</button></div><div class="list">' +
      (c.sections.length ? c.sections.map((s) => '<div class="list-item" data-sid="' + s.id + '"' + (s.level === 2 ? ' style="padding-left:var(--s6)"' : '') + '><div class="li-main"><a class="li-title" href="' + b + '/w/' + s.id + '">' + u.esc(s.title) + '</a>' +
        '<div class="li-sub">' + (Object.keys(s.flags).length ? Object.keys(s.flags).length + ' flagged · ' : '') + 'edited ' + u.ago(s.updatedAt) + '</div></div><span class="li-meta">' + u.fmt(s.words) + ' words</span></div>').join('')
        : '<p class="empty">No sections. Add one to start writing.</p>') + '</div></section>';

    html += '<section class="card" style="margin-top:var(--s4)"><h3>Chapter notes</h3><textarea rows="7" data-input="field" data-f="notes" placeholder="Private notes for this chapter — never exported">' + u.esc(c.notes) + '</textarea>' +
      (linked.length ? '<p class="muted" style="margin-top:var(--s3);font-size:var(--fs-sm)">' + linked.length + ' research ' + (linked.length === 1 ? 'note is' : 'notes are') + ' linked to this chapter. <a href="' + b + '/notes?ch=' + c.id + '">Open them</a></p>' : '') +
      '</section>';
    html += '</div>';

    // right column
    html += '<div>';
    html += '<section class="card"><h3>Status</h3><div class="seg" role="group" aria-label="Chapter status">' + seg + '</div>' +
      '<label class="field" style="margin-top:var(--s4)"><span class="field-label">Target length (words)</span><input type="number" min="0" value="' + (c.targetWords || '') + '" placeholder="No target" data-change="target"></label>' +
      (c.targetWords ? '<div class="bar' + (words >= c.targetWords ? ' ok' : '') + '" style="margin-top:var(--s3)"><span data-w="' + u.pct(words, c.targetWords) + '"></span></div>' : '') +
      '</section>';

    const done = c.checklist.filter((x) => x.done).length;
    html += '<section class="card" style="margin-top:var(--s4)"><div class="row" style="justify-content:space-between;margin-bottom:var(--s2)"><h3 style="margin:0">Revision checklist</h3>' +
      (c.checklist.length ? '<span class="muted num" style="font-size:var(--fs-sm)">' + done + ' / ' + c.checklist.length + '</span>' : '') + '</div>' +
      '<div class="checklist">' + c.checklist.map((x) => '<label class="check-item' + (x.done ? ' done' : '') + '" data-cid="' + x.id + '"><input type="checkbox" ' + (x.done ? 'checked' : '') + ' data-change="toggleCheck" data-id="' + x.id + '"><span>' + u.esc(x.text) + '</span>' +
        '<button class="icon-btn" data-act="delCheck" data-id="' + x.id + '" aria-label="Remove item">' + ic('x') + '</button></label>').join('') + '</div>' +
      '<form class="add-row" data-form="check"><input placeholder="Add a checklist item" aria-label="New checklist item" name="text"><button class="btn" type="submit">Add</button></form>' +
      (!c.checklist.length && book.chapters.some((o) => o !== c && o.checklist.length) ? '<button class="link-btn" style="margin-top:var(--s3);font-size:var(--fs-sm)" data-act="copyChecklist">Copy a checklist from another chapter</button>' : '') +
      '</section>';

    const open = c.revisions.filter((r) => !r.done), closed = c.revisions.filter((r) => r.done);
    html += '<section class="card" style="margin-top:var(--s4)"><h3>What needs improvement</h3>' +
      '<form data-form="rev"><textarea name="text" rows="2" placeholder="Describe what to improve in this chapter"></textarea><div class="row" style="justify-content:flex-end;margin-top:var(--s2)"><button class="btn" type="submit">Add comment</button></div></form>' +
      '<div style="margin-top:var(--s3)">' + open.concat(closed).map((r) => '<div class="rev-item' + (r.done ? ' done' : '') + '"><input type="checkbox" ' + (r.done ? 'checked' : '') + ' data-change="toggleRev" data-id="' + r.id + '" aria-label="Mark resolved">' +
        '<div class="grow"><div class="rev-text">' + u.esc(r.text) + '</div><div class="rev-when num">' + (r.done ? 'Resolved ' + u.ago(r.doneAt) : 'Added ' + u.ago(r.at)) + '</div></div>' +
        '<button class="icon-btn" data-act="delRev" data-id="' + r.id + '" aria-label="Delete comment">' + ic('x') + '</button></div>').join('') + '</div>' +
      '</section>';

    html += '<section class="card" style="margin-top:var(--s4)"><h3>Export this chapter</h3><div class="row-wrap">' +
      '<button class="btn btn-sm" data-act="exportDocx">' + ic('download') + 'DOCX</button><button class="btn btn-sm" data-act="exportPdf">' + ic('download') + 'PDF</button></div></section>';
    html += '</div></div>';

    html += '<nav class="row block" style="justify-content:space-between">' +
      (prev ? '<a class="btn btn-ghost" href="' + b + '/ch/' + prev.id + '">' + ic('left') + u.esc(u.excerpt(prev.title, 28)) + '</a>' : '<span></span>') +
      (next ? '<a class="btn btn-ghost" href="' + b + '/ch/' + next.id + '">' + u.esc(u.excerpt(next.title, 28)) + ic('right') + '</a>' : '<span></span>') + '</nav>';
    return html + '</div>';
  }

  const saveField = u.debounce((book, c, f, v) => st.updateChapter(book, c, { [f]: v }, true), 400);

  function mount(root, ctx) {
    BS.views.dashboard.animateBars(root);
    root.querySelectorAll('form[data-form]').forEach((f) => f.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = f.querySelector('[name=text]');
      const text = input.value.trim();
      if (!text) { input.focus(); return; }
      const c = ctx.chapter;
      if (f.dataset.form === 'check') c.checklist.push({ id: u.uid(), text, done: false });
      else c.revisions.unshift({ id: u.uid(), text, done: false, at: Date.now() });
      st.updateChapter(ctx.book, c, {});
      setTimeout(() => { const i = document.querySelector('form[data-form="' + f.dataset.form + '"] [name=text]'); if (i) i.focus(); }, 0);
    }));
    root.querySelectorAll('form[data-form="rev"] textarea').forEach((t) => t.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) t.form.requestSubmit();
    }));
  }

  return {
    title: (ctx) => ctx.chapter.title,
    render,
    mount,
    unmount: () => saveField.flush(),
    act: {
      title(el, e, ctx) {
        const v = el.value.trim();
        if (!v) { el.value = ctx.chapter.title; return; }
        st.updateChapter(ctx.book, ctx.chapter, { title: v }, true);
        BS.app.renderSidebar();
      },
      field(el, e, ctx) { saveField(ctx.book, ctx.chapter, el.dataset.f, el.value); st.S.status = 'saving'; BS.app.updateSaveState(); },
      setStatus(el, e, ctx) {
        const s = el.dataset.s;
        if (s === 'final' && ctx.chapter.checklist.some((x) => !x.done)) BS.ui.toast('Finalized — note: some checklist items are still open.');
        st.updateChapter(ctx.book, ctx.chapter, { status: s });
        if (s === 'final') BS.ui.toast('“' + ctx.chapter.title + '” marked Finalized', { kind: 'success' });
      },
      target(el, e, ctx) { st.updateChapter(ctx.book, ctx.chapter, { targetWords: Math.max(0, parseInt(el.value, 10) || 0) }); },
      toggleCheck(el, e, ctx) {
        const x = ctx.chapter.checklist.find((i) => i.id === el.dataset.id);
        x.done = el.checked;
        const row = el.closest('.check-item');
        row.classList.toggle('done', x.done);
        if (x.done) row.classList.add('just-done');
        st.updateChapter(ctx.book, ctx.chapter, {}, true);
        setTimeout(() => BS.app.render(false), 450);
      },
      delCheck(el, e, ctx) { e.preventDefault(); ctx.chapter.checklist = ctx.chapter.checklist.filter((i) => i.id !== el.dataset.id); st.updateChapter(ctx.book, ctx.chapter, {}); },
      toggleRev(el, e, ctx) {
        const r = ctx.chapter.revisions.find((i) => i.id === el.dataset.id);
        r.done = el.checked;
        r.doneAt = Date.now();
        st.updateChapter(ctx.book, ctx.chapter, {});
      },
      async delRev(el, e, ctx) {
        if (!(await BS.ui.confirm('Delete comment?', 'This revision comment will be removed.', { confirmLabel: 'Delete', danger: true }))) return;
        ctx.chapter.revisions = ctx.chapter.revisions.filter((i) => i.id !== el.dataset.id);
        st.updateChapter(ctx.book, ctx.chapter, {});
      },
      addSection(el, e, ctx) {
        const s = st.addSection(ctx.book, ctx.chapter.id, {});
        BS.app.go('#/b/' + ctx.book.id + '/w/' + s.id);
      },
      copyChecklist(el, e, ctx) {
        const others = ctx.book.chapters.filter((o) => o !== ctx.chapter && o.checklist.length);
        BS.app.menu(el, [{ header: 'Copy checklist from' }].concat(others.map((o) => ({
          label: o.title + ' (' + o.checklist.length + ')', onClick: () => {
            ctx.chapter.checklist = o.checklist.map((x) => ({ id: u.uid(), text: x.text, done: false }));
            st.updateChapter(ctx.book, ctx.chapter, {});
          }
        }))));
      },
      exportDocx(el, e, ctx) { BS.views.export.quick(ctx.book, [ctx.chapter.id], 'docx', el); },
      exportPdf(el, e, ctx) { BS.views.export.quick(ctx.book, [ctx.chapter.id], 'pdf', el); },
      menu(el, e, ctx) {
        const book = ctx.book, c = ctx.chapter;
        BS.app.menu(el, [
          { label: 'Open in outline', icon: 'outline', onClick: () => BS.app.go('#/b/' + book.id + '/outline') },
          { label: 'Read this chapter', icon: 'read', onClick: () => BS.app.go('#/b/' + book.id + '/read?ch=' + c.id) },
          { sep: true },
          { label: 'Remove chapter', icon: 'trash', danger: true, onClick: () => {
            st.trashChapter(book, c.id);
            BS.app.go('#/b/' + book.id + '/outline');
            BS.ui.toast('“' + c.title + '” moved to trash', { action: 'Undo', onAction: () => st.restoreTrash(book, book.trash[0].id) });
          } }
        ]);
      }
    }
  };
})();
