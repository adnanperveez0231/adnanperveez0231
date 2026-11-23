/* Small shared helpers. No network, no AI — everything runs locally. */
window.BS = window.BS || {};
BS.views = {};

BS.u = (function () {
  const pad = (n) => String(n).padStart(2, '0');

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu;
  function countWords(text) {
    const m = String(text || '').match(WORD_RE);
    return m ? m.length : 0;
  }

  // Plain text from stored HTML; paragraphs separated by blank lines.
  function htmlToText(html) {
    const t = document.createElement('template');
    t.innerHTML = html || '';
    const parts = [];
    const walk = (el) => {
      for (const n of el.childNodes) {
        if (n.nodeType === 3) continue;
        if (/^(P|H2|H3|LI)$/.test(n.nodeName)) parts.push(n.textContent);
        else if (/^(UL|OL|BLOCKQUOTE)$/.test(n.nodeName)) walk(n);
      }
    };
    walk(t.content);
    if (!parts.length) parts.push(t.content.textContent || '');
    return parts.join('\n\n');
  }

  function blockTexts(html) {
    return htmlToText(html).split('\n\n');
  }

  function dayKey(d) {
    d = d ? new Date(d) : new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function parseDay(k) {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }
  function startOfWeek(d) { // Monday
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = (x.getDay() + 6) % 7;
    return addDays(x, -day);
  }

  const nf = new Intl.NumberFormat();
  const fmt = (n) => nf.format(Math.round(n || 0));

  function ago(ts) {
    if (!ts) return 'never';
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 45) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago');
    const h = Math.round(m / 60);
    if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
    const d = Math.round(h / 24);
    if (d < 7) return d === 1 ? 'yesterday' : d + ' days ago';
    return fmtDate(ts);
  }

  const fmtDate = (ts) => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtDateTime = (ts) => new Date(ts).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  function debounce(fn, ms) {
    let t = null, lastArgs = null;
    const d = (...args) => {
      lastArgs = args;
      clearTimeout(t);
      t = setTimeout(() => { t = null; fn(...lastArgs); }, ms);
    };
    d.flush = () => { if (t) { clearTimeout(t); t = null; fn(...lastArgs); } };
    d.cancel = () => { clearTimeout(t); t = null; };
    d.pending = () => !!t;
    return d;
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function download(filename, data, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function slug(s) {
    return String(s || 'untitled').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'untitled';
  }

  function pct(a, b) { return b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0; }

  function excerpt(text, n) {
    text = String(text || '').replace(/\s+/g, ' ').trim();
    return text.length > n ? text.slice(0, n).replace(/\s+\S*$/, '') + '…' : text;
  }

  return { uid, esc, countWords, htmlToText, blockTexts, dayKey, parseDay, addDays, startOfWeek, fmt, ago, fmtDate, fmtDateTime, debounce, clone, download, slug, pct, excerpt };
})();
