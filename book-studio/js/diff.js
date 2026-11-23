/* Draft comparison: paragraph-level LCS, then word-level LCS inside changed paragraphs. */
BS.diff = (function () {
  function lcs(a, b, eq) {
    const n = a.length, m = b.length;
    // DP over suffixes; Uint16/32 rows keep memory reasonable
    const T = new Array(n + 1);
    for (let i = 0; i <= n; i++) T[i] = new Uint32Array(m + 1);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        T[i][j] = eq(a[i], b[j]) ? T[i + 1][j + 1] + 1 : Math.max(T[i + 1][j], T[i][j + 1]);
      }
    }
    const ops = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (eq(a[i], b[j])) { ops.push(['=', a[i], b[j]]); i++; j++; }
      else if (T[i + 1][j] >= T[i][j + 1]) { ops.push(['-', a[i]]); i++; }
      else { ops.push(['+', b[j]]); j++; }
    }
    while (i < n) ops.push(['-', a[i++]]);
    while (j < m) ops.push(['+', b[j++]]);
    return ops;
  }

  const tok = (s) => s.match(/\s+|[^\s]+/g) || [];
  const norm = (s) => s.replace(/\s+/g, ' ').trim();

  function words(a, b) {
    const A = tok(a), B = tok(b);
    if (A.length * B.length > 4e6) return [['-', a], ['+', b]];
    const ops = lcs(A, B, (x, y) => x === y);
    // merge runs
    const out = [];
    for (const o of ops) {
      const t = o[0], v = o[0] === '=' ? o[1] : o[1];
      const last = out[out.length - 1];
      if (last && last[0] === t) last[1] += v; else out.push([t, v]);
    }
    return out;
  }

  // Returns [{type:'same'|'add'|'del'|'change', text?, parts?}]
  function paragraphs(oldParas, newParas) {
    const A = oldParas.map(norm).filter(Boolean), B = newParas.map(norm).filter(Boolean);
    if (A.length * B.length > 4e6) return [{ type: 'del', text: A.join('\n\n') }, { type: 'add', text: B.join('\n\n') }];
    const ops = lcs(A, B, (x, y) => x === y);
    const out = [];
    let dels = [], adds = [];
    const flush = () => {
      const k = Math.min(dels.length, adds.length);
      for (let i = 0; i < k; i++) out.push({ type: 'change', parts: words(dels[i], adds[i]) });
      dels.slice(k).forEach((t) => out.push({ type: 'del', text: t }));
      adds.slice(k).forEach((t) => out.push({ type: 'add', text: t }));
      dels = []; adds = [];
    };
    for (const o of ops) {
      if (o[0] === '=') { flush(); out.push({ type: 'same', text: o[1] }); }
      else if (o[0] === '-') dels.push(o[1]);
      else adds.push(o[1]);
    }
    flush();
    return out;
  }

  function stats(result) {
    let added = 0, removed = 0;
    for (const r of result) {
      if (r.type === 'add') added += BS.u.countWords(r.text);
      else if (r.type === 'del') removed += BS.u.countWords(r.text);
      else if (r.type === 'change') r.parts.forEach((p) => {
        if (p[0] === '+') added += BS.u.countWords(p[1]);
        if (p[0] === '-') removed += BS.u.countWords(p[1]);
      });
    }
    return { added, removed };
  }

  function render(result, opts) {
    opts = opts || {};
    const e = BS.u.esc;
    let html = '';
    let hidden = 0;
    const flushHidden = () => {
      if (hidden) html += '<p class="diff-skip">' + hidden + ' unchanged paragraph' + (hidden === 1 ? '' : 's') + '</p>';
      hidden = 0;
    };
    result.forEach((r, i) => {
      if (r.type === 'same') {
        const near = (result[i - 1] && result[i - 1].type !== 'same') || (result[i + 1] && result[i + 1].type !== 'same');
        if (opts.collapse && !near) { hidden++; return; }
        flushHidden();
        html += '<p class="diff-same">' + e(r.text) + '</p>';
        return;
      }
      flushHidden();
      if (r.type === 'add') html += '<p class="diff-add"><ins>' + e(r.text) + '</ins></p>';
      else if (r.type === 'del') html += '<p class="diff-del"><del>' + e(r.text) + '</del></p>';
      else html += '<p class="diff-change">' + r.parts.map((p) => p[0] === '=' ? e(p[1]) : p[0] === '+' ? '<ins>' + e(p[1]) + '</ins>' : '<del>' + e(p[1]) + '</del>').join('') + '</p>';
    });
    flushHidden();
    return html || '<p class="diff-skip">No differences.</p>';
  }

  return { paragraphs, stats, render };
})();
