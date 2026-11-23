BS.views.dashboard = (function () {
  const u = BS.u, st = BS.store, ic = BS.ic;

  function lastParagraph(html) {
    const parts = u.blockTexts(html).map((t) => t.trim()).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  }

  function resumeTarget(book) {
    if (book.last) {
      const loc = st.locate(book, book.last.sectionId);
      if (loc) return loc;
    }
    const recent = st.allSections(book).sort((a, b) => b.section.updatedAt - a.section.updatedAt)[0];
    return recent || null;
  }

  function pendingRevisions(book) {
    const out = [];
    book.chapters.forEach((c) => {
      c.revisions.filter((r) => !r.done).forEach((r) => out.push({ chapter: c, text: r.text, kind: 'comment' }));
      c.checklist.filter((r) => !r.done).forEach((r) => out.push({ chapter: c, text: r.text, kind: 'check' }));
    });
    return out;
  }

  function flaggedCount(book) {
    return st.allSections(book).reduce((n, x) => n + Object.keys(x.section.flags || {}).length, 0);
  }

  function render(ctx) {
    const book = ctx.book;
    const b = '#/b/' + book.id;
    const words = st.bookWords(book);
    const overall = u.pct(words, book.targetWords);
    const today = st.today(book), week = st.thisWeek(book), month = st.thisMonth(book);
    const streak = st.streaks(book);
    const finals = book.chapters.filter((c) => c.status === 'final').length;
    const review = book.chapters.filter((c) => c.status === 'review').length;
    const r = resumeTarget(book);

    let html = '<div class="page">';
    html += '<header class="page-head book-hero"><div class="grow"><h1>' + u.esc(book.title) + '</h1>' +
      (book.subtitle ? '<p class="sub">' + u.esc(book.subtitle) + '</p>' : '') +
      (book.description ? '<p class="desc">' + u.esc(book.description) + '</p>' : '') +
      (book.theme ? '<p class="theme-line"><strong>Central theme</strong><span>' + u.esc(book.theme) + '</span></p>' : '') +
      (!book.description && !book.theme ? '<p class="desc muted">Add a description and central theme to keep the heart of the book in view. <button class="link-btn" data-act="editBook">Add details</button></p>' : '') +
      '</div><button class="icon-btn" data-act="bookMenu" aria-label="Book options" title="Book options">' + ic('more') + '</button></header>';

    // Continue writing
    html += '<section aria-labelledby="h-resume">';
    if (r) {
      const para = lastParagraph(r.section.html);
      html += '<div class="resume"><div class="grow"><p class="where">' + u.esc(r.chapter.title) + ' · edited ' + u.ago(r.section.updatedAt) + '</p>' +
        '<h2 id="h-resume">' + u.esc(r.section.title) + '</h2>' +
        (para ? '<blockquote>…' + u.esc(u.excerpt(para.slice(-260), 240)) + '</blockquote>' : '<p class="muted" style="margin-top:var(--s2)">This section is still a blank page.</p>') +
        '</div><a class="btn btn-primary btn-lg" href="' + b + '/w/' + r.section.id + '">' + ic('pen') + 'Continue Writing</a></div>';
    } else {
      html += '<div class="resume"><div><h2 id="h-resume">Begin with a chapter</h2><p class="muted">Add your first chapter and start writing.</p></div>' +
        '<button class="btn btn-primary btn-lg" data-act="addChapter" data-open="write">' + ic('plus') + 'Add Chapter</button></div>';
    }
    html += '</section>';

    // Stats
    html += '<section class="block" aria-labelledby="h-prog"><div class="block-head"><h2 id="h-prog">Writing Progress</h2><a class="btn btn-ghost btn-sm" href="' + b + '/progress">Calendar & history' + ic('right') + '</a></div>' +
      '<div class="grid g4">' +
      '<div class="card"><p class="stat-label">Words written</p><p class="stat-value">' + u.fmt(words) + '</p><p class="stat-foot">of ' + u.fmt(book.targetWords) + ' planned</p></div>' +
      '<div class="card"><p class="stat-label">Manuscript complete</p><p class="stat-value">' + overall + '<small>%</small></p><div class="bar" style="margin-top:var(--s3)"><span data-w="' + overall + '"></span></div></div>' +
      '<div class="card"><p class="stat-label">Chapters</p><p class="stat-value">' + book.chapters.length + '</p><p class="stat-foot">' + finals + ' finalized · ' + review + ' in review</p></div>' +
      '<div class="card"><p class="stat-label">Writing streak</p><p class="stat-value">' + streak.current + '<small> ' + (streak.current === 1 ? 'day' : 'days') + '</small></p><p class="stat-foot">' + (streak.wroteToday ? 'You wrote today' : 'Write today to keep it going') + '</p></div>' +
      '</div>';
    const row = (label, v, goal) => '<div class="bar-row"><span>' + label + '</span><div class="bar' + (goal && v >= goal ? ' ok' : '') + '"><span data-w="' + u.pct(v, goal) + '"></span></div><span class="v">' + u.fmt(v) + ' / ' + u.fmt(goal) + '</span></div>';
    html += '<div class="card" style="margin-top:var(--s4)"><div class="row" style="justify-content:space-between;margin-bottom:var(--s4)"><h3 class="card-title" style="margin:0">Writing targets</h3><button class="btn btn-ghost btn-sm" data-act="editGoals">' + ic('target') + 'Adjust targets</button></div>' +
      row('Today', today, book.goals.daily) + row('This week', week, book.goals.weekly) + row('This month', month, book.goals.monthly) + '</div></section>';

    // Chapters + side lists
    html += '<div class="split block">';
    html += '<section aria-labelledby="h-ch"><div class="block-head"><h2 id="h-ch">Your Chapters</h2><button class="btn btn-primary btn-sm" data-act="addChapter">' + ic('plus') + 'Add Chapter</button></div>';
    if (!book.chapters.length) html += '<div class="card"><p class="empty">No chapters yet.</p></div>';
    else {
      const maxW = Math.max(1, ...book.chapters.map(st.chapterWords));
      html += '<div class="card card-tight"><table class="ch-table"><thead><tr><th class="n">#</th><th>Chapter</th><th class="hide-sm">Status</th><th class="w">Words</th><th class="p"><span class="sr-only">Progress</span></th></tr></thead><tbody>' +
        book.chapters.map((c, i) => {
          const w = st.chapterWords(c);
          const p = c.targetWords ? u.pct(w, c.targetWords) : Math.round((w / maxW) * 100);
          return '<tr data-chapter-id="' + c.id + '"><td class="n">' + (i + 1) + '</td><td class="t"><a href="' + b + '/ch/' + c.id + '">' + u.esc(c.title) + '</a></td>' +
            '<td class="hide-sm"><span class="status-pill"><span class="dot ' + c.status + '"></span>' + BS.ui.statusLabels[c.status] + '</span></td>' +
            '<td class="w">' + u.fmt(w) + (c.targetWords ? ' <span class="muted">/ ' + u.fmt(c.targetWords) + '</span>' : '') + '</td>' +
            '<td class="p"><div class="bar' + (c.status === 'final' ? ' ok' : '') + '" title="' + (c.targetWords ? p + '% of chapter target' : 'Relative length') + '"><span data-w="' + p + '"></span></div></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    html += '</section><div>';

    const recent = st.allSections(book).filter((x) => x.section.words > 0 || x.section.updatedAt > x.section.createdAt + 1000)
      .sort((a, c) => c.section.updatedAt - a.section.updatedAt).slice(0, 5);
    html += '<section aria-labelledby="h-recent"><div class="block-head"><h2 id="h-recent">Recently Edited</h2></div><div class="card card-tight"><div class="list">' +
      (recent.length ? recent.map((x) => '<div class="list-item"><div class="li-main"><a class="li-title" href="' + b + '/w/' + x.section.id + '">' + u.esc(x.section.title) + '</a><div class="li-sub">' + u.esc(x.chapter.title) + '</div></div><span class="li-meta">' + u.ago(x.section.updatedAt) + '</span></div>').join('')
        : '<p class="empty">Nothing edited yet.</p>') + '</div></div></section>';

    const pend = pendingRevisions(book);
    const unfinished = book.chapters.filter((c) => c.status !== 'final');
    const flagged = flaggedCount(book);
    html += '<section class="block" aria-labelledby="h-att" style="margin-top:var(--s8)"><div class="block-head"><h2 id="h-att">Needs Attention</h2><a class="btn btn-ghost btn-sm" href="' + b + '/review">Review' + ic('right') + '</a></div><div class="card card-tight"><div class="list">' +
      '<div class="list-item"><div class="li-main"><span class="li-title">Unfinished chapters</span><div class="li-sub">' + (unfinished.length ? u.esc(unfinished.slice(0, 3).map((c) => c.title).join(', ')) + (unfinished.length > 3 ? '…' : '') : 'Every chapter is finalized') + '</div></div><span class="li-meta">' + unfinished.length + '</span></div>' +
      '<div class="list-item"><div class="li-main"><span class="li-title">Open revision items</span><div class="li-sub">' + (pend.length ? u.esc(u.excerpt(pend[0].text, 60)) + ' — ' + u.esc(pend[0].chapter.title) : 'No open checklist items or comments') + '</div></div><span class="li-meta">' + pend.length + '</span></div>' +
      '<div class="list-item"><div class="li-main"><span class="li-title">Passages flagged for revision</span><div class="li-sub">Marked in the editor’s revision mode</div></div><span class="li-meta">' + flagged + '</span></div>' +
      '</div></div></section>';
    html += '</div></div></div>';
    return html;
  }

  function animateBars(root) {
    requestAnimationFrame(() => root.querySelectorAll('.bar > span[data-w]').forEach((s) => { s.style.width = s.dataset.w + '%'; }));
  }

  async function editBook(ctx) {
    const book = ctx.book;
    const d = await BS.ui.form('Book details', [
      { name: 'title', label: 'Title', value: book.title, required: true },
      { name: 'subtitle', label: 'Subtitle', value: book.subtitle, optional: true },
      { name: 'author', label: 'Author name', value: book.author, optional: true },
      { name: 'description', label: 'Description', type: 'textarea', value: book.description, optional: true },
      { name: 'theme', label: 'Central theme', value: book.theme, optional: true },
      { name: 'targetWords', label: 'Target length (words)', type: 'number', value: book.targetWords, min: 0 }
    ], 'Save details', { wide: true });
    if (!d) return;
    d.targetWords = Math.max(0, parseInt(d.targetWords, 10) || 0);
    d.title = d.title.trim();
    st.updateBook(book, d);
    BS.ui.toast('Details saved', { kind: 'success' });
  }

  async function editGoals(ctx) {
    const g = ctx.book.goals;
    const d = await BS.ui.form('Writing targets', [
      { name: 'daily', label: 'Words per day', type: 'number', value: g.daily, min: 0 },
      { name: 'weekly', label: 'Words per week', type: 'number', value: g.weekly, min: 0 },
      { name: 'monthly', label: 'Words per month', type: 'number', value: g.monthly, min: 0 }
    ], 'Save targets', { intro: 'Net new words count toward each target. Deleting text lowers that day’s count.' });
    if (!d) return;
    st.updateBook(ctx.book, { goals: { daily: +d.daily || 0, weekly: +d.weekly || 0, monthly: +d.monthly || 0 } });
    BS.ui.toast('Targets updated', { kind: 'success' });
  }

  async function deleteBook(ctx) {
    const book = ctx.book;
    const v = await BS.ui.modal({
      title: 'Delete “' + book.title + '”?',
      body: '<p class="modal-text">The book, its notes and its version history will be removed from this browser. A safety backup is kept under Export & Backup, but download a backup file first if in doubt.</p>' +
        '<div class="form" style="margin-top:var(--s4)">' + BS.ui.field({ name: 'confirm', label: 'Type the book title to confirm', placeholder: book.title }) + '</div>',
      actions: [{ label: 'Cancel', value: false }, { label: 'Delete book', kind: 'danger', validate: (w) => w.querySelector('[name=confirm]').value.trim() === book.title.trim(), value: true }]
    });
    if (v !== true) return;
    await st.deleteBook(book.id);
    st.saveSettings({ lastBookId: null });
    BS.app.go('#/');
    BS.ui.toast('Book deleted. A safety backup was kept.');
  }

  return {
    title: (ctx) => ctx.book.title,
    render,
    mount: (root) => animateBars(root),
    pendingRevisions,
    animateBars,
    editGoals,
    act: {
      editBook: (el, e, ctx) => editBook(ctx),
      editGoals: (el, e, ctx) => editGoals(ctx),
      bookMenu(el, e, ctx) {
        BS.app.menu(el, [
          { label: 'Edit details', icon: 'edit', onClick: () => editBook(ctx) },
          { label: 'Adjust targets', icon: 'target', onClick: () => editGoals(ctx) },
          { label: 'Export & backup', icon: 'download', onClick: () => BS.app.go('#/b/' + ctx.book.id + '/export') },
          { sep: true },
          { label: 'Delete book…', icon: 'trash', danger: true, onClick: () => deleteBook(ctx) }
        ]);
      }
    }
  };
})();
