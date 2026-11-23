/* Goals, streaks, calendar and history. */
BS.views.progress = (function () {
  const u = BS.u, st = BS.store, ic = BS.ic;
  const V = { month: null, range: 'daily' };

  function ring(value, goal) {
    const r = 27, c = 2 * Math.PI * r;
    const p = goal ? Math.min(1, value / goal) : 0;
    return '<svg class="ring' + (goal && value >= goal ? ' ok' : '') + '" viewBox="0 0 64 64" aria-hidden="true"><circle class="track" cx="32" cy="32" r="' + r + '"/>' +
      '<circle class="val" cx="32" cy="32" r="' + r + '" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + c.toFixed(1) + '" data-off="' + (c * (1 - p)).toFixed(1) + '"/></svg>';
  }

  function series(book, range) {
    const now = new Date();
    const out = [];
    if (range === 'daily') {
      for (let i = 29; i >= 0; i--) {
        const d = u.addDays(now, -i);
        out.push({ label: d.getDate() === 1 || i === 29 || i === 0 ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : (i % 7 === 0 ? String(d.getDate()) : ''), tip: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }), v: Math.max(0, book.log[u.dayKey(d)] || 0) });
      }
      return { data: out, goal: book.goals.daily };
    }
    if (range === 'weekly') {
      const start = u.startOfWeek(now);
      for (let i = 11; i >= 0; i--) {
        const s = u.addDays(start, -7 * i), e = u.addDays(s, 6);
        out.push({ label: i % 2 === 1 ? '' : s.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), tip: 'Week of ' + s.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), v: st.wordsBetween(book, s, e) });
      }
      return { data: out, goal: book.goals.weekly };
    }
    for (let i = 11; i >= 0; i--) {
      const s = new Date(now.getFullYear(), now.getMonth() - i, 1), e = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      out.push({ label: s.toLocaleDateString(undefined, { month: 'short' }), tip: s.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), v: st.wordsBetween(book, s, e) });
    }
    return { data: out, goal: book.goals.monthly };
  }

  function niceMax(v) {
    if (v <= 0) return 100;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }

  function barChart(s) {
    const W = 720, H = 220, L = 44, R = 8, T = 10, B = 26;
    const max = niceMax(Math.max(s.goal || 0, ...s.data.map((d) => d.v)));
    const n = s.data.length, slot = (W - L - R) / n, bw = Math.max(4, slot - 2);
    const y = (v) => T + (H - T - B) * (1 - v / max);
    let svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Words written over time">';
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i, yy = y(v);
      svg += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '"/>' +
        '<text class="ax" x="' + (L - 8) + '" y="' + (yy + 4).toFixed(1) + '" text-anchor="end">' + u.fmt(v) + '</text>';
    }
    s.data.forEach((d, i) => {
      const x = L + i * slot + (slot - bw) / 2;
      const top = y(d.v), h = (H - B) - top;
      const r = Math.min(4, bw / 2, h);
      const path = h > 0.5 ? 'M' + x + ',' + (H - B) + 'V' + (top + r) + 'Q' + x + ',' + top + ' ' + (x + r) + ',' + top + 'H' + (x + bw - r) + 'Q' + (x + bw) + ',' + top + ' ' + (x + bw) + ',' + (top + r) + 'V' + (H - B) + 'Z' : '';
      svg += '<g>' + (path ? '<path class="b" d="' + path + '"/>' : '<rect class="b zero" x="' + x + '" y="' + (H - B - 2) + '" width="' + bw + '" height="2" rx="1"/>') +
        '<rect class="hit" x="' + (L + i * slot) + '" y="' + T + '" width="' + slot + '" height="' + (H - T - B) + '" data-tip="' + u.esc(d.tip + ': ' + u.fmt(d.v) + ' words') + '"/></g>';
      if (d.label) svg += '<text class="ax" x="' + (x + bw / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + u.esc(d.label) + '</text>';
    });
    if (s.goal) svg += '<line class="goal-line" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(s.goal).toFixed(1) + '" y2="' + y(s.goal).toFixed(1) + '"/>';
    return svg + '</svg>';
  }

  function calendar(book) {
    const m = V.month || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    V.month = m;
    const first = new Date(m.getFullYear(), m.getMonth(), 1);
    const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7;
    const goal = book.goals.daily || 0;
    const todayKey = u.dayKey();
    let total = 0, active = 0;
    let html = '<div class="cal" role="grid" aria-label="Writing calendar">' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => '<div class="dow" role="columnheader">' + d + '</div>').join('');
    for (let i = 0; i < lead; i++) html += '<div class="day out"></div>';
    for (let d = 1; d <= days; d++) {
      const date = new Date(m.getFullYear(), m.getMonth(), d);
      const k = u.dayKey(date);
      const v = Math.max(0, book.log[k] || 0);
      total += v; if (v > 0) active++;
      let lvl = 0;
      if (v > 0) lvl = !goal ? 2 : v >= goal * 2 ? 4 : v >= goal ? 3 : v >= goal / 2 ? 2 : 1;
      html += '<div class="day l' + lvl + (k === todayKey ? ' today' : '') + (goal && v >= goal ? ' goal' : '') + '" role="gridcell" data-tip="' + u.esc(date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) + ': ' + u.fmt(v) + ' words' + (goal && v >= goal ? ' · target met' : '')) + '">' +
        '<span>' + d + '</span><span class="w">' + (v ? u.fmt(v) : '') + '</span></div>';
    }
    html += '</div>';
    return { html, total, active, label: m.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) };
  }

  function render(ctx) {
    const book = ctx.book;
    const b = '#/b/' + book.id;
    const today = st.today(book), week = st.thisWeek(book), month = st.thisMonth(book);
    const s = st.streaks(book);
    const logVals = Object.values(book.log).filter((v) => v > 0);
    const avg = logVals.length ? logVals.reduce((a, c) => a + c, 0) / logVals.length : 0;
    const best = logVals.length ? Math.max(...logVals) : 0;
    const goalCard = (label, v, g) => '<div class="card goal-ring">' + ring(v, g) + '<div><p class="stat-label">' + label + '</p><p class="stat-value">' + u.fmt(v) + '<small> / ' + u.fmt(g) + '</small></p>' +
      '<p class="stat-foot">' + (g ? (v >= g ? 'Target reached' : u.fmt(g - v) + ' words to go') : 'No target set') + '</p></div></div>';

    let html = '<div class="page"><header class="page-head"><div><h1>Writing Progress</h1><p class="lede">Targets, consistency and the shape of your writing over time.</p></div>' +
      '<button class="btn" data-act="editGoals">' + ic('target') + 'Adjust targets</button></header>';
    html += '<div class="grid g3">' + goalCard('Today', today, book.goals.daily) + goalCard('This week', week, book.goals.weekly) + goalCard('This month', month, book.goals.monthly) + '</div>';
    html += '<div class="grid g4" style="margin-top:var(--s4)">' +
      '<div class="card"><p class="stat-label">Current streak</p><p class="stat-value">' + s.current + '<small> ' + (s.current === 1 ? 'day' : 'days') + '</small></p></div>' +
      '<div class="card"><p class="stat-label">Longest streak</p><p class="stat-value">' + s.longest + '<small> ' + (s.longest === 1 ? 'day' : 'days') + '</small></p></div>' +
      '<div class="card"><p class="stat-label">Days written</p><p class="stat-value">' + s.daysWritten + '</p></div>' +
      '<div class="card"><p class="stat-label">Average writing day</p><p class="stat-value">' + u.fmt(avg) + '<small> words</small></p><p class="stat-foot">Best day: ' + u.fmt(best) + '</p></div></div>';

    const cal = calendar(book);
    html += '<div class="split block"><section class="card" aria-labelledby="h-cal"><div class="row" style="justify-content:space-between;margin-bottom:var(--s4)"><h2 id="h-cal" style="font-size:var(--fs-lg)">' + cal.label + '</h2>' +
      '<div class="row"><button class="icon-btn" data-act="month" data-d="-1" aria-label="Previous month">' + ic('left') + '</button><button class="btn btn-ghost btn-sm" data-act="month" data-d="0">Today</button><button class="icon-btn" data-act="month" data-d="1" aria-label="Next month">' + ic('right') + '</button></div></div>' +
      cal.html + '<div class="row" style="justify-content:space-between;margin-top:var(--s4);flex-wrap:wrap"><span class="muted num" style="font-size:var(--fs-sm)">' + u.fmt(cal.total) + ' words on ' + cal.active + (cal.active === 1 ? ' day' : ' days') + '</span>' +
      '<span class="legend">Fewer<i style="background:var(--heat-0)"></i><i style="background:var(--heat-1)"></i><i style="background:var(--heat-2)"></i><i style="background:var(--heat-3)"></i><i style="background:var(--heat-4)"></i>More · dot = target met</span></div></section>';

    // status summary
    const by = { final: [], review: [], draft: [] };
    book.chapters.forEach((c) => by[c.status].push(c));
    const statusRow = (k, label, desc) => '<div class="list-item"><span class="dot ' + k + '"></span><div class="li-main"><span class="li-title">' + label + '</span><div class="li-sub">' + (by[k].length ? u.esc(by[k].map((c) => c.title).join(', ')) : desc) + '</div></div><span class="li-meta">' + by[k].length + '</span></div>';
    html += '<section class="card" aria-labelledby="h-st"><h2 id="h-st" style="font-size:var(--fs-lg);margin-bottom:var(--s2)">Chapter Status</h2><div class="list">' +
      statusRow('final', 'Completed', 'None finalized yet') + statusRow('review', 'Pending review', 'Nothing in review') + statusRow('draft', 'Unfinished', 'No drafts') + '</div></section></div>';

    // history
    const ser = series(book, V.range);
    html += '<section class="block card" aria-labelledby="h-hist"><div class="row" style="justify-content:space-between;margin-bottom:var(--s4);flex-wrap:wrap;gap:var(--s3)"><div><h2 id="h-hist" style="font-size:var(--fs-lg)">Writing History</h2><p class="muted" style="font-size:var(--fs-sm)">Net words per ' + ({ daily: 'day, last 30 days', weekly: 'week, last 12 weeks', monthly: 'month, last 12 months' })[V.range] + '. Dashed line: your target.</p></div>' +
      '<div class="seg" role="group" aria-label="History range">' + [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']].map((r) => '<button class="' + (V.range === r[0] ? 'on' : '') + '" data-act="range" data-r="' + r[0] + '">' + r[1] + '</button>').join('') + '</div></div>' +
      barChart(ser) +
      '<details style="margin-top:var(--s3)"><summary class="muted" style="font-size:var(--fs-sm);cursor:pointer">Show as table</summary><table class="ch-table" style="margin-top:var(--s2)"><thead><tr><th>Period</th><th class="w">Words</th></tr></thead><tbody>' +
      ser.data.slice().reverse().map((d) => '<tr><td>' + u.esc(d.tip) + '</td><td class="w">' + u.fmt(d.v) + '</td></tr>').join('') + '</tbody></table></details></section>';

    // chapter-wise
    html += '<section class="block" aria-labelledby="h-chp"><div class="block-head"><h2 id="h-chp">Chapter Progress</h2><a class="btn btn-ghost btn-sm" href="' + b + '/outline">Outline' + ic('right') + '</a></div>';
    if (!book.chapters.length) html += '<div class="card"><p class="empty">No chapters yet.</p></div>';
    else {
      html += '<div class="card card-tight"><table class="ch-table"><thead><tr><th class="n">#</th><th>Chapter</th><th class="hide-sm">Status</th><th class="w">Words</th><th class="w hide-sm">Target</th><th class="p"><span class="sr-only">Progress</span></th></tr></thead><tbody>' +
        book.chapters.map((c, i) => {
          const w = st.chapterWords(c);
          return '<tr><td class="n">' + (i + 1) + '</td><td class="t"><a href="' + b + '/ch/' + c.id + '">' + u.esc(c.title) + '</a></td><td class="hide-sm"><span class="status-pill"><span class="dot ' + c.status + '"></span>' + BS.ui.statusLabels[c.status] + '</span></td>' +
            '<td class="w">' + u.fmt(w) + '</td><td class="w hide-sm">' + (c.targetWords ? u.fmt(c.targetWords) : '<span class="muted">—</span>') + '</td>' +
            '<td class="p">' + (c.targetWords ? '<div class="bar' + (w >= c.targetWords ? ' ok' : '') + '" title="' + u.pct(w, c.targetWords) + '%"><span data-w="' + u.pct(w, c.targetWords) + '"></span></div>' : '<span class="muted" style="font-size:var(--fs-xs)">Set a target in chapter details</span>') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    html += '</section></div>';
    return html;
  }

  function mount(root) {
    BS.views.dashboard.animateBars(root);
    requestAnimationFrame(() => root.querySelectorAll('.ring .val').forEach((c) => { c.style.strokeDashoffset = c.dataset.off; }));
  }

  return {
    title: () => 'Writing Progress',
    render, mount,
    act: {
      editGoals: (el, e, ctx) => BS.views.dashboard.editGoals(ctx),
      month(el) {
        const d = +el.dataset.d;
        const now = new Date();
        V.month = d === 0 ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(V.month.getFullYear(), V.month.getMonth() + d, 1);
        BS.app.render(false);
      },
      range(el) { V.range = el.dataset.r; BS.app.render(false); }
    }
  };
})();
