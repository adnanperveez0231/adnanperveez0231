/* Manuscript assembly and export (DOCX, PDF via print, HTML, JSON backup). */
BS.exporter = (function () {
  const u = BS.u;

  function manuscript(book, opts) {
    opts = opts || {};
    const chapters = opts.chapterIds ? book.chapters.filter((c) => opts.chapterIds.includes(c.id)) : book.chapters;
    const items = [];
    chapters.forEach((c) => {
      items.push({ kind: 'chapter', title: c.title });
      c.sections.forEach((s, i) => {
        const showTitle = opts.sectionTitles && !(c.sections.length === 1 && /^untitled section$/i.test(s.title));
        if (showTitle) items.push({ kind: 'section', title: s.title, level: s.level });
        else if (i > 0) items.push({ kind: 'html', html: '<p>* * *</p>' });
        items.push({ kind: 'html', html: s.html });
      });
    });
    return {
      title: book.title, subtitle: book.subtitle, author: book.author,
      titlePage: opts.titlePage !== false && !opts.chapterIds, items
    };
  }

  function fileBase(book, chapterTitle) {
    return u.slug(book.title) + (chapterTitle ? '-' + u.slug(chapterTitle) : '');
  }

  function docx(book, opts) {
    const ms = manuscript(book, opts);
    const blob = BS.docx.build(ms, { preset: opts.preset, page: opts.page, highlights: opts.highlights });
    const one = opts.chapterIds && opts.chapterIds.length === 1 ? BS.store.chapter(book, opts.chapterIds[0]) : null;
    u.download(fileBase(book, one && one.title) + '.docx', blob);
  }

  function printCss(opts) {
    const manuscript = opts.preset === 'manuscript';
    const font = manuscript ? '"Times New Roman", Times, serif' : 'Georgia, "Iowan Old Style", "Palatino Linotype", serif';
    return '@page{size:' + (opts.page === 'Letter' ? 'letter' : 'A4') + ';margin:25mm 22mm;@bottom-center{content:counter(page);font:10pt ' + font + ';color:#444}}' +
      '@page:first{@bottom-center{content:none}}' +
      'html{-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      'body{font:' + (manuscript ? '12pt/2' : '11.5pt/1.5') + ' ' + font + ';color:#111;margin:0;font-variant-numeric:oldstyle-nums}' +
      '.title-page{height:240mm;display:flex;flex-direction:column;justify-content:center;text-align:center;break-after:page}' +
      '.title-page h1{font-size:30pt;font-weight:normal;margin:0 0 8mm;text-wrap:balance}.title-page .sub{font-size:15pt;font-style:italic;margin:0 0 14mm}.title-page .by{font-size:13pt}' +
      'h1.ch{font-size:20pt;font-weight:normal;text-align:center;margin:30mm 0 14mm;break-before:page;text-wrap:balance}' +
      'section.first h1.ch{break-before:auto}' +
      'h2.sec{font-size:14pt;margin:9mm 0 4mm;break-after:avoid}h3.sec{font-size:12.5pt;margin:7mm 0 3mm;break-after:avoid}' +
      '.body h2{font-size:12.5pt;margin:6mm 0 3mm;break-after:avoid}.body h3{font-size:12pt;font-style:italic;margin:5mm 0 2mm;break-after:avoid}' +
      '.body p{margin:0;text-indent:' + (manuscript ? '12.7mm' : '6mm') + ';' + (manuscript ? '' : 'text-align:justify;hyphens:auto;') + 'orphans:2;widows:2}' +
      '.body h2+p,.body h3+p,h2.sec+.body p:first-child,h3.sec+.body p:first-child,h1.ch+.body p:first-child,.body p:first-child,.body blockquote+p,.body ul+p,.body ol+p,.body .scene+p{text-indent:0}' +
      '.body blockquote{margin:4mm 12mm;font-style:italic}.body blockquote p{text-indent:0;margin:0 0 2mm}' +
      '.body ul,.body ol{margin:3mm 0 3mm 8mm;padding-left:5mm}.body li{margin:0 0 1mm}' +
      '.body .scene{text-align:center;text-indent:0;margin:5mm 0}' +
      'mark{' + (opts.highlights ? 'background:#fff0a0' : 'background:none;color:inherit') + '}';
  }

  function bodyHtml(html) {
    const t = document.createElement('template');
    t.innerHTML = html;
    t.content.querySelectorAll('p').forEach((p) => {
      if (/^(\*\s*){1,3}$|^#$/.test(p.textContent.trim())) p.className = 'scene';
      if (!p.textContent.trim() && !p.closest('blockquote')) p.remove();
    });
    t.content.querySelectorAll('[data-pid]').forEach((el) => el.removeAttribute('data-pid'));
    const d = document.createElement('div');
    d.appendChild(t.content.cloneNode(true));
    return d.innerHTML;
  }

  function printableHtml(book, opts) {
    const ms = manuscript(book, opts);
    const e = u.esc;
    let html = '';
    if (ms.titlePage) html += '<div class="title-page"><h1>' + e(ms.title) + '</h1>' + (ms.subtitle ? '<p class="sub">' + e(ms.subtitle) + '</p>' : '') + (ms.author ? '<p class="by">' + e(ms.author) + '</p>' : '') + '</div>';
    let first = true, open = false;
    ms.items.forEach((it) => {
      if (it.kind === 'chapter') {
        if (open) html += '</section>';
        html += '<section class="' + (first && !ms.titlePage ? 'first' : '') + '"><h1 class="ch">' + e(it.title) + '</h1>';
        open = true; first = false;
      } else if (it.kind === 'section') html += it.level === 2 ? '<h3 class="sec">' + e(it.title) + '</h3>' : '<h2 class="sec">' + e(it.title) + '</h2>';
      else html += '<div class="body">' + bodyHtml(it.html) + '</div>';
    });
    if (open) html += '</section>';
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' + e(book.title) + '</title><style>' + printCss(opts) + '</style></head><body>' + html + '</body></html>';
  }

  function pdf(book, opts) {
    return new Promise((resolve) => {
      const frame = document.createElement('iframe');
      frame.className = 'print-frame';
      frame.setAttribute('aria-hidden', 'true');
      document.body.appendChild(frame);
      const doc = frame.contentDocument;
      doc.open();
      doc.write(printableHtml(book, opts));
      doc.close();
      const go = () => {
        frame.contentWindow.focus();
        frame.contentWindow.print();
        setTimeout(() => { frame.remove(); resolve(); }, 1500);
      };
      if (doc.readyState === 'complete') setTimeout(go, 120); else frame.onload = () => setTimeout(go, 120);
    });
  }

  function html(book, opts) {
    const one = opts.chapterIds && opts.chapterIds.length === 1 ? BS.store.chapter(book, opts.chapterIds[0]) : null;
    u.download(fileBase(book, one && one.title) + '.html', printableHtml(book, opts), 'text/html');
  }

  async function backupFile() {
    const data = await BS.store.exportAll();
    u.download('book-studio-backup-' + u.dayKey() + '.json', JSON.stringify(data), 'application/json');
  }

  return { manuscript, docx, pdf, html, printableHtml, backupFile };
})();
