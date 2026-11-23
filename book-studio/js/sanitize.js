/* Keeps manuscript HTML to a small, predictable vocabulary:
   blocks  p, h2, h3, blockquote(p…), ul/ol(li…)
   inline  strong, em, mark, br
   attrs   data-pid on top-level blocks only */
BS.sanitize = (function () {
  const PID_RE = /^[a-z0-9]{4,24}$/;
  const DROP = new Set(['SCRIPT', 'STYLE', 'IMG', 'SVG', 'VIDEO', 'AUDIO', 'IFRAME', 'OBJECT', 'EMBED', 'HEAD', 'META', 'LINK', 'TITLE', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'NOSCRIPT', 'TEMPLATE', 'CANVAS']);
  const BLOCK = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'NAV', 'FIGURE', 'FIGCAPTION', 'PRE', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'DL', 'DT', 'DD', 'HR', 'ADDRESS', 'BODY', 'HTML', 'CENTER']);

  function hasBg(el) {
    const bg = el.style && (el.style.backgroundColor || el.style.background);
    return !!bg && !/^(transparent|none|initial|inherit|rgba\(0, 0, 0, 0\))$/i.test(bg.trim());
  }
  function isBold(el) { const w = el.style && el.style.fontWeight; return w === 'bold' || +w >= 600; }
  function isItalic(el) { return el.style && el.style.fontStyle === 'italic'; }

  // Clean inline content of `src` into `dest`.
  function inline(src, dest) {
    for (const n of Array.from(src.childNodes)) {
      if (n.nodeType === 3) { dest.appendChild(document.createTextNode(n.nodeValue.replace(/​/g, ''))); continue; }
      if (n.nodeType !== 1 || DROP.has(n.nodeName)) continue;
      const tag = n.nodeName;
      let wrap = null;
      if (tag === 'BR') { dest.appendChild(document.createElement('br')); continue; }
      if (tag === 'STRONG' || tag === 'B') wrap = 'strong';
      else if (tag === 'EM' || tag === 'I' || tag === 'CITE') wrap = 'em';
      else if (tag === 'MARK') wrap = 'mark';
      else if (tag === 'SPAN' || tag === 'FONT') {
        if (hasBg(n)) wrap = 'mark';
        else if (isBold(n)) wrap = 'strong';
        else if (isItalic(n)) wrap = 'em';
      }
      if (wrap) {
        const w = document.createElement(wrap);
        inline(n, w);
        if (w.childNodes.length) dest.appendChild(w);
      } else {
        if (BLOCK.has(tag) && dest.childNodes.length && dest.lastChild.nodeName !== 'BR') dest.appendChild(document.createTextNode(' '));
        inline(n, dest);
      }
    }
    return dest;
  }

  function hasBlockChild(el) {
    for (const c of el.children) if (BLOCK.has(c.nodeName)) return true;
    return false;
  }

  function finish(el, src) {
    if (src && src.getAttribute) {
      const pid = src.getAttribute('data-pid');
      if (pid && PID_RE.test(pid)) el.setAttribute('data-pid', pid);
    }
    return el;
  }

  function para(tag, src) {
    const p = document.createElement(tag);
    inline(src, p);
    trimEdges(p);
    if (!p.childNodes.length) p.appendChild(document.createElement('br'));
    return finish(p, src);
  }

  function trimEdges(el) {
    // collapse stray leading/trailing whitespace-only text from pasted markup
    const f = el.firstChild, l = el.lastChild;
    if (f && f.nodeType === 3) f.nodeValue = f.nodeValue.replace(/^[\s\n]+/, '');
    if (l && l.nodeType === 3) l.nodeValue = l.nodeValue.replace(/[\s\n]+$/, '');
  }

  // Turn arbitrary children of `container` into a list of clean block elements.
  function blocks(container) {
    const out = [];
    let run = null;
    const flush = () => {
      if (run) {
        trimEdges(run);
        if (run.textContent.trim() || run.querySelector('br')) out.push(run);
        run = null;
      }
    };
    for (const n of Array.from(container.childNodes)) {
      if (n.nodeType === 3) {
        if (!run && !n.nodeValue.trim()) continue;
        run = run || document.createElement('p');
        run.appendChild(document.createTextNode(n.nodeValue));
        continue;
      }
      if (n.nodeType !== 1 || DROP.has(n.nodeName)) continue;
      const tag = n.nodeName;
      if (!BLOCK.has(tag)) {
        run = run || document.createElement('p');
        const tmp = document.createElement('div');
        tmp.appendChild(n.cloneNode(true));
        inline(tmp, run);
        continue;
      }
      flush();
      if (tag === 'HR') continue;
      if (tag === 'H1' || tag === 'H2') out.push(para('h2', n));
      else if (/^H[3-6]$/.test(tag)) out.push(para('h3', n));
      else if (tag === 'BLOCKQUOTE') {
        const bq = finish(document.createElement('blockquote'), n);
        const inner = hasBlockChild(n) ? blocks(n) : [para('p', n)];
        inner.forEach((b) => {
          const p = document.createElement('p');
          if (b.nodeName === 'UL' || b.nodeName === 'OL') {
            b.querySelectorAll('li').forEach((li) => { const q = document.createElement('p'); q.innerHTML = li.innerHTML; bq.appendChild(q); });
            return;
          }
          if (b.nodeName === 'BLOCKQUOTE') { Array.from(b.children).forEach((c) => bq.appendChild(c)); return; }
          p.innerHTML = b.innerHTML;
          bq.appendChild(p);
        });
        if (!bq.children.length) bq.appendChild(para('p', document.createElement('p')));
        out.push(bq);
      } else if (tag === 'UL' || tag === 'OL') {
        out.push(list(n));
      } else if (tag === 'LI') {
        out.push(para('p', n));
      } else if (hasBlockChild(n)) {
        blocks(n).forEach((b) => out.push(b));
      } else {
        out.push(para('p', n));
      }
    }
    flush();
    return out;
  }

  function list(src) {
    const l = finish(document.createElement(src.nodeName.toLowerCase()), src);
    const addItems = (from) => {
      for (const c of Array.from(from.childNodes)) {
        if (c.nodeType === 1 && c.nodeName === 'LI') {
          const li = document.createElement('li');
          // nested lists are flattened into the same list
          const nested = [];
          for (const k of Array.from(c.childNodes)) {
            if (k.nodeType === 1 && (k.nodeName === 'UL' || k.nodeName === 'OL')) nested.push(k);
          }
          const copy = c.cloneNode(true);
          copy.querySelectorAll('ul,ol').forEach((x) => x.remove());
          inline(copy, li);
          trimEdges(li);
          if (!li.childNodes.length) li.appendChild(document.createElement('br'));
          l.appendChild(li);
          nested.forEach(addItems);
        } else if (c.nodeType === 1 && (c.nodeName === 'UL' || c.nodeName === 'OL')) {
          addItems(c);
        } else if ((c.nodeType === 3 && c.nodeValue.trim()) || (c.nodeType === 1 && !DROP.has(c.nodeName))) {
          const li = document.createElement('li');
          const tmp = document.createElement('div');
          tmp.appendChild(c.cloneNode(true));
          inline(tmp, li);
          l.appendChild(li);
        }
      }
    };
    addItems(src);
    if (!l.children.length) l.appendChild(document.createElement('li')).appendChild(document.createElement('br'));
    return l;
  }

  function clean(html, opts) {
    opts = opts || {};
    const t = document.createElement('template');
    t.innerHTML = html || '';
    const bs = blocks(t.content);
    const out = document.createElement('div');
    bs.forEach((b) => {
      if (opts.stripIds) {
        b.removeAttribute('data-pid');
      }
      out.appendChild(b);
    });
    if (!out.children.length) out.innerHTML = '<p><br></p>';
    return out.innerHTML;
  }

  function fromPlainText(text) {
    const t = String(text || '').replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '');
    const paras = /\n[ \t]*\n/.test(t) ? t.split(/\n[ \t]*\n+/) : t.split('\n');
    return paras.map((p) => '<p>' + (BS.u.esc(p.trim()).replace(/\n/g, '<br>') || '<br>') + '</p>').join('');
  }

  return { clean, fromPlainText, PID_RE };
})();
