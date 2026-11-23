BS.views.sidebar = (function () {
  const u = BS.u, st = BS.store, ic = BS.ic;
  const open = new Set(JSON.parse((() => { try { return localStorage.getItem('bs-open') || '[]'; } catch (e) { return '[]'; } })()));
  const saveOpen = () => { try { localStorage.setItem('bs-open', JSON.stringify([...open])); } catch (e) { /* ignore */ } };

  function render(ctx) {
    const book = ctx.book;
    const themeIcon = { system: 'monitor', light: 'sun', dark: 'moon' }[st.S.settings.theme] || 'monitor';
    let html = '<div class="sb-top"><a class="sb-brand" href="#/">' + ic('library') + '<span>Book Studio</span></a>';
    if (book) {
      html += '<button class="book-switch" data-act="switchBook" aria-haspopup="menu"><span><span class="bs-title">' + u.esc(book.title) + '</span>' +
        '<span class="bs-sub">' + u.fmt(st.bookWords(book)) + ' words</span></span>' + ic('down') + '</button>';
    }
    html += '</div>';

    if (!book) {
      html += '<nav class="sb-nav"><a class="sb-link active" href="#/">' + ic('book') + 'All books</a></nav><div class="sb-tree"></div>';
    } else {
      const b = '#/b/' + book.id;
      const link = (name, href, icon, label, count) => '<a class="sb-link' + (ctx.name === name || (name === 'review' && ctx.name === 'reader') ? ' active' : '') + '" href="' + href + '">' + ic(icon) + '<span>' + label + '</span>' + (count != null ? '<span class="count">' + count + '</span>' : '') + '</a>';
      html += '<nav class="sb-nav">' +
        link('dashboard', b, 'home', 'Dashboard') +
        link('outline', b + '/outline', 'outline', 'Outline') +
        link('notes', b + '/notes', 'note', 'Notes & Research', book.notes.length || null) +
        link('progress', b + '/progress', 'chart', 'Progress') +
        link('review', b + '/review', 'review', 'Review') +
        link('export', b + '/export', 'download', 'Export & Backup') +
        '</nav>';
      const activeSec = ctx.section ? ctx.section.id : null;
      const activeCh = ctx.chapter ? ctx.chapter.id : null;
      if (activeCh && !open.has(activeCh)) { open.add(activeCh); saveOpen(); }
      html += '<div class="sb-section-head"><h2>Your Chapters</h2><button class="icon-btn" data-act="addChapter" aria-label="Add chapter" title="Add chapter">' + ic('plus') + '</button></div>';
      html += '<div class="sb-tree">';
      if (!book.chapters.length) html += '<p class="empty">No chapters yet.</p>';
      book.chapters.forEach((c) => {
        const isOpen = open.has(c.id);
        html += '<div class="tree-ch' + (isOpen ? ' open' : '') + '" data-chapter-id="' + c.id + '">' +
          '<div class="tree-row' + (ctx.name === 'chapter' && activeCh === c.id ? ' active' : '') + '">' +
          '<button class="tree-toggle" data-act="toggleTree" data-id="' + c.id + '" aria-expanded="' + isOpen + '" aria-label="Show sections">' + ic('right') + '</button>' +
          '<a href="' + b + '/ch/' + c.id + '" title="' + u.esc(c.title) + '">' + u.esc(c.title) + '</a>' +
          '<span class="dot ' + c.status + '" title="' + BS.ui.statusLabels[c.status] + '"></span><span class="tw">' + u.fmt(st.chapterWords(c)) + '</span></div>' +
          '<div class="tree-secs">' + c.sections.map((s) =>
            '<div class="tree-row lvl' + s.level + (activeSec === s.id ? ' active' : '') + '"><a href="' + b + '/w/' + s.id + '" title="' + u.esc(s.title) + '">' + u.esc(s.title) + '</a></div>').join('') +
          '</div></div>';
      });
      html += '</div>';
    }
    html += '<div class="sb-foot">' + BS.app.saveStateHtml() +
      (book ? '<button class="icon-btn" data-act="quickCapture" title="Capture a thought (Ctrl+Shift+N)" aria-label="Capture a thought">' + ic('lightbulb') + '</button>' : '') +
      '<button class="icon-btn" data-act="cycleTheme" title="Theme: ' + st.S.settings.theme + '" aria-label="Change theme">' + ic(themeIcon) + '</button></div>';
    return html;
  }

  const act = {
    toggleTree(el) {
      const id = el.dataset.id;
      const wrap = el.closest('.tree-ch');
      if (open.has(id)) open.delete(id); else open.add(id);
      saveOpen();
      wrap.classList.toggle('open', open.has(id));
      el.setAttribute('aria-expanded', open.has(id));
    },
    switchBook(el) {
      const cur = BS.app.current().ctx.book;
      const items = [{ header: 'Your books' }];
      st.S.books.forEach((b) => items.push({ label: b.title + (cur && b.id === cur.id ? '  ✓' : ''), icon: 'book', onClick: () => BS.app.go('#/b/' + b.id) }));
      items.push({ sep: true }, { label: 'All books', icon: 'library', onClick: () => BS.app.go('#/') }, { label: 'Create New Book', icon: 'plus', onClick: () => BS.app.actions.newBook() });
      BS.app.menu(el, items);
    }
  };

  return { render, act };
})();
