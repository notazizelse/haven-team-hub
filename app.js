/* Haven Tashkent — Team Hub front end. Plain JS, no build step. */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const app = $('#app'), tabsEl = $('#tabs'), whoEl = $('#who');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode — fine */ } },
  };
  const params = new URLSearchParams(location.search);
  const DEMO = params.has('demo') || !/^https:\/\/script\.google\.com\//.test(window.HUB_API || '');
  let token = params.get('t') || store.get('hub_t') || '';
  if (params.get('t')) store.set('hub_t', params.get('t'));
  let D = null, tab = store.get('hub_tab') || '';

  // ---------------------------------------------------------------- time
  const parseDue = s => new Date(String(s).replace(' ', 'T') + ':00+05:00'); // Tashkent
  const DAY = 864e5;
  function dueInfo(t) {
    const d = parseDue(t.due), now = Date.now(), diff = d - now;
    const fmt = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Tashkent' }) + ', ' + t.due.slice(11);
    if (t.status === 'Done' || t.status === 'Dropped') return { cls: '', label: fmt, over: false };
    if (diff < 0) { const n = Math.ceil(-diff / DAY); return { cls: 'over', label: `Overdue${n > 1 ? ' by ' + n + ' days' : ''} · ${fmt}`, over: true }; }
    if (diff < DAY) return { cls: 'soon', label: `Due in ${Math.max(1, Math.round(diff / 36e5))} h · ${fmt}`, over: false };
    if (diff < 3 * DAY) return { cls: 'soon', label: `Due in ${Math.ceil(diff / DAY)} days · ${fmt}`, over: false };
    return { cls: '', label: fmt, over: false };
  }
  const dur = m => m < 60 ? `${m} min` : (m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`);
  const pill = s => `<span class="pill ${{ 'Not started': 'ns', 'In progress': 'ip', 'Blocked': 'bl', 'Done': 'dn', 'Dropped': 'dr' }[s] || 'ns'}">${esc(s)}</span>`;
  const stCls = s => ({ 'In progress': 'st-progress', 'Blocked': 'st-blocked', 'Done': 'st-done', 'Dropped': 'st-done' }[s] || '');

  // ---------------------------------------------------------------- api
  async function load() {
    if (DEMO) { D = await demoData(); return; }
    if (!token) { D = null; return; }
    const r = await fetch(window.HUB_API + '?action=me&t=' + encodeURIComponent(token), { cache: 'no-store' });
    D = await r.json();
  }
  async function post(body) {
    if (DEMO) return demoPost(body);
    const r = await fetch(window.HUB_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ t: token }, body)) });
    return r.json();
  }
  function toast(msg, err) {
    const el = $('#toast'); el.textContent = msg; el.className = 'toast' + (err ? ' err' : ''); el.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { el.hidden = true; }, err ? 5000 : 2500);
  }

  // ---------------------------------------------------------------- render
  function render() {
    if (!D) {
      tabsEl.hidden = true; whoEl.innerHTML = '';
      app.innerHTML = `<h1>Team Hub</h1><div class="notice">Open the <b>personal link</b> Azizbek sent you on Telegram. It looks like <code>…/?t=a1b2c3…</code>.<br>Don't share it — it's your key.</div>`;
      return;
    }
    if (!D.ok) { app.innerHTML = `<div class="notice red">${esc(D.error || 'Something went wrong.')}</div>`; return; }
    whoEl.innerHTML = `${esc(D.me.name)}<small>${esc(D.me.role)}${DEMO ? ' · DEMO' : ''}</small>`;
    const tabs = [['tasks', 'My tasks'], ['rules', 'Rules'], ['calendar', 'Calendar'], ['team', 'Team']];
    if (D.me.lead) tabs.unshift(['dash', 'Dashboard']);
    if (!tabs.some(x => x[0] === tab)) tab = tabs[0][0];
    tabsEl.hidden = false;
    tabsEl.innerHTML = tabs.map(([k, v]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${v}</button>`).join('');
    ({ tasks: viewTasks, rules: viewRules, calendar: viewCalendar, team: viewTeam, dash: viewDash })[tab]();
  }

  function taskCard(t, opts) {
    opts = opts || {};
    const di = dueInfo(t), done = t.status === 'Done';
    const checks = JSON.parse(store.get('steps_' + t.id) || '[]');
    const owner = opts.showOwner ? `<b>${esc(nameOf(t.owner))}</b> · ` : '';
    return `<details class="task ${stCls(t.status)}" data-id="${esc(t.id)}" ${opts.open ? 'open' : ''}>
      <summary><div class="t-main"><div class="t-title">${esc(t.title)}</div>
        <div class="t-meta">${owner}<span class="due ${di.cls}">${esc(di.label)}</span> · ~${dur(t.mins)} · ${esc(t.id)}</div></div>${pill(t.status)}</summary>
      <div class="t-body">
        ${t.why ? `<p class="why"><b>Why:</b> ${esc(t.why)}</p>` : ''}
        <ol>${t.steps.map((s, i) => `<li><label><input type="checkbox" data-step="${i}" ${checks[i] ? 'checked' : ''}><span class="num">${i + 1}.</span><span>${esc(s)}</span></label></li>`).join('')}</ol>
        <div class="donebox"><b>Done =</b> ${esc(t.done_when)}</div>
        ${t.links.length ? `<div class="links">${t.links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join('')}</div>` : ''}
        ${t.ask ? `<div class="ask"><b>Ask:</b> ${esc(t.ask)}</div>` : ''}
        ${t.status === 'Blocked' && t.blocked_reason ? `<div class="notice red"><b>Blocked:</b> ${esc(t.blocked_reason)}</div>` : ''}
        ${done && t.proof ? `<div class="proof"><b>Proof:</b> ${linkify(t.proof)}</div>` : ''}
        <div class="actions">
          ${!done && t.status !== 'In progress' ? `<button class="btn start" data-act="In progress">Start</button>` : ''}
          ${!done ? `<button class="btn done" data-form="done">Done</button><button class="btn block" data-form="block">Blocked</button>` : `<button class="btn ghost" data-act="In progress">Reopen</button>`}
        </div>
        <div class="form" data-f="done"><label class="f">Proof — a link, photo link, or name + number</label><textarea placeholder="https://… or 'Teacher: Malika Karimova, +998 …'"></textarea>
          <div class="actions"><button class="btn done" data-send="Done">Send — mark as done</button></div></div>
        <div class="form" data-f="block"><label class="f">What do you need, and from whom?</label><textarea placeholder="I need the teacher's number from Abdulaziz by Thursday."></textarea>
          <div class="actions"><button class="btn block" data-send="Blocked">Send — I'm blocked</button></div></div>
      </div></details>`;
  }
  const linkify = s => esc(s).replace(/https?:\/\/[^\s<]+/g, u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
  const nameOf = k => ((D.team || []).find(p => p.key === k) || {}).name || k;

  function viewTasks() {
    const ts = D.tasks.slice().sort((a, b) => a.due < b.due ? -1 : 1);
    const open = ts.filter(t => t.status !== 'Done' && t.status !== 'Dropped');
    const over = open.filter(t => dueInfo(t).over), soon = open.filter(t => !dueInfo(t).over && parseDue(t.due) - Date.now() < 7 * DAY);
    const later = open.filter(t => !over.includes(t) && !soon.includes(t)), done = ts.filter(t => t.status === 'Done');
    const first = D.me.name.split(' ')[0];
    let h = `<h1>Salom, ${esc(first)}!</h1><p class="lede">${esc(D.me.one || '')}</p>`;
    if (!D.me.telegram && D.bot) h += `<div class="notice tg"><span>Get a reminder at 18:00 the day before each deadline.</span><a class="btn start" href="https://t.me/${esc(D.bot)}?start=${esc(token)}" target="_blank" rel="noopener">Connect Telegram</a></div>`;
    h += `<div class="stats"><div class="stat ${over.length ? 'bad' : ''}"><b>${over.length}</b><span>overdue</span></div><div class="stat"><b>${soon.length}</b><span>due this week</span></div><div class="stat good"><b>${done.length}</b><span>done</span></div></div>`;
    if (over.length) h += `<h2>Overdue — finish it, or press Blocked</h2>` + over.map(t => taskCard(t, { open: true })).join('');
    h += `<h2>This week</h2>` + (soon.length ? soon.map((t, i) => taskCard(t, { open: i === 0 && !over.length })).join('') : `<p class="empty">Nothing due in the next 7 days.</p>`);
    if (later.length) h += `<h2>Later</h2>` + later.map(t => taskCard(t)).join('');
    if (done.length) h += `<h2>Done</h2>` + done.map(t => taskCard(t)).join('');
    if (D.me.ask) h += `<h2>Who to ask</h2><div class="person">${esc(D.me.ask).replace(/\n/g, '<br>')}</div>`;
    if (D.me.weekend) h += `<h2>Your event-weekend job</h2><div class="person">${esc(D.me.weekend)}</div>`;
    app.innerHTML = h;
  }

  function viewRules() {
    app.innerHTML = `<h1>Team rules</h1><p class="lede">They exist so nobody has to chase anybody.</p>` +
      D.rules.map((r, i) => `<div class="rule"><div class="n">${i + 1}</div><div><b>${esc(r.title)}</b><p>${esc(r.text)}</p></div></div>`).join('') +
      `<h2>How to report</h2><div class="rule"><div class="n">▶</div><div><b>Start</b><p>Press it when you begin.</p></div></div>
       <div class="rule"><div class="n">✓</div><div><b>Done + proof</b><p>A link, a photo link, or a name + number. No proof = not done.</p></div></div>
       <div class="rule"><div class="n">!</div><div><b>Blocked + what you need</b><p>Same day. Azizbek gets it instantly.</p></div></div>`;
  }
  function viewCalendar() {
    app.innerHTML = `<h1>Meetings</h1><p class="lede">Tashkent time. Can't come? Post your 3 lines (finished · next · blocked) in the group before 19:00.</p><div class="tablewrap"><table><tr><th>Date</th><th>Time</th><th>Where</th><th>What</th></tr>` +
      D.meetings.map(m => `<tr><td><b>${esc(m.date)}</b></td><td>${esc(m.time)}</td><td>${esc(m.where)}</td><td>${esc(m.what)}</td></tr>`).join('') + `</table></div>` +
      `<h2>My deadlines</h2><div class="tablewrap"><table><tr><th>Due</th><th>Task</th><th>Status</th></tr>` +
      D.tasks.slice().sort((a, b) => a.due < b.due ? -1 : 1).map(t => `<tr class="${dueInfo(t).over ? 'over' : ''}"><td>${esc(t.due)}</td><td>${esc(t.title)}</td><td>${pill(t.status)}</td></tr>`).join('') + `</table></div>`;
  }
  function viewTeam() {
    const areas = [...new Set(D.team.map(p => p.area))];
    app.innerHTML = `<h1>Team</h1>` + areas.map(a => `<h2>${esc(a)}</h2>` + D.team.filter(p => p.area === a).map(p => `<div class="person"><b>${esc(p.name)}</b> <span class="small">${esc(p.handle || '')}</span><br><span class="small">${esc(p.role)}</span></div>`).join('')).join('');
  }

  function viewDash() {
    const all = D.all || [], open = all.filter(t => t.status !== 'Done' && t.status !== 'Dropped');
    const over = open.filter(t => dueInfo(t).over), blocked = open.filter(t => t.status === 'Blocked');
    const done = all.filter(t => t.status === 'Done'), ontime = done.filter(t => t.done_at && t.done_at <= t.due);
    const weekAgo = new Date(Date.now() - 7 * DAY).toISOString().slice(0, 10);
    const doneWeek = done.filter(t => (t.done_at || '').slice(0, 10) >= weekAgo);
    let h = `<h1>Dashboard</h1><p class="lede">Updated ${esc(D.now)} (Tashkent). Rule: never take a task back — reassign it to the backup or help the owner.</p>`;
    h += `<div class="stats"><div class="stat ${over.length ? 'bad' : ''}"><b>${over.length}</b><span>overdue</span></div><div class="stat ${blocked.length ? 'bad' : ''}"><b>${blocked.length}</b><span>blocked</span></div>
      <div class="stat good"><b>${doneWeek.length}</b><span>done in 7 days</span></div><div class="stat"><b>${done.length ? Math.round(100 * ontime.length / done.length) : 0}%</b><span>done on time</span></div><div class="stat"><b>${open.length}</b><span>open</span></div></div>`;
    if (blocked.length) h += `<h2>Blocked — act today</h2>` + blocked.map(t => taskCard(t, { showOwner: true, open: true })).join('');
    if (over.length) h += `<h2>Overdue</h2>` + over.filter(t => t.status !== 'Blocked').map(t => taskCard(t, { showOwner: true })).join('');
    const rows = D.team.map(p => {
      const mine = all.filter(t => t.owner === p.key), md = mine.filter(t => t.status === 'Done');
      const mo = mine.filter(t => t.status !== 'Done' && t.status !== 'Dropped' && dueInfo(t).over).length;
      const last = mine.map(t => t.updated_at || '').sort().pop() || '—';
      const ot = md.length ? Math.round(100 * md.filter(t => t.done_at && t.done_at <= t.due).length / md.length) + '%' : '—';
      const hrs = (md.reduce((s, t) => s + t.mins, 0) / 60).toFixed(1);
      return { p, open: mine.length - md.length, mo, done: md.length, ot, hrs, last };
    });
    h += `<h2>People</h2><div class="tablewrap"><table><tr><th>Name</th><th>Open</th><th>Overdue</th><th>Done</th><th>On time</th><th>Hours</th><th>Last activity</th></tr>` +
      rows.map(r => `<tr class="${r.mo ? 'over' : ''}"><td><b>${esc(r.p.name)}</b><br><span class="small">${esc(r.p.role)}</span></td><td>${r.open}</td><td>${r.mo}</td><td>${r.done}</td><td>${r.ot}</td><td>${r.hrs}</td><td class="small">${esc(r.last)}</td></tr>`).join('') +
      `</table></div><p class="small">Hours = estimated time of finished tasks — the start of the volunteer-hours list for HQ. <a href="#" id="csv">Download CSV</a></p>`;
    h += `<h2>Add a task</h2><div class="person" id="addform">
      <label class="f">Owner</label><select name="owner">${D.team.map(p => `<option value="${esc(p.key)}">${esc(p.name)}</option>`).join('')}</select>
      <label class="f">Title — start with a verb</label><input name="title" placeholder="Put up 3 posters at School 110">
      <label class="f">Due (Tashkent time)</label><input name="due" type="datetime-local">
      <label class="f">Minutes it takes</label><input name="mins" type="number" value="30" min="5" step="5">
      <label class="f">Why (one line)</label><input name="why">
      <label class="f">Steps — one per line</label><textarea name="steps"></textarea>
      <label class="f">Done = (the proof)</label><input name="done_when" placeholder="3 wall photos">
      <label class="f">Who to ask</label><input name="ask">
      <div class="actions"><button class="btn start" id="addbtn">Add task</button></div></div>`;
    if (D.log && D.log.length) h += `<h2>Recent activity</h2><div class="tablewrap"><table><tr><th>Time</th><th>Who</th><th>Task</th><th>What</th></tr>` +
      D.log.slice(0, 30).map(l => `<tr><td class="small">${esc(l.time)}</td><td>${esc(l.who)}</td><td>${esc(l.task)}</td><td><b>${esc(l.action)}</b> ${linkify(l.note || '')}</td></tr>`).join('') + `</table></div>`;
    h += `<h2>All open tasks</h2>` + open.sort((a, b) => a.due < b.due ? -1 : 1).map(t => taskCard(t, { showOwner: true })).join('');
    app.innerHTML = h;
    $('#csv').onclick = e => {
      e.preventDefault();
      const lines = [['Name', 'Role', 'Task', 'Done at', 'Minutes', 'Proof']].concat(all.filter(t => t.status === 'Done').map(t => [nameOf(t.owner), (D.team.find(p => p.key === t.owner) || {}).role || '', t.title, t.done_at, t.mins, t.proof]));
      const csv = lines.map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(',')).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = 'haven-volunteer-hours.csv'; a.click();
    };
    $('#addbtn').onclick = async () => {
      const f = n => $('#addform [name="' + n + '"]').value.trim();
      const task = { owner: f('owner'), title: f('title'), due: f('due').replace('T', ' ').slice(0, 16), mins: Number(f('mins')) || 30, why: f('why'),
        steps: f('steps').split('\n').map(s => s.trim()).filter(Boolean), done_when: f('done_when'), ask: f('ask') };
      const r = await post({ action: 'add', task });
      if (!r.ok) return toast(r.error || 'Could not add', true);
      D.all.push(r.task); if (r.task.owner === D.me.key) D.tasks.push(r.task); toast('Added ' + r.task.id); render();
    };
  }

  // ---------------------------------------------------------------- events
  tabsEl.addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (!b) return; tab = b.dataset.tab; store.set('hub_tab', tab); render(); window.scrollTo(0, 0); });
  app.addEventListener('change', e => {
    const cb = e.target.closest('input[data-step]'); if (!cb) return;
    const id = cb.closest('.task').dataset.id, k = 'steps_' + id, arr = JSON.parse(store.get(k) || '[]');
    arr[Number(cb.dataset.step)] = cb.checked; store.set(k, JSON.stringify(arr));
  });
  app.addEventListener('click', async e => {
    const card = e.target.closest('.task'); if (!card) return;
    const id = card.dataset.id;
    const fb = e.target.closest('[data-form]');
    if (fb) { card.querySelectorAll('.form').forEach(f => f.classList.toggle('show', f.dataset.f === fb.dataset.form && !f.classList.contains('show'))); const ta = card.querySelector('.form.show textarea'); if (ta) ta.focus(); return; }
    const act = e.target.closest('[data-act],[data-send]'); if (!act) return;
    const status = act.dataset.act || act.dataset.send;
    const ta = act.dataset.send ? act.closest('.form').querySelector('textarea') : null;
    const body = { action: 'status', id, status };
    if (status === 'Done') body.proof = ta.value.trim();
    if (status === 'Blocked') body.reason = ta.value.trim();
    act.disabled = true;
    try {
      const r = await post(body);
      if (!r.ok) { toast(r.error || 'Could not save', true); act.disabled = false; return; }
      [D.tasks, D.all || []].forEach(list => { const i = list.findIndex(t => t.id === id); if (i >= 0) list[i] = r.task; });
      toast(status === 'Done' ? 'Nice — marked done.' : status === 'Blocked' ? 'Sent. Azizbek will see it.' : 'Saved.');
      render();
    } catch (err) { toast('No connection — try again, or post in the Tasks topic.', true); act.disabled = false; }
  });

  // ---------------------------------------------------------------- demo mode (no backend yet)
  async function demoData() {
    const r = await fetch('demo.json'); const seed = await r.json();
    const who = params.get('as') || 'azizbek';
    const me = seed.people.find(p => p.key === who) || seed.people[0];
    const all = seed.tasks.map(t => Object.assign({ status: 'Not started', proof: '', blocked_reason: '', done_at: '', updated_at: '' }, t));
    return { ok: true, now: new Date().toISOString().slice(0, 16).replace('T', ' '), bot: 'HavenTashkentTeamBot',
      me: Object.assign({}, me, { lead: !!me.lead, telegram: false }), team: seed.people, tasks: all.filter(t => t.owner === me.key),
      all: me.lead ? all : undefined, log: [], rules: seed.rules, meetings: seed.meetings };
  }
  function demoPost(b) {
    const list = D.all || D.tasks, t = list.find(x => x.id === b.id);
    if (b.action === 'add') { const n = { id: 'T9' + String(Math.random()).slice(2, 4), status: 'Not started', steps: b.task.steps, links: [], proof: '', blocked_reason: '', done_at: '', updated_at: '' }; return { ok: true, task: Object.assign(n, b.task) }; }
    if (b.status === 'Done' && (!b.proof || b.proof.length < 3)) return { ok: false, error: 'Paste the proof (a link, photo link or name + number).' };
    if (b.status === 'Blocked' && (!b.reason || b.reason.length < 5)) return { ok: false, error: 'Write what you need and from whom.' };
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
    return { ok: true, task: Object.assign({}, t, { status: b.status, proof: b.proof || t.proof, blocked_reason: b.reason || '', done_at: b.status === 'Done' ? now : '', updated_at: now }) };
  }

  load().then(render).catch(() => { app.innerHTML = '<div class="notice red">Could not reach the Team Hub. Check your internet and reload.</div>'; });
})();
