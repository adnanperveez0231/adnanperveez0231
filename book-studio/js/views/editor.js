/* The writing workspace. Plain contenteditable with a strict vocabulary — no suggestions,
   no autocomplete, no generated text. It only stores what you type. */
BS.views.editor = (function () {
  const u = BS.u, st = BS.store, ic = BS.ic, san = BS.sanitize;
  const BLOCKS = new Set(['P', 'H2', 'H3', 'BLOCKQUOTE', 'UL', 'OL']);
  const pref = (k, d) => { try { const v = localStorage.getItem('bs-ed-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const setPref = (k, v) => { try { localStorage.setItem('bs-ed-' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } };

  let S = null; // per-mount state

  /* ---------- render ---------- */
  function render(ctx) {
    const { book, chapter, section } = ctx;
    const b = '#/b/' + book.id;
    const settings = st.S.settings;
    const panelOpen = pref('panel', innerWidth > 1180) && innerWidth > 820;
    const seq = st.allSections(book);
    const i = seq.findIndex((x) => x.section.id === section.id);
    const prev = seq[i - 1], next = seq[i + 1];
    const tb = (act, icon, label, extra) => '<button class="icon-btn" data-act="' + act + '" aria-label="' + label + '" title="' + label + '"' + (extra || '') + '>' + ic(icon) + '</button>';

    return '<div class="ed-top">' +
      '<nav class="ed-crumb" aria-label="Location"><a href="' + b + '/ch/' + chapter.id + '" title="Chapter details">' + u.esc(chapter.title) + '</a></nav>' +
      '<span class="spacer"></span>' +
      '<span class="ed-counts hide-sm" id="ed-counts"></span><span class="hide-sm">' + BS.app.saveStateHtml() + '</span>' +
      tb('toggleRevision', 'flag', 'Revision mode', ' id="btn-rev" aria-pressed="false"') +
      tb('toggleReading', 'read', 'Reading mode', ' id="btn-read" aria-pressed="false"') +
      tb('toggleFocus', 'focus', 'Distraction-free mode (Esc to exit)', ' class="hide-sm"') +
      tb('typeMenu', 'paragraph', 'Text size and line width') +
      tb('togglePanel', 'panel', 'Comments, notes & versions', ' id="btn-panel" aria-pressed="' + panelOpen + '"') +
      '</div>' +
      '<div class="ed-tools" role="toolbar" aria-label="Formatting">' +
      tb('fmtP', 'paragraph', 'Body text (Ctrl+Alt+0)', ' data-block="p"') +
      tb('fmtH2', 'heading', 'Heading (Ctrl+Alt+1)', ' data-block="h2"') +
      tb('fmtH3', 'subheading', 'Subheading (Ctrl+Alt+2)', ' data-block="h3"') +
      '<span class="sep"></span>' +
      tb('fmtBold', 'bold', 'Bold (Ctrl+B)', ' data-cmd="bold"') +
      tb('fmtItalic', 'italic', 'Italic (Ctrl+I)', ' data-cmd="italic"') +
      '<span class="sep"></span>' +
      tb('fmtQuote', 'quote', 'Quotation', ' data-block="blockquote"') +
      tb('fmtUl', 'listUl', 'Bulleted list', ' data-block="ul"') +
      tb('fmtOl', 'listOl', 'Numbered list', ' data-block="ol"') +
      '<span class="sep"></span>' +
      tb('fmtMark', 'highlight', 'Highlight (Ctrl+Shift+H)', ' data-mark="1"') +
      tb('addComment', 'comment', 'Comment on paragraph (Ctrl+Shift+M)') +
      tb('toggleBookmark', 'bookmark', 'Bookmark paragraph') +
      tb('toggleFlag', 'flag', 'Flag paragraph for revision') +
      '<span class="sep"></span>' +
      tb('quickVersion', 'save', 'Save a version of this section') +
      '</div>' +
      '<div class="ed-body">' +
      '<div class="ed-scroll" id="ed-scroll"><div class="ed-page" id="ed-page" data-measure="' + (settings.measure || 'normal') + '" style="--ed-size:' + (settings.fontSize || 19) + 'px">' +
      '<p class="ed-chapter-label">' + u.esc(chapter.title) + '</p>' +
      '<input class="ed-title" id="ed-title" value="' + u.esc(section.title) + '" aria-label="Section title" maxlength="200">' +
      '<div class="para-tools" id="para-tools">' +
      tb('addComment', 'comment', 'Comment on this paragraph') + tb('toggleBookmark', 'bookmark', 'Bookmark this paragraph') + tb('toggleFlag', 'flag', 'Flag for revision') +
      '</div>' +
      '<div class="prose" id="prose" contenteditable="true" spellcheck="true" autocorrect="off" autocapitalize="sentences" data-gramm="false" data-placeholder="Begin writing…" role="textbox" aria-multiline="true" aria-label="Manuscript text">' + section.html + '</div>' +
      '<div class="margin-marks" id="marks"></div>' +
      '<nav class="row" style="justify-content:space-between;margin-top:var(--s12);font-family:var(--font-ui)">' +
      (prev ? '<a class="btn btn-ghost btn-sm" href="' + b + '/w/' + prev.section.id + '">' + ic('left') + u.esc(u.excerpt(prev.section.title, 30)) + '</a>' : '<span></span>') +
      (next ? '<a class="btn btn-ghost btn-sm" href="' + b + '/w/' + next.section.id + '">' + u.esc(u.excerpt(next.section.title, 30)) + ic('right') + '</a>'
        : '<button class="btn btn-ghost btn-sm" data-act="newSectionAfter">' + ic('plus') + 'New section</button>') +
      '</nav>' +
      '</div></div>' +
      '<aside class="ed-panel" id="ed-panel" aria-label="Writing panel"' + (panelOpen ? '' : ' hidden') + '></aside>' +
      '</div><div class="focus-count" id="focus-count"></div>';
  }

  /* ---------- selection helpers ---------- */
  function saveSel() {
    const s = getSelection();
    if (!s.rangeCount) return null;
    return { an: s.anchorNode, ao: s.anchorOffset, fn: s.focusNode, fo: s.focusOffset };
  }
  function restoreSel(x) {
    if (!x || !x.an || !x.an.isConnected || !x.fn.isConnected) return false;
    try { getSelection().setBaseAndExtent(x.an, Math.min(x.ao, len(x.an)), x.fn, Math.min(x.fo, len(x.fn))); return true; } catch (e) { return false; }
  }
  const len = (n) => n.nodeType === 3 ? n.nodeValue.length : n.childNodes.length;

  function topBlock(node) {
    const ed = S && S.ed;
    if (!ed || !node || !ed.contains(node) || node === ed) return null;
    while (node.parentNode && node.parentNode !== ed) node = node.parentNode;
    return node.parentNode === ed && node.nodeType === 1 ? node : null;
  }
  function currentBlock() {
    const s = getSelection();
    return s.rangeCount ? topBlock(s.anchorNode) : null;
  }
  function inEditor() {
    const s = getSelection();
    return s.rangeCount && S.ed.contains(s.anchorNode);
  }

  /* ---------- live normalisation ---------- */
  const newPid = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  function replaceTag(el, tag) {
    const n = document.createElement(tag);
    for (const a of Array.from(el.attributes)) if (a.name === 'data-pid') n.setAttribute(a.name, a.value);
    while (el.firstChild) n.appendChild(el.firstChild);
    el.replaceWith(n);
    return n;
  }
  function unwrap(el) {
    const p = el.parentNode;
    while (el.firstChild) p.insertBefore(el.firstChild, el);
    el.remove();
  }
  function hasBg(el) {
    const bg = el.style && el.style.backgroundColor;
    return !!bg && !/transparent|rgba\(0, 0, 0, 0\)|initial|inherit/.test(bg);
  }

  function normalize() {
    const ed = S.ed;
    const sel = saveSel();
    let changed = false;
    for (const n of Array.from(ed.childNodes)) {
      if (n.nodeType === 3) {
        if (!n.nodeValue.trim() && !n.nodeValue.includes(' ')) { if (n.previousSibling || n.nextSibling) { n.remove(); changed = true; } continue; }
        const p = document.createElement('p');
        n.replaceWith(p);
        p.appendChild(n);
        changed = true;
      } else if (n.nodeType === 1) {
        const t = n.nodeName;
        if (BLOCKS.has(t)) continue;
        changed = true;
        if (t === 'DIV' || t === 'SECTION' || t === 'ARTICLE') replaceTag(n, 'p');
        else if (t === 'H1') replaceTag(n, 'h2');
        else if (/^H[4-6]$/.test(t)) replaceTag(n, 'h3');
        else if (t === 'BR') { const p = document.createElement('p'); n.replaceWith(p); p.appendChild(n); }
        else { const p = document.createElement('p'); n.replaceWith(p); p.appendChild(n); }
      }
    }
    ed.querySelectorAll('span, font').forEach((sp) => { changed = true; if (hasBg(sp)) replaceTag(sp, 'mark'); else unwrap(sp); });
    ed.querySelectorAll('b').forEach((x) => { changed = true; replaceTag(x, 'strong'); });
    ed.querySelectorAll('i').forEach((x) => { changed = true; replaceTag(x, 'em'); });
    ed.querySelectorAll('mark mark').forEach((x) => { changed = true; unwrap(x); });
    ed.querySelectorAll('[style]').forEach((x) => x.removeAttribute('style'));
    const seen = new Set();
    for (const b of ed.children) {
      const pid = b.getAttribute('data-pid');
      if (!pid || seen.has(pid) || !san.PID_RE.test(pid)) {
        b.setAttribute('data-pid', newPid());
        b.classList.remove('is-bm', 'is-rev', 'has-c', 'is-target');
      }
      seen.add(b.getAttribute('data-pid'));
      b.querySelectorAll('[data-pid]').forEach((x) => x.removeAttribute('data-pid'));
    }
    if (!ed.children.length) { ed.innerHTML = '<p data-pid="' + newPid() + '"><br></p>'; placeCaret(ed.firstChild, false); changed = true; }
    if (changed) restoreSel(sel);
  }

  function placeCaret(el, atEnd) {
    if (!el) return;
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(!atEnd);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }

  /* ---------- counts & save ---------- */
  function textOf() { return S.ed.innerText.replace(/ /g, ' '); }
  function updateCounts() {
    const text = textOf();
    const words = u.countWords(text);
    const chars = text.replace(/\n/g, '').length;
    const s = getSelection();
    let selPart = '';
    if (s.rangeCount && !s.isCollapsed && S.ed.contains(s.anchorNode)) {
      const sw = u.countWords(s.toString());
      if (sw) selPart = u.fmt(sw) + ' of ';
    }
    const today = st.today(S.ctx.book);
    const el = document.getElementById('ed-counts');
    if (el) el.textContent = selPart + u.fmt(words) + ' words · ' + u.fmt(chars) + ' characters · ' + u.fmt(today) + ' today';
    const fc = document.getElementById('focus-count');
    if (fc) fc.textContent = u.fmt(words) + ' words';
    S.ed.classList.toggle('is-empty', !text.trim() && S.ed.children.length <= 1);
  }

  function save() {
    if (!S || !S.dirty) return;
    S.dirty = false;
    const { book, section } = S.ctx;
    const html = san.clean(S.ed.innerHTML);
    const text = textOf();
    const blk = currentBlock();
    st.setSectionContent(book, section, html, u.countWords(text), text.replace(/\n/g, '').length);
    if (blk && book.last) book.last.pid = blk.getAttribute('data-pid');
    if (book.last) book.last.scroll = S.scroller.scrollTop;
    BS.app.renderSidebar();
    try { localStorage.removeItem('bs-pending'); } catch (e) { /* ignore */ }
  }

  function mirror() {
    if (!S || !S.dirty) return;
    try {
      const text = textOf();
      localStorage.setItem('bs-pending', JSON.stringify({ bookId: S.ctx.book.id, sectionId: S.ctx.section.id, html: san.clean(S.ed.innerHTML), words: u.countWords(text), chars: text.replace(/\n/g, '').length, at: Date.now() }));
    } catch (e) { /* quota — ignore */ }
  }

  function onInput(e) {
    if (e && e.isComposing) return;
    normalize();
    if (!S.firstEdit) {
      S.firstEdit = true;
      const sec = S.ctx.section;
      if (sec.words > 0 && (!S.latestVersionAt || u.dayKey(S.latestVersionAt) !== u.dayKey())) {
        st.saveVersion(S.ctx.book, sec, 'Before this session’s edits', true).then(() => { S.latestVersionAt = Date.now(); if (S.tab === 'versions') renderPanel(); });
      }
    }
    S.dirty = true;
    st.S.status = 'saving';
    BS.app.updateSaveState();
    S.saveSoon();
    S.mirrorSoon();
    updateCounts();
    S.decorateSoon();
  }

  /* ---------- decorations: bookmarks, flags, comment markers ---------- */
  function decorate() {
    if (!S) return;
    const sec = S.ctx.section;
    const page = S.page;
    const pr = page.getBoundingClientRect();
    let marks = '';
    for (const b of S.ed.children) {
      const pid = b.getAttribute('data-pid');
      const c = (sec.comments[pid] || []).length, bm = !!sec.bookmarks[pid], fl = !!sec.flags[pid];
      b.classList.toggle('is-bm', bm);
      b.classList.toggle('is-rev', fl);
      b.classList.toggle('has-c', c > 0);
      if (c || bm || fl) {
        const top = b.getBoundingClientRect().top - pr.top;
        marks += '<div class="mm" style="top:' + Math.round(top) + 'px">' +
          (c ? '<button class="mm-c" data-act="openComments" data-pid="' + pid + '" title="' + c + ' comment' + (c > 1 ? 's' : '') + '">' + ic('comment') + '<span class="num">' + c + '</span></button>' : '') +
          (bm ? '<button class="mm-bm" data-act="openMarks" data-pid="' + pid + '" title="Bookmarked">' + ic('bookmark') + '</button>' : '') +
          (fl ? '<button class="mm-rev" data-act="openRevision" data-pid="' + pid + '" title="Flagged for revision">' + ic('flag') + '</button>' : '') +
          '</div>';
      }
    }
    S.marks.innerHTML = marks;
    positionParaTools();
  }

  function positionParaTools() {
    const t = S.paraTools;
    const blk = inEditor() ? currentBlock() : null;
    if (!blk || S.reading) { t.classList.remove('show'); return; }
    const top = blk.getBoundingClientRect().top - S.page.getBoundingClientRect().top;
    t.style.top = Math.round(top - 2) + 'px';
    t.classList.add('show');
    const pid = blk.getAttribute('data-pid');
    const sec = S.ctx.section;
    const btns = t.querySelectorAll('.icon-btn');
    btns[1].classList.toggle('on', !!sec.bookmarks[pid]);
    btns[2].classList.toggle('on', !!sec.flags[pid]);
  }

  function updateToolbar() {
    if (!S || !inEditor()) return;
    const blk = currentBlock();
    const tag = blk ? blk.nodeName.toLowerCase() : 'p';
    const s0 = getSelection();
    document.querySelectorAll('.ed-tools [data-block]').forEach((b) => b.classList.toggle('active', b.dataset.block === tag));
    document.querySelectorAll('.ed-tools [data-cmd]').forEach((b) => {
      let on = false;
      try { on = document.queryCommandState(b.dataset.cmd); } catch (e) { /* ignore */ }
      if (b.dataset.cmd === 'italic' && tag === 'blockquote') on = !!(s0.anchorNode && s0.anchorNode.parentElement && s0.anchorNode.parentElement.closest('em'));
      b.classList.toggle('active', on);
    });
    const s = getSelection();
    const inMark = s.anchorNode && s.anchorNode.parentElement && s.anchorNode.parentElement.closest('mark');
    const mk = document.querySelector('.ed-tools [data-mark]');
    if (mk) mk.classList.toggle('active', !!inMark);
  }

  function scrollToPid(pid) {
    const el = S.ed.querySelector('[data-pid="' + pid + '"]');
    if (!el) { BS.ui.toast('That paragraph no longer exists.'); return; }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.remove('is-target');
    void el.offsetWidth;
    el.classList.add('is-target');
    setTimeout(() => el.classList.remove('is-target'), 1700);
  }

  /* ---------- formatting commands ---------- */
  function exec(cmd, val) {
    S.ed.focus();
    document.execCommand(cmd, false, val);
    onInput();
    updateToolbar();
  }
  // Block formats are applied by hand: the browser's list/quote commands nest lists inside
  // paragraphs and drop paragraph ids, which would detach comments and bookmarks.
  function selectedBlocks() {
    const s = getSelection();
    if (!s.rangeCount || !S.ed.contains(s.anchorNode)) return [];
    const r = s.getRangeAt(0);
    const a = topBlock(r.startContainer) || topBlock(s.anchorNode);
    const b = topBlock(r.endContainer) || a;
    if (!a) return [];
    const out = [];
    for (let n = a; n; n = n.nextElementSibling) { out.push(n); if (n === b) break; }
    return out;
  }
  // Elements whose children are inline content.
  function units(blk) {
    if (blk.nodeName === 'UL' || blk.nodeName === 'OL') return Array.from(blk.children);
    if (blk.nodeName === 'BLOCKQUOTE') {
      const kids = Array.from(blk.children).filter((k) => /^(P|H2|H3)$/.test(k.nodeName));
      return kids.length ? kids : [blk];
    }
    return [blk];
  }
  function moveInto(from, to) {
    while (from.firstChild) to.appendChild(from.firstChild);
    if (!to.childNodes.length) to.appendChild(document.createElement('br'));
    return to;
  }
  function setBlock(tag) {
    if (!inEditor()) { S.ed.focus(); if (S.lastBlockPid) placeCaret(S.ed.querySelector('[data-pid="' + S.lastBlockPid + '"]'), true); }
    const blocks = selectedBlocks();
    if (!blocks.length) return;
    const sel = saveSel();
    const pid = blocks[0].getAttribute('data-pid');
    const T = tag.toUpperCase();
    const all = blocks.every((b) => b.nodeName === T);
    const anchor = blocks[0];
    const made = [];
    if ((T === 'UL' || T === 'OL' || T === 'BLOCKQUOTE') && !all) {
      const wrap = document.createElement(tag);
      blocks.forEach((b) => units(b).forEach((x) => wrap.appendChild(moveInto(x, document.createElement(T === 'BLOCKQUOTE' ? 'p' : 'li')))));
      anchor.parentNode.insertBefore(wrap, anchor);
      made.push(wrap);
    } else {
      // headings / body text, or toggling a list or quote off
      const target = (all && T !== 'P') || T === 'UL' || T === 'OL' || T === 'BLOCKQUOTE' ? 'p' : tag;
      blocks.forEach((b) => units(b).forEach((x) => {
        const el = moveInto(x, document.createElement(target));
        anchor.parentNode.insertBefore(el, anchor);
        made.push(el);
      }));
    }
    blocks.forEach((b) => b.remove());
    if (pid && made[0]) made[0].setAttribute('data-pid', pid); // annotations stay with the passage
    if (!restoreSel(sel)) placeCaret(made[made.length - 1], true);
    onInput();
    updateToolbar();
  }
  function toggleMark() {
    const s = getSelection();
    if (!inEditor()) { BS.ui.toast('Select some text to highlight.'); return; }
    const r = s.getRangeAt(0);
    const marks = Array.from(S.ed.querySelectorAll('mark')).filter((m) => r.intersectsNode(m));
    if (marks.length) {
      const sel = saveSel();
      marks.forEach(unwrap);
      S.ed.normalize();
      restoreSel(sel);
      onInput();
      updateToolbar();
      return;
    }
    if (s.isCollapsed) { BS.ui.toast('Select some text to highlight.'); return; }
    const keep = saveSel();
    if (document.activeElement !== S.ed) { S.ed.focus(); restoreSel(keep); }
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('hiliteColor', false, 'rgb(251, 238, 176)');
    document.execCommand('styleWithCSS', false, false);
    onInput();
    updateToolbar();
  }

  /* ---------- paragraph annotations ---------- */
  function activePid(required) {
    let blk = inEditor() ? currentBlock() : null;
    if (!blk && S.lastBlockPid) blk = S.ed.querySelector('[data-pid="' + S.lastBlockPid + '"]');
    if (!blk) { if (required) BS.ui.toast('Place the cursor in a paragraph first.'); return null; }
    normalize();
    return blk.getAttribute('data-pid');
  }
  const blockExcerpt = (pid) => { const el = S.ed.querySelector('[data-pid="' + pid + '"]'); return el ? u.excerpt(el.textContent, 140) : ''; };
  function annotate(fn) {
    fn(S.ctx.section);
    // annotations are metadata — persist the section without touching the word log
    S.dirty = true;
    save();
    decorate();
    renderPanel();
  }

  function toggleBookmark() {
    const pid = activePid(true);
    if (!pid) return;
    annotate((sec) => {
      if (sec.bookmarks[pid]) { delete sec.bookmarks[pid]; BS.ui.toast('Bookmark removed'); }
      else { sec.bookmarks[pid] = { at: Date.now(), excerpt: blockExcerpt(pid), label: '' }; BS.ui.toast('Passage bookmarked', { kind: 'success' }); }
    });
  }
  function toggleFlag() {
    const pid = activePid(true);
    if (!pid) return;
    let added = false;
    annotate((sec) => {
      if (sec.flags[pid]) delete sec.flags[pid];
      else { sec.flags[pid] = { at: Date.now(), excerpt: blockExcerpt(pid), note: '' }; added = true; }
    });
    if (added) { openPanel('revision'); S.selPid = pid; renderPanel(); focusPanelInput('[data-flag-note="' + pid + '"]'); }
  }
  function addComment() {
    const pid = activePid(true);
    if (!pid) return;
    S.composePid = pid;
    S.selPid = pid;
    openPanel('comments');
    focusPanelInput('#new-comment');
  }
  function focusPanelInput(sel) { setTimeout(() => { const el = document.querySelector(sel); if (el) el.focus(); }, 30); }

  /* ---------- side panel ---------- */
  function openPanel(tab) {
    const p = document.getElementById('ed-panel');
    if (tab) S.tab = tab;
    p.hidden = false;
    setPref('panel', true);
    document.getElementById('btn-panel').setAttribute('aria-pressed', 'true');
    renderPanel();
  }

  async function renderPanel() {
    if (!S) return;
    const p = document.getElementById('ed-panel');
    if (!p || p.hidden) return;
    const { book, chapter, section } = S.ctx;
    const pids = Array.from(S.ed.children).map((b) => b.getAttribute('data-pid'));
    const order = (obj) => Object.keys(obj).sort((a, b) => (pids.indexOf(a) + 1 || 1e9) - (pids.indexOf(b) + 1 || 1e9));
    const ccount = Object.values(section.comments).reduce((n, l) => n + l.length, 0);
    const markCount = Object.keys(section.bookmarks).length + S.ed.querySelectorAll('mark').length;
    const linked = book.notes.filter((n) => n.sectionId === section.id || (n.chapterId === chapter.id && !n.sectionId));
    const tabs = [['comments', 'Comments', ccount], ['marks', 'Marks', markCount], ['revision', 'Revision', Object.keys(section.flags).length], ['notes', 'Notes', linked.length], ['versions', 'Versions', null]];
    let html = '<div class="panel-head"><div class="panel-tabs" role="tablist">' + tabs.map((t) => '<button role="tab" aria-selected="' + (S.tab === t[0]) + '" class="' + (S.tab === t[0] ? 'on' : '') + '" data-act="panelTab" data-tab="' + t[0] + '">' + t[1] + (t[2] ? '<span class="n">' + t[2] + '</span>' : '') + '</button>').join('') +
      '</div><button class="icon-btn" data-act="togglePanel" aria-label="Close panel">' + ic('x') + '</button></div><div class="panel-body">';
    const e = u.esc;
    const quote = (pid, fallback) => {
      const live = pids.includes(pid);
      return '<div class="quote" ' + (live ? 'data-act="gotoPid" data-pid="' + pid + '" title="Go to paragraph"' : 'title="This paragraph was removed or rewritten"') + '>' + e(live ? blockExcerpt(pid) : fallback || '') + '</div>';
    };

    if (S.tab === 'comments') {
      if (S.composePid) {
        html += '<div class="pcard sel">' + quote(S.composePid) + '<textarea id="new-comment" rows="3" placeholder="Your comment on this paragraph"></textarea>' +
          '<div class="row"><button class="btn btn-ghost btn-sm" data-act="cancelComment">Cancel</button><button class="btn btn-primary btn-sm" data-act="saveComment">Add comment</button></div></div>';
      }
      const keys = order(section.comments).filter((k) => section.comments[k].length);
      const live = keys.filter((k) => pids.includes(k)), detached = keys.filter((k) => !pids.includes(k));
      if (!keys.length && !S.composePid) html += '<p class="empty">No comments yet. Place the cursor in a paragraph and choose Comment to attach a note to it.</p>';
      const group = (k) => section.comments[k].map((c, i) => '<div class="pcard' + (S.selPid === k ? ' sel' : '') + '">' + (i === 0 ? quote(k, c.excerpt) : '') +
        '<div class="ctext">' + e(c.text) + '</div><div class="cmeta"><span>' + u.ago(c.at) + '</span><span class="row" style="margin:0">' +
        '<button class="icon-btn" data-act="editComment" data-pid="' + k + '" data-id="' + c.id + '" aria-label="Edit comment">' + ic('edit') + '</button>' +
        '<button class="icon-btn" data-act="delComment" data-pid="' + k + '" data-id="' + c.id + '" aria-label="Delete comment">' + ic('trash') + '</button></span></div></div>').join('');
      html += live.map(group).join('');
      if (detached.length) html += '<h3>Detached from text</h3>' + detached.map(group).join('');
    }

    if (S.tab === 'marks') {
      const bms = order(section.bookmarks);
      html += '<h3>Bookmarked passages</h3>';
      html += bms.length ? bms.map((k) => '<div class="pcard">' + quote(k, section.bookmarks[k].excerpt) + '<div class="cmeta"><span>' + u.ago(section.bookmarks[k].at) + '</span><button class="icon-btn" data-act="delBookmark" data-pid="' + k + '" aria-label="Remove bookmark">' + ic('x') + '</button></div></div>').join('')
        : '<p class="empty">Bookmark a paragraph to find it again quickly.</p>';
      const marks = Array.from(S.ed.querySelectorAll('mark'));
      html += '<h3>Highlights</h3>';
      html += marks.length ? marks.map((m) => { const pid = topBlock(m) && topBlock(m).getAttribute('data-pid'); return '<div class="pcard"><div class="quote" data-act="gotoPid" data-pid="' + pid + '">' + e(u.excerpt(m.textContent, 140)) + '</div></div>'; }).join('')
        : '<p class="empty">Select text and press Highlight to mark it.</p>';
    }

    if (S.tab === 'revision') {
      const fl = order(section.flags);
      html += '<p class="muted" style="font-size:var(--fs-sm);margin-bottom:var(--s3)">' + (S.revision ? 'Revision mode is on: flagged paragraphs stand out; everything else is dimmed.' : 'Turn on revision mode to see flagged paragraphs in context.') + '</p>' +
        '<button class="btn btn-sm" data-act="toggleRevision" style="margin-bottom:var(--s4)">' + ic('flag') + (S.revision ? 'Turn off revision mode' : 'Turn on revision mode') + '</button>';
      html += fl.length ? fl.map((k) => '<div class="pcard' + (S.selPid === k ? ' sel' : '') + '">' + quote(k, section.flags[k].excerpt) +
        '<textarea rows="2" placeholder="What needs to change?" data-input="flagNote" data-flag-note="' + k + '">' + e(section.flags[k].note || '') + '</textarea>' +
        '<div class="row"><button class="btn btn-ghost btn-sm" data-act="resolveFlag" data-pid="' + k + '">' + ic('check') + 'Resolved</button></div></div>').join('')
        : '<p class="empty">No paragraphs flagged. Use the flag button beside a paragraph to mark it for improvement.</p>';
    }

    if (S.tab === 'notes') {
      html += '<div class="pcard"><textarea id="new-note" rows="3" placeholder="A thought, a fact, a reference for this section"></textarea><div class="row"><button class="btn btn-sm" data-act="addLinkedNote">Save note</button></div></div>';
      html += linked.length ? linked.map((n) => '<div class="pcard"><div class="ctext"><strong>' + e(n.title || BS.views.notes.typeLabel(n.type)) + '</strong></div>' +
        (n.body ? '<div class="ctext" style="color:var(--text-2);margin-top:2px">' + e(u.excerpt(n.body, 220)) + '</div>' : '') +
        (n.url ? '<div class="ctext" style="margin-top:4px"><a href="' + e(n.url) + '" target="_blank" rel="noopener noreferrer">' + e(u.excerpt(n.url, 48)) + '</a></div>' : '') +
        '<div class="cmeta"><span>' + BS.views.notes.typeLabel(n.type) + (n.sectionId ? '' : ' · chapter') + '</span><a href="#/b/' + book.id + '/notes?n=' + n.id + '">Open</a></div></div>').join('')
        : '<p class="empty">No notes linked to this section yet.</p>';
    }

    if (S.tab === 'versions') {
      html += '<div class="pcard"><input id="ver-label" placeholder="Name this version (optional)" aria-label="Version name"><div class="row"><button class="btn btn-sm btn-primary" data-act="saveVersion">' + ic('save') + 'Save version</button></div></div>' +
        '<h3>History</h3><div id="ver-list"><p class="empty"><span class="spinner" aria-hidden="true"></span></p></div>';
    }
    html += '</div>';
    p.innerHTML = html;
    if (S.tab === 'versions') {
      const list = await st.versions(section.id);
      S.latestVersionAt = list[0] ? list[0].at : null;
      const el = document.getElementById('ver-list');
      if (!el) return;
      el.innerHTML = list.length ? list.map((v) => '<div class="pcard"><div class="ctext"><strong>' + e(v.label || (v.auto ? 'Automatic version' : 'Saved version')) + '</strong></div>' +
        '<div class="cmeta"><span>' + u.fmtDateTime(v.at) + ' · ' + u.fmt(v.words) + ' words</span></div>' +
        '<div class="row"><button class="btn btn-ghost btn-sm" data-act="compareVersion" data-id="' + v.id + '">' + ic('compare') + 'Compare</button><button class="btn btn-ghost btn-sm" data-act="restoreVersion" data-id="' + v.id + '">' + ic('restore') + 'Restore</button>' +
        '<button class="icon-btn" data-act="deleteVersion" data-id="' + v.id + '" aria-label="Delete version">' + ic('trash') + '</button></div></div>').join('')
        : '<p class="empty">No versions yet. A version is saved automatically before the first edit of each day, and whenever you choose Save version.</p>';
      S.versionList = list;
    }
  }

  /* ---------- compare ---------- */
  async function compare(versionId) {
    save();
    const list = await st.versions(S.ctx.section.id);
    const current = { id: 'current', label: 'Current text', html: S.ctx.section.html, at: Date.now() };
    const all = [current].concat(list);
    const opt = (sel) => all.map((v) => '<option value="' + v.id + '"' + (v.id === sel ? ' selected' : '') + '>' + u.esc((v.id === 'current' ? 'Current text' : (v.label || (v.auto ? 'Automatic' : 'Saved version')) + ' — ' + u.fmtDateTime(v.at))) + '</option>').join('');
    BS.ui.modal({
      title: 'Compare drafts — ' + S.ctx.section.title,
      full: true,
      body: '<div class="diff-head"><label class="field"><span class="field-label">Earlier</span><select id="cmp-a">' + opt(versionId) + '</select></label>' +
        '<label class="field"><span class="field-label">Later</span><select id="cmp-b">' + opt('current') + '</select></label>' +
        '<label class="check-label" style="height:36px"><input type="checkbox" id="cmp-collapse" checked> Hide unchanged paragraphs</label></div>' +
        '<div class="diff-stats" id="cmp-stats"></div><div class="diff" id="cmp-out"></div>',
      mount(m) {
        const run = () => {
          const a = all.find((v) => v.id === m.querySelector('#cmp-a').value);
          const b = all.find((v) => v.id === m.querySelector('#cmp-b').value);
          const res = BS.diff.paragraphs(u.blockTexts(a.html), u.blockTexts(b.html));
          const s = BS.diff.stats(res);
          m.querySelector('#cmp-stats').innerHTML = '<span class="a">+' + u.fmt(s.added) + ' words added</span><span class="r">−' + u.fmt(s.removed) + ' words removed</span>';
          m.querySelector('#cmp-out').innerHTML = BS.diff.render(res, { collapse: m.querySelector('#cmp-collapse').checked });
        };
        m.querySelectorAll('select, input').forEach((x) => x.addEventListener('change', run));
        run();
      }
    });
  }

  /* ---------- mount / unmount ---------- */
  function mount(root, ctx) {
    const ed = root.querySelector('#prose');
    S = {
      ctx, ed, dirty: false, firstEdit: false, latestVersionAt: null,
      tab: pref('tab', 'comments'), revision: false, reading: false,
      page: root.querySelector('#ed-page'), scroller: root.querySelector('#ed-scroll'),
      marks: root.querySelector('#marks'), paraTools: root.querySelector('#para-tools'),
      saveSoon: u.debounce(save, 900), mirrorSoon: u.debounce(mirror, 250), decorateSoon: u.debounce(decorate, 200)
    };
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); document.execCommand('styleWithCSS', false, false); } catch (e) { /* ignore */ }
    normalize();
    updateCounts();
    st.versions(ctx.section.id).then((l) => { if (S && S.ctx === ctx) S.latestVersionAt = l[0] ? l[0].at : null; });

    ed.addEventListener('input', onInput);
    ed.addEventListener('compositionend', onInput);
    ed.addEventListener('paste', (e) => {
      e.preventDefault();
      const cd = e.clipboardData;
      const htmlData = cd.getData('text/html');
      let html = htmlData ? san.clean(htmlData, { stripIds: true }) : san.fromPlainText(cd.getData('text/plain'));
      const t = document.createElement('template');
      t.innerHTML = html;
      if (t.content.children.length === 1 && t.content.firstElementChild.nodeName === 'P') html = t.content.firstElementChild.innerHTML;
      document.execCommand('insertHTML', false, html);
      onInput();
    });
    ed.addEventListener('drop', (e) => {
      // keep dropped content in the same clean vocabulary
      const txt = e.dataTransfer && e.dataTransfer.getData('text/plain');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); return; }
      if (txt && !e.dataTransfer.getData('text/html')) return;
      setTimeout(onInput, 0);
    });
    ed.addEventListener('keydown', (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.altKey && ['0', '1', '2'].includes(e.key)) { e.preventDefault(); setBlock({ 0: 'p', 1: 'h2', 2: 'h3' }[e.key]); }
      else if (mod && e.shiftKey && e.key.toLowerCase() === 'h') { e.preventDefault(); toggleMark(); }
      else if (mod && e.shiftKey && e.key.toLowerCase() === 'm') { e.preventDefault(); addComment(); }
      else if (mod && !e.shiftKey && e.key.toLowerCase() === 'u') { e.preventDefault(); } // no underline in manuscripts
      else if (e.key === 'Tab' && !mod) {
        const blk = currentBlock();
        if (blk && (blk.nodeName === 'UL' || blk.nodeName === 'OL')) e.preventDefault();
      }
    });
    ed.addEventListener('focus', () => positionParaTools());
    S.onSel = () => {
      if (!S) return;
      if (inEditor()) {
        const blk = currentBlock();
        if (blk) S.lastBlockPid = blk.getAttribute('data-pid');
        updateToolbar();
        positionParaTools();
        updateCounts();
      }
    };
    document.addEventListener('selectionchange', S.onSel);
    S.onResize = u.debounce(decorate, 120);
    window.addEventListener('resize', S.onResize);
    S.onKey = (e) => {
      if (e.key === 'Escape' && document.body.classList.contains('focus-mode') && !document.querySelector('.modal-wrap')) exitFocus();
    };
    document.addEventListener('keydown', S.onKey);
    S.onFs = () => { if (!document.fullscreenElement && document.body.classList.contains('focus-mode') && S.fsEntered) exitFocus(); };
    document.addEventListener('fullscreenchange', S.onFs);

    // keep toolbar clicks from stealing the caret
    root.querySelectorAll('.ed-tools, #para-tools').forEach((el) => el.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); }));

    const title = root.querySelector('#ed-title');
    const saveTitle = u.debounce(() => { const v = title.value.trim() || 'Untitled section'; st.updateSection(ctx.book, ctx.section, { title: v }, true); BS.app.renderSidebar(); }, 500);
    title.addEventListener('input', saveTitle);
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter' || (e.key === 'ArrowDown')) { e.preventDefault(); ed.focus(); placeCaret(ed.firstElementChild, false); } });
    title.addEventListener('blur', () => saveTitle.flush());
    S.saveTitle = saveTitle;

    // resume where you left off
    const last = ctx.book.last;
    ctx.book.last = Object.assign({}, last && last.sectionId === ctx.section.id ? last : {}, { sectionId: ctx.section.id, at: Date.now() });
    st.touch(ctx.book, { silent: true });
    requestAnimationFrame(() => {
      decorate();
      renderPanel();
      if (ctx.query && ctx.query.p) { scrollToPid(ctx.query.p); return; }
      const target = last && last.sectionId === ctx.section.id && last.pid ? ed.querySelector('[data-pid="' + last.pid + '"]') : null;
      if (last && last.sectionId === ctx.section.id && last.scroll) S.scroller.scrollTop = last.scroll;
      if (!ctx.section.words && /^untitled/i.test(ctx.section.title)) { title.focus(); title.select(); return; }
      ed.focus({ preventScroll: true });
      placeCaret(target || ed.lastElementChild, true);
      if (target && !last.scroll) target.scrollIntoView({ block: 'center' });
    });
    S.scroller.addEventListener('scroll', u.debounce(() => { if (S && ctx.book.last) ctx.book.last.scroll = S.scroller.scrollTop; }, 300), { passive: true });
  }

  function unmount() {
    if (!S) return;
    S.saveSoon.cancel();
    S.mirrorSoon.cancel();
    S.saveTitle.flush();
    save();
    document.removeEventListener('selectionchange', S.onSel);
    window.removeEventListener('resize', S.onResize);
    document.removeEventListener('keydown', S.onKey);
    document.removeEventListener('fullscreenchange', S.onFs);
    exitFocus(true);
    document.querySelector('.main').classList.remove('reading');
    S = null;
    return st.flush();
  }

  function forceSave(sync) {
    if (!S) return;
    if (sync) mirror();
    S.saveSoon.cancel();
    save();
  }

  function exitFocus(silent) {
    document.body.classList.remove('focus-mode');
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    if (S) { S.fsEntered = false; setTimeout(() => S && decorate(), 50); }
  }

  /* ---------- actions ---------- */
  const act = {
    fmtP: () => setBlock('p'),
    fmtH2: () => setBlock('h2'),
    fmtH3: () => setBlock('h3'),
    fmtQuote: () => setBlock('blockquote'),
    fmtUl: () => setBlock('ul'),
    fmtOl: () => setBlock('ol'),
    fmtBold: () => exec('bold'),
    fmtItalic: () => exec('italic'),
    fmtMark: () => toggleMark(),
    addComment: () => addComment(),
    toggleBookmark: () => toggleBookmark(),
    toggleFlag: () => toggleFlag(),
    quickVersion() {
      save();
      st.saveVersion(S.ctx.book, S.ctx.section, '', false).then(() => {
        BS.ui.toast('Version saved', { kind: 'success' });
        S.latestVersionAt = Date.now();
        if (S.tab === 'versions') renderPanel();
      });
    },
    togglePanel() {
      const p = document.getElementById('ed-panel');
      p.hidden = !p.hidden;
      setPref('panel', !p.hidden);
      document.getElementById('btn-panel').setAttribute('aria-pressed', String(!p.hidden));
      if (!p.hidden) renderPanel();
      setTimeout(decorate, 30);
    },
    panelTab(el) { S.tab = el.dataset.tab; setPref('tab', S.tab); S.composePid = S.tab === 'comments' ? S.composePid : null; renderPanel(); },
    toggleRevision() {
      S.revision = !S.revision;
      S.page.classList.toggle('revision-on', S.revision);
      document.getElementById('btn-rev').classList.toggle('on', S.revision);
      document.getElementById('btn-rev').setAttribute('aria-pressed', String(S.revision));
      if (S.revision) openPanel('revision'); else renderPanel();
      BS.ui.toast(S.revision ? 'Revision mode on — flag paragraphs that need work' : 'Revision mode off');
    },
    toggleReading() {
      save();
      S.reading = !S.reading;
      const main = document.querySelector('.main');
      main.classList.toggle('reading', S.reading);
      S.ed.contentEditable = S.reading ? 'false' : 'true';
      document.getElementById('btn-read').classList.toggle('on', S.reading);
      document.getElementById('btn-read').setAttribute('aria-pressed', String(S.reading));
      if (S.reading) { document.getElementById('ed-panel').hidden = true; } else if (pref('panel', false)) { document.getElementById('ed-panel').hidden = false; renderPanel(); }
      positionParaTools();
      setTimeout(decorate, 30);
    },
    toggleFocus() {
      if (document.body.classList.contains('focus-mode')) { exitFocus(); return; }
      document.body.classList.add('focus-mode');
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().then(() => { if (S) S.fsEntered = true; }).catch(() => {});
      S.ed.focus();
      setTimeout(decorate, 60);
      BS.ui.toast('Distraction-free mode — press Esc to return', { duration: 2200 });
    },
    typeMenu(el) {
      const s = st.S.settings;
      const set = (patch) => { st.saveSettings(patch); S.page.style.setProperty('--ed-size', st.S.settings.fontSize + 'px'); S.page.dataset.measure = st.S.settings.measure; setTimeout(decorate, 30); };
      BS.app.menu(el, [
        { header: 'Text size' },
        { label: 'Small' + (s.fontSize === 17 ? '  ✓' : ''), onClick: () => set({ fontSize: 17 }) },
        { label: 'Medium' + (s.fontSize === 19 ? '  ✓' : ''), onClick: () => set({ fontSize: 19 }) },
        { label: 'Large' + (s.fontSize === 22 ? '  ✓' : ''), onClick: () => set({ fontSize: 22 }) },
        { sep: true }, { header: 'Line width' },
        { label: 'Narrow' + (s.measure === 'narrow' ? '  ✓' : ''), onClick: () => set({ measure: 'narrow' }) },
        { label: 'Comfortable' + (s.measure === 'normal' ? '  ✓' : ''), onClick: () => set({ measure: 'normal' }) },
        { label: 'Wide' + (s.measure === 'wide' ? '  ✓' : ''), onClick: () => set({ measure: 'wide' }) }
      ]);
    },
    openComments(el) { S.selPid = el.dataset.pid; openPanel('comments'); scrollToPid(el.dataset.pid); },
    openMarks(el) { S.selPid = el.dataset.pid; openPanel('marks'); },
    openRevision(el) { S.selPid = el.dataset.pid; openPanel('revision'); },
    gotoPid(el) { scrollToPid(el.dataset.pid); },
    cancelComment() { S.composePid = null; renderPanel(); },
    saveComment() {
      const t = document.getElementById('new-comment');
      const text = t.value.trim();
      if (!text) { t.focus(); return; }
      const pid = S.composePid;
      annotate((sec) => { (sec.comments[pid] = sec.comments[pid] || []).push({ id: u.uid(), text, at: Date.now(), excerpt: blockExcerpt(pid) }); });
      S.composePid = null;
      renderPanel();
      BS.ui.toast('Comment added', { kind: 'success' });
    },
    async editComment(el) {
      const list = S.ctx.section.comments[el.dataset.pid];
      const c = list.find((x) => x.id === el.dataset.id);
      const d = await BS.ui.form('Edit comment', [{ name: 'text', label: 'Comment', type: 'textarea', rows: 4, value: c.text, required: true }], 'Save');
      if (!d) return;
      annotate(() => { c.text = d.text.trim(); });
    },
    delComment(el) {
      annotate((sec) => {
        sec.comments[el.dataset.pid] = sec.comments[el.dataset.pid].filter((x) => x.id !== el.dataset.id);
        if (!sec.comments[el.dataset.pid].length) delete sec.comments[el.dataset.pid];
      });
    },
    delBookmark(el) { annotate((sec) => { delete sec.bookmarks[el.dataset.pid]; }); },
    resolveFlag(el) { annotate((sec) => { delete sec.flags[el.dataset.pid]; }); BS.ui.toast('Marked as revised', { kind: 'success' }); },
    flagNote(el) {
      const f = S.ctx.section.flags[el.dataset.flagNote];
      if (!f) return;
      f.note = el.value;
      st.updateSection(S.ctx.book, S.ctx.section, {}, true);
    },
    addLinkedNote() {
      const t = document.getElementById('new-note');
      const body = t.value.trim();
      if (!body) { t.focus(); return; }
      st.addNote(S.ctx.book, { body, type: 'idea', chapterId: S.ctx.chapter.id, sectionId: S.ctx.section.id });
      BS.ui.toast('Note saved', { kind: 'success' });
    },
    saveVersion() {
      save();
      const label = document.getElementById('ver-label').value.trim();
      st.saveVersion(S.ctx.book, S.ctx.section, label, false).then(() => { BS.ui.toast('Version saved', { kind: 'success' }); renderPanel(); });
    },
    compareVersion(el) { compare(el.dataset.id); },
    async restoreVersion(el) {
      const v = (S.versionList || []).find((x) => x.id === el.dataset.id);
      if (!v) return;
      const ok = await BS.ui.confirm('Restore this version?', 'The current text will be saved as a version first, so you can always come back to it.', { confirmLabel: 'Restore version' });
      if (!ok) return;
      save();
      await st.saveVersion(S.ctx.book, S.ctx.section, 'Before restoring an earlier version', false);
      S.ed.innerHTML = v.html;
      S.dirty = true;
      normalize();
      save();
      updateCounts();
      decorate();
      renderPanel();
      BS.ui.toast('Version restored', { kind: 'success' });
    },
    async deleteVersion(el) {
      if (!(await BS.ui.confirm('Delete version?', 'This saved version will be removed permanently.', { confirmLabel: 'Delete', danger: true }))) return;
      await st.deleteVersion(el.dataset.id);
      renderPanel();
    },
    newSectionAfter() {
      save();
      const s = st.addSection(S.ctx.book, S.ctx.chapter.id, { after: S.ctx.section.id });
      BS.app.go('#/b/' + S.ctx.book.id + '/w/' + s.id);
    }
  };

  return {
    layout: 'editor',
    title: (ctx) => ctx.section.title,
    render, mount, unmount, forceSave, act,
    onChange() { if (!S) return; BS.app.renderSidebar(); renderPanel(); }
  };
})();
