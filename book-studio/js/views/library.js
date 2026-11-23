BS.views.library = (function () {
  const u = BS.u, st = BS.store, ic = BS.ic;
  return {
    title: () => 'Your Books',
    render() {
      const books = st.S.books.slice().sort((a, b) => b.updatedAt - a.updatedAt);
      let html = '<div class="page"><header class="page-head"><div><h1>Your Books</h1>' +
        '<p class="lede">Every manuscript you are developing, from first idea to final draft.</p></div>' +
        '<button class="btn btn-primary btn-lg" data-act="newBook">' + ic('plus') + 'Create New Book</button></header>';
      if (!books.length) {
        html += '<div class="empty-lg"><h2>Start your first book</h2><p>Give it a working title. You can change everything later — title, chapters, structure.</p>' +
          '<div class="row" style="justify-content:center"><button class="btn btn-primary btn-lg" data-act="newBook">' + ic('plus') + 'Create New Book</button>' +
          '<button class="btn btn-lg" data-act="importBackup">' + ic('upload') + 'Restore from backup</button></div></div>';
      } else {
        html += '<div class="books">' + books.map((b) => {
          const words = st.bookWords(b);
          return '<a class="card book-card" href="#/b/' + b.id + '"><h2>' + u.esc(b.title) + '</h2>' +
            (b.subtitle ? '<p class="sub">' + u.esc(b.subtitle) + '</p>' : '') +
            (b.description ? '<p class="desc">' + u.esc(b.description) + '</p>' : '') +
            '<div class="meta"><span>' + u.fmt(words) + ' words</span><span>' + b.chapters.length + (b.chapters.length === 1 ? ' chapter' : ' chapters') + '</span><span>Edited ' + u.ago(b.updatedAt) + '</span></div></a>';
        }).join('') + '</div>';
        html += '<p class="muted" style="margin-top:var(--s8);font-size:var(--fs-sm)">Moving to a new computer? <button class="link-btn" data-act="importBackup">Restore from a backup file</button></p>';
      }
      return html + '</div>';
    },
    act: {
      async importBackup() {
        const f = await BS.ui.pickFile('.json,application/json');
        if (!f) return;
        try {
          const data = JSON.parse(await f.text());
          const c = st.validateImport(data);
          const ok = await BS.ui.confirm('Restore backup', 'This file contains ' + c.books + ' book(s). Books with the same identity will be replaced by the backup copy; a safety backup is taken first.', { confirmLabel: 'Restore' });
          if (!ok) return;
          await st.importAll(data);
          BS.ui.toast('Backup restored', { kind: 'success' });
        } catch (e) { BS.ui.toast(e.message || 'Could not read that file.'); }
      }
    }
  };
})();
