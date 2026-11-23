/* Hierarchical outline: chapters → sections → subsections.
   Drag to reorder or move between chapters; every action also has a button/menu equivalent. */
BS.views.outline = (function () {
  const u = BS.u, st = BS.store, ic = BS.ic;
  let drag = null; // { kind:'chapter'|'section', id }

  function render(ctx) {
    const book = ctx.book;
    const b = '#/b/' + book.id;
    let html = '<div class="page page-narrow"><header class="page-head"><div><h1>Outline</h1>' +
      '<p class="lede">Shape the structure of the book. Drag chapters and sections to reorder or move them; nothing is lost when you rearrange.</p></div>' +
      '<button class="btn btn-primary" data-act="addChapter">' + ic('plus') + 'Add Chapter</button></header>';
    if (!book.chapters.length) html += '<div class="empty-lg"><h2>No chapters yet</h2><p>Add a chapter to begin building the outline.</p><button class="btn btn-primary" data-act="addChapter">' + ic('plus') + 'Add Chapter</button></div>';
    html += '<div id="ol">' + book.chapters.map((c, i) => {
      const w = st.chapterWords(c);
      return '<div class="ol-chapter" data-chapter-id="' + c.id + '" data-ci="' + i + '">' +
        '<div class="ol-head" draggable="true" data-drag="chapter" data-id="' + c.id + '">' +
        '<span class="grip" title="Drag to reorder">' + ic('grip') + '</span><span class="num">' + (i + 1) + '</span>' +
        '<input class="ol-title" value="' + u.esc(c.title) + '" data-change="renameChapter" data-id="' + c.id + '" aria-label="Chapter title">' +
        '<span class="status-pill hide-sm"><span class="dot ' + c.status + '"></span></span>' +
        '<span class="ol-meta">' + u.fmt(w) + ' words</span>' +
        '<span class="tools">' +
        '<button class="icon-btn" data-act="chUp" data-id="' + c.id + '" aria-label="Move chapter up" ' + (i === 0 ? 'disabled' : '') + '>' + ic('up') + '</button>' +
        '<button class="icon-btn" data-act="chDown" data-id="' + c.id + '" aria-label="Move chapter down" ' + (i === book.chapters.length - 1 ? 'disabled' : '') + '>' + ic('down') + '</button>' +
        '<a class="icon-btn" href="' + b + '/ch/' + c.id + '" aria-label="Chapter details" title="Description, notes & checklist">' + ic('edit') + '</a>' +
        '<button class="icon-btn" data-act="chMenu" data-id="' + c.id + '" aria-label="More chapter actions">' + ic('more') + '</button>' +
        '</span></div>' +
        (c.objective || c.description ? '<p class="ol-desc">' + u.esc(u.excerpt(c.objective || c.description, 160)) + '</p>' : '') +
        '<div class="ol-secs" data-drop-chapter="' + c.id + '">' +
        (c.sections.length ? c.sections.map((s, si) =>
          '<div class="ol-sec lvl' + s.level + '" draggable="true" data-drag="section" data-id="' + s.id + '" data-sid="' + s.id + '">' +
          '<span class="grip" title="Drag to reorder or move">' + ic('grip') + '</span>' +
          '<input value="' + u.esc(s.title) + '" data-change="renameSection" data-id="' + s.id + '" aria-label="Section title">' +
          '<span class="ol-meta">' + u.fmt(s.words) + '</span>' +
          '<span class="tools">' +
          (s.level === 1 ? '<button class="icon-btn" data-act="secIndent" data-id="' + s.id + '" aria-label="Make subsection" title="Make subsection" ' + (si === 0 ? 'disabled' : '') + '>' + ic('indent') + '</button>'
            : '<button class="icon-btn" data-act="secOutdent" data-id="' + s.id + '" aria-label="Make section" title="Make section">' + ic('outdent') + '</button>') +
          '<button class="icon-btn" data-act="secMenu" data-id="' + s.id + '" aria-label="More section actions">' + ic('more') + '</button>' +
          '<a class="icon-btn" href="' + b + '/w/' + s.id + '" aria-label="Write" title="Write">' + ic('pen') + '</a>' +
          '</span></div>').join('') : '<div class="ol-empty-drop">Drop a section here</div>') +
        '</div>' +
        '<div class="ol-add"><button class="btn btn-ghost btn-sm" data-act="addSection" data-id="' + c.id + '">' + ic('plus') + 'Add section</button></div>' +
        '</div>';
    }).join('') + '</div>';

    if (book.trash.length) {
      html += '<section class="block"><div class="block-head"><div><h2>Recently Removed</h2><p>Removed chapters, sections and notes stay here until you empty the trash.</p></div>' +
        '<button class="btn btn-ghost btn-sm" data-act="emptyTrash">Empty trash</button></div><div class="card card-tight"><div class="list">' +
        book.trash.map((t) => {
          const name = t.kind === 'note' ? (t.item.title || u.excerpt(t.item.body, 50) || 'Untitled note') : t.item.title;
          const words = t.kind === 'chapter' ? st.chapterWords(t.item) : t.kind === 'section' ? t.item.words : null;
          return '<div class="list-item"><div class="li-main"><span class="li-title">' + u.esc(name) + '</span><div class="li-sub">' +
            ({ chapter: 'Chapter', section: 'Section', note: 'Note' })[t.kind] + (words != null ? ' · ' + u.fmt(words) + ' words' : '') + ' · removed ' + u.ago(t.deletedAt) + '</div></div>' +
            '<button class="btn btn-sm" data-act="restore" data-id="' + t.id + '">' + ic('restore') + 'Restore</button></div>';
        }).join('') + '</div></div></section>';
    }
    return html + '</div>';
  }

  function clearDrop(root) {
    root.querySelectorAll('.drop-before,.drop-after,.drop-in,.dragging').forEach((el) => el.classList.remove('drop-before', 'drop-after', 'drop-in', 'dragging'));
  }

  function mount(root, ctx) {
    const book = ctx.book;
    const ol = root.querySelector('#ol');
    if (!ol) return;
    ol.addEventListener('dragstart', (e) => {
      const el = e.target.closest('[data-drag]');
      if (!el || e.target.tagName === 'INPUT') { e.preventDefault(); return; }
      e.stopPropagation();
      drag = { kind: el.dataset.drag, id: el.dataset.id };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', drag.id);
      (drag.kind === 'chapter' ? el.closest('.ol-chapter') : el).classList.add('dragging');
    });
    ol.addEventListener('dragend', () => { drag = null; clearDrop(ol); });
    ol.addEventListener('dragover', (e) => {
      if (!drag) return;
      e.preventDefault();
      ol.querySelectorAll('.drop-before,.drop-after,.drop-in').forEach((x) => x.classList.remove('drop-before', 'drop-after', 'drop-in'));
      if (drag.kind === 'chapter') {
        const ch = e.target.closest('.ol-chapter');
        if (!ch) return;
        const r = ch.getBoundingClientRect();
        ch.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
      } else {
        const sec = e.target.closest('.ol-sec');
        if (sec) {
          const r = sec.getBoundingClientRect();
          sec.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
          return;
        }
        const empty = e.target.closest('.ol-chapter');
        if (empty) {
          const z = empty.querySelector('.ol-empty-drop');
          if (z) z.classList.add('drop-in');
          else empty.classList.add('drop-after');
        }
      }
    });
    ol.addEventListener('drop', (e) => {
      if (!drag) return;
      e.preventDefault();
      const d = drag;
      drag = null;
      if (d.kind === 'chapter') {
        const ch = e.target.closest('.ol-chapter');
        if (!ch) return clearDrop(ol);
        const from = book.chapters.findIndex((c) => c.id === d.id);
        let to = +ch.dataset.ci;
        const after = ch.classList.contains('drop-after');
        if (after) to += 1;
        if (from < to) to -= 1;
        clearDrop(ol);
        st.moveChapter(book, from, to);
        return;
      }
      const sec = e.target.closest('.ol-sec');
      const chEl = e.target.closest('.ol-chapter');
      if (!chEl) return clearDrop(ol);
      const dest = st.chapter(book, chEl.dataset.chapterId);
      let idx = dest.sections.length;
      if (sec && sec.dataset.sid !== d.id) {
        idx = dest.sections.findIndex((s) => s.id === sec.dataset.sid);
        if (sec.classList.contains('drop-after')) idx += 1;
        const loc = st.locate(book, d.id);
        if (loc.chapter.id === dest.id && loc.si < idx) idx -= 1;
      } else if (sec) { clearDrop(ol); return; }
      clearDrop(ol);
      st.moveSection(book, d.id, dest.id, idx);
      const moved = st.locate(book, d.id);
      if (moved && moved.si === 0 && moved.section.level === 2) st.updateSection(book, moved.section, { level: 1 });
      setTimeout(() => BS.ui.flash(document.querySelector('[data-sid="' + d.id + '"]')), 20);
    });
  }

  function moveSectionMenu(el, ctx, s) {
    const book = ctx.book;
    const loc = st.locate(book, s.id);
    const items = [{ header: 'Move to chapter' }];
    book.chapters.forEach((c) => {
      if (c.id === loc.chapter.id) return;
      items.push({ label: c.title, icon: 'move', onClick: () => { st.moveSection(book, s.id, c.id); if (s.level === 2 && !c.sections.length) s.level = 1; BS.ui.toast('Moved to “' + c.title + '”', { kind: 'success' }); } });
    });
    if (items.length === 1) items.push({ header: 'Add another chapter first' });
    return items;
  }

  return {
    title: () => 'Outline',
    render,
    mount,
    act: {
      renameChapter(el, e, ctx) {
        const c = st.chapter(ctx.book, el.dataset.id);
        const v = el.value.trim();
        if (!v) { el.value = c.title; return; }
        st.updateChapter(ctx.book, c, { title: v }, true);
        BS.app.renderSidebar();
      },
      renameSection(el, e, ctx) {
        const loc = st.locate(ctx.book, el.dataset.id);
        const v = el.value.trim();
        if (!v) { el.value = loc.section.title; return; }
        st.updateSection(ctx.book, loc.section, { title: v }, true);
        BS.app.renderSidebar();
      },
      chUp(el, e, ctx) { const i = ctx.book.chapters.findIndex((c) => c.id === el.dataset.id); st.moveChapter(ctx.book, i, i - 1); },
      chDown(el, e, ctx) { const i = ctx.book.chapters.findIndex((c) => c.id === el.dataset.id); st.moveChapter(ctx.book, i, i + 1); },
      addSection(el, e, ctx) {
        const s = st.addSection(ctx.book, el.dataset.id, { title: 'Untitled section' });
        const input = document.querySelector('[data-sid="' + s.id + '"] input');
        if (input) { BS.ui.flash(input.closest('.ol-sec')); input.focus(); input.select(); }
      },
      secIndent(el, e, ctx) { const loc = st.locate(ctx.book, el.dataset.id); if (loc.si > 0) st.updateSection(ctx.book, loc.section, { level: 2 }); },
      secOutdent(el, e, ctx) { const loc = st.locate(ctx.book, el.dataset.id); st.updateSection(ctx.book, loc.section, { level: 1 }); },
      chMenu(el, e, ctx) {
        const book = ctx.book;
        const c = st.chapter(book, el.dataset.id);
        BS.app.menu(el, [
          { label: 'Chapter details', icon: 'edit', onClick: () => BS.app.go('#/b/' + book.id + '/ch/' + c.id) },
          { label: 'Insert chapter after', icon: 'plus', onClick: () => { const i = book.chapters.indexOf(c); st.addChapter(book, 'Chapter ' + (i + 2), i + 1); } },
          { sep: true },
          { label: 'Remove chapter', icon: 'trash', danger: true, onClick: () => {
            st.trashChapter(book, c.id);
            BS.ui.toast('“' + c.title + '” moved to trash', { action: 'Undo', onAction: () => st.restoreTrash(book, book.trash[0].id) });
          } }
        ]);
      },
      secMenu(el, e, ctx) {
        const book = ctx.book;
        const loc = st.locate(book, el.dataset.id);
        const s = loc.section;
        const items = [
          { label: 'Write', icon: 'pen', onClick: () => BS.app.go('#/b/' + book.id + '/w/' + s.id) },
          { label: 'Insert section after', icon: 'plus', onClick: () => st.addSection(book, loc.chapter.id, { after: s.id, level: s.level }) },
          { label: 'Move up', icon: 'up', onClick: () => { if (loc.si > 0) st.moveSection(book, s.id, loc.chapter.id, loc.si - 1); } },
          { label: 'Move down', icon: 'down', onClick: () => st.moveSection(book, s.id, loc.chapter.id, loc.si + 1) },
          { sep: true }
        ].concat(moveSectionMenu(el, ctx, s)).concat([
          { sep: true },
          { label: 'Remove section', icon: 'trash', danger: true, onClick: () => {
            st.trashSection(book, s.id);
            BS.ui.toast('“' + s.title + '” moved to trash', { action: 'Undo', onAction: () => st.restoreTrash(book, book.trash[0].id) });
          } }
        ]);
        BS.app.menu(el, items);
      },
      restore(el, e, ctx) {
        const t = st.restoreTrash(ctx.book, el.dataset.id);
        if (t) BS.ui.toast('Restored', { kind: 'success' });
      },
      async emptyTrash(el, e, ctx) {
        const ok = await BS.ui.confirm('Empty trash?', 'Removed items will be permanently deleted from this book. Daily backups still contain earlier copies.', { confirmLabel: 'Empty trash', danger: true });
        if (ok) st.purgeTrash(ctx.book);
      }
    }
  };
})();
