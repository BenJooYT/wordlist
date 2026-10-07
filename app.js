"use strict";
const SPRINT_N = 20;
const SPRINT_SEC = 5 * 60;

const $ = (s) => document.querySelector(s);
const dashView = $("#view-dashboard");
const bookView = $("#view-book");
const studyView = $("#view-study");
const flashView = $("#flash-view");
const sprintView = $("#sprint-view");
const tabs = [...document.querySelectorAll(".tab")];

let bookId = BOOKS[0].id;
let unitId = BOOKS[0].units[0].id;
let mode = "flash";

// flash state
let order = [];
let idx = 0;
let flipped = false;
let known = new Set();

// sprint state
let sprint = null;
let timerId = null;

const store = {
  load() {
    try { return JSON.parse(localStorage.getItem("huvocab-v1") || "{}"); }
    catch { return {}; }
  },
  save(d) { localStorage.setItem("huvocab-v1", JSON.stringify(d)); }
};

function book() { return BOOKS.find(b => b.id === bookId) || BOOKS[0]; }
function unit() { const b = book(); return (b.units || []).find(u => u.id === unitId) || b.units[0]; }
// Flat word list; sectioned units ({ sections: [{ name, words }] }) are
// flattened with `sec` attached so the UI can show the section name.
function wordsOf(u) {
  if (u.words) return u.words;
  const out = [];
  for (const s of (u.sections || [])) for (const w of s.words) out.push({ ...w, sec: s.name });
  return out;
}
function norm(s) {
  return (s || "").toLowerCase().trim().replace(/\s+/g, " ")
    .replace(/^to\s+/, "").replace(/^[a /an ]+/, (m) => m); // keep simple; main norm below
}
function normEn(s) {
  return (s || "").toLowerCase().trim().replace(/\s+/g, " ").replace(/^to\s+/, "");
}
function accepted(input, entry) {
  const n = normEn(input);
  if (!n) return false;
  return entry.en.some(a => normEn(a) === n);
}
function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- dashboard: books -> units -> study ----
function knownCount(uid) {
  const d = store.load();
  return ((d[uid] && d[uid].known) || []).length;
}
function show(which) {
  stopTimer();
  dashView.hidden = which !== "dashboard";
  bookView.hidden = which !== "book";
  studyView.hidden = which !== "study";
}
function renderDashboard() {
  dashView.innerHTML = `<div class="kicker">Books · ${BOOKS.length}</div>`;
  for (const b of BOOKS) {
    let total = 0, known = 0;
    for (const u of b.units) { total += wordsOf(u).length; known += Math.min(knownCount(u.id), wordsOf(u).length); }
    const pct = total ? Math.round(100 * known / total) : 0;
    const card = document.createElement("button");
    card.className = "menu-card";
    card.innerHTML = `<h3>${escapeHtml(b.title)}</h3>
      <p>${escapeHtml(b.subtitle || "")}</p>
      <div class="meta">${b.units.length} unit${b.units.length === 1 ? "" : "s"} · ${total} words · ${known} known</div>
      <div class="bar" aria-hidden="true"><span style="width:${pct}%"></span></div>`;
    card.onclick = () => { bookId = b.id; renderBook(); show("book"); };
    dashView.appendChild(card);
  }
}
function renderBook() {
  const b = book();
  bookView.innerHTML = "";
  const back = document.createElement("button");
  back.className = "back";
  back.textContent = "‹ All books";
  back.onclick = () => { renderDashboard(); show("dashboard"); };
  bookView.appendChild(back);
  const h = document.createElement("h2");
  h.textContent = b.title;
  h.style.margin = "0 0 4px";
  bookView.appendChild(h);
  const sub = document.createElement("p");
  sub.style.cssText = "color:var(--muted);margin:0 0 12px";
  sub.textContent = b.subtitle || "";
  bookView.appendChild(sub);
  for (const u of b.units) {
    const total = wordsOf(u).length;
    const known = Math.min(knownCount(u.id), total);
    const pct = total ? Math.round(100 * known / total) : 0;
    const secs = (u.sections || []).map(s => s.name).join(" · ");
    const card = document.createElement("button");
    card.className = "menu-card";
    card.innerHTML = `<h3>${escapeHtml(u.title)}</h3>
      ${secs ? `<p>${escapeHtml(secs)}</p>` : ""}
      <div class="meta">${total} words · ${known} known</div>
      <div class="bar" aria-hidden="true"><span style="width:${pct}%"></span></div>`;
    card.onclick = () => openUnit(u.id);
    bookView.appendChild(card);
  }
}
function openUnit(uid) {
  unitId = uid;
  mode = "flash";
  tabs.forEach(x => x.setAttribute("aria-selected", x.dataset.mode === "flash" ? "true" : "false"));
  flashView.hidden = false;
  sprintView.hidden = true;
  $("#study-title").textContent = unit().title;
  $("#back-to-book-label").textContent = book().title;
  loadKnown(); resetFlash(); renderFlash(); renderSprintIntro();
  show("study");
}
tabs.forEach(t => t.onclick = () => {
  mode = t.dataset.mode;
  tabs.forEach(x => x.setAttribute("aria-selected", x === t ? "true" : "false"));
  flashView.hidden = mode !== "flash";
  sprintView.hidden = mode !== "sprint";
  if (mode === "sprint") { stopTimer(); renderSprintIntro(); }
});

// ---- flashcards ----
function loadKnown() {
  const d = store.load();
  known = new Set((d[unitId] && d[unitId].known) || []);
}
function persistKnown() {
  const d = store.load();
  d[unitId] = { known: [...known] };
  store.save(d);
}
function resetFlash() {
  order = shuffled(wordsOf(unit()));
  idx = 0; flipped = false;
}
function huKey(w) { return w.hu; }
// Shrink card text until the fixed-height card fits — long phrases get
// smaller instead of stretching the layout. Runs after the card is in DOM.
function fitFlash(card) {
  const hu = card.querySelector(".big-hu");
  const en = card.querySelector(".big-en");
  let sHu = 38, sEn = 26, guard = 30;
  hu.style.fontSize = sHu + "px";
  en.style.fontSize = sEn + "px";
  while (guard-- > 0 && card.scrollHeight > card.clientHeight + 1 && (sHu > 18 || sEn > 15)) {
    if (sHu > 18) { sHu -= 2; hu.style.fontSize = sHu + "px"; }
    if (sEn > 15) { sEn -= 1; en.style.fontSize = sEn + "px"; }
  }
}
function renderFlash() {
  const u = unit();
  const total = wordsOf(u).length;
  if (!total) { flashView.innerHTML = "<div class='card'>Empty unit.</div>"; return; }
  const w = order[idx % order.length];
  const isKnown = known.has(huKey(w));
  flashView.innerHTML = "";
  const card = document.createElement("div");
  card.className = "card flashcard";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", flipped ? "Hungarian and English. Activate to flip." : "Hungarian only. Activate to reveal English.");
  card.innerHTML = `
    <div class="kicker">${escapeHtml(u.title)}${w.sec ? " · " + escapeHtml(w.sec) : ""} · card ${idx % order.length + 1}/${order.length} ${isKnown ? "· ✓ known" : ""}</div>
    <div class="flash-mid">
      <div class="big-hu">${escapeHtml(w.hu)}</div>
      <div class="big-en">${flipped ? escapeHtml(w.en.join(" / ")) : "···"}</div>
      <div class="alt">${flipped ? "" : "&nbsp;"}</div>
    </div>
    <div class="flip-hint">${flipped ? "Tap to hide" : "Tap card or press Space to reveal"}</div>`;
  const flip = () => { flipped = !flipped; renderFlash(); };
  card.onclick = flip;
  card.onkeydown = (e) => { if (e.code === "Space" || e.key === "Enter") { e.preventDefault(); flip(); } };
  flashView.appendChild(card);
  fitFlash(card);

  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `
    <button class="ghost" id="f-prev">← Prev</button>
    <button class="ghost" id="f-known">${isKnown ? "Unmark" : "✓ Know"}</button>
    <button class="ghost" id="f-shuf">Shuffle</button>
    <button class="primary" id="f-next">Next →</button>`;
  flashView.appendChild(row);
  const prog = document.createElement("div");
  prog.className = "progress";
  prog.textContent = `Known in ${u.title}: ${known.size}/${total}`;
  flashView.appendChild(prog);

  $("#f-prev").onclick = () => { idx = (idx - 1 + order.length) % order.length; flipped = false; renderFlash(); };
  $("#f-next").onclick = nextFlash;
  $("#f-shuf").onclick = () => { resetFlash(); renderFlash(); };
  $("#f-known").onclick = () => {
    const k = huKey(order[idx % order.length]);
    if (known.has(k)) known.delete(k); else known.add(k);
    persistKnown(); flipped = false; renderFlash();
  };
  document.onkeydown = mode === "flash" ? (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.key === "ArrowRight") nextFlash();
    if (e.key === "ArrowLeft") { idx = (idx - 1 + order.length) % order.length; flipped = false; renderFlash(); }
  } : null;
}
function nextFlash() {
  idx = (idx + 1) % order.length;
  flipped = false;
  if (idx === 0) order = shuffled(wordsOf(unit()));
  renderFlash();
}

// ---- sprint: 20 words in 5:00, HU shown, type EN ----
function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; }
function renderSprintIntro() {
  stopTimer();
  const u = unit();
  sprintView.innerHTML = "";
  const box = document.createElement("div");
  box.className = "card";
  const n = Math.min(SPRINT_N, wordsOf(u).length);
  box.innerHTML = `
    <div class="kicker">Sprint · ${escapeHtml(u.title)}</div>
    <h2 style="margin:.4em 0">20 words in 5 minutes</h2>
    ${u.sections ? `<p style="color:var(--muted)">Sections: ${u.sections.map(s => escapeHtml(s.name) + " (" + s.words.length + ")").join(" · ")}</p>` : ""}
    <p style="color:var(--muted)">Hungarian shown only — type the English equivalent. ${n} words this round, 5:00 on the clock. Case-insensitive; alternatives accepted.</p>
    <div class="row"><button class="primary" id="s-start">Start sprint (${n} words)</button></div>`;
  sprintView.appendChild(box);
  $("#s-start").onclick = startSprint;
}
function startSprint() {
  const u = unit();
  const words = shuffled(wordsOf(unit())).slice(0, Math.min(SPRINT_N, wordsOf(unit()).length));
  sprint = { words, i: 0, correct: 0, missed: [], left: SPRINT_SEC, locked: false, done: false, t0: Date.now() };
  renderSprintQ();
  stopTimer();
  timerId = setInterval(() => {
    if (!sprint || sprint.done) { stopTimer(); return; }
    sprint.left--;
    const t = $("#s-timer");
    if (t) {
      t.textContent = fmt(sprint.left);
      if (sprint.left <= 60) t.classList.add("danger");
    }
    if (sprint.left <= 0) finishSprint(true);
  }, 1000);
}
function fmt(s) {
  s = Math.max(0, s);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function renderSprintQ() {
  const u = unit();
  sprintView.innerHTML = "";
  if (sprint.i >= sprint.words.length) { finishSprint(false); return; }
  const w = sprint.words[sprint.i];
  const box = document.createElement("div");
  box.className = "card";
  box.innerHTML = `
    <div class="sprint-top">
      <span class="kicker">Sprint · ${sprint.i + 1}/${sprint.words.length} · ✓ ${sprint.correct}</span>
      <span class="timer" id="s-timer">${fmt(sprint.left)}</span>
    </div>
    <div class="big-hu" lang="hu">${escapeHtml(w.hu)}</div>
    <label class="sr" for="s-in">English equivalent</label>
    <input class="answer" id="s-in" lang="en" autocomplete="off" autocapitalize="off" spellcheck="false"
      placeholder="Type the English…" />
    <div class="feedback" id="s-fb" aria-live="polite"></div>
    <div class="row">
      <button class="ghost" id="s-skip">Skip</button>
      <button class="primary" id="s-check">Check ↵</button>
    </div>
    <div class="progress">${escapeHtml(u.title)}${w.sec ? " · " + escapeHtml(w.sec) : ""} · HU shown only</div>`;
  sprintView.appendChild(box);
  const inp = $("#s-in");
  inp.focus();
  $("#s-check").onclick = checkSprint;
  $("#s-skip").onclick = () => {
    sprint.missed.push({ w, why: "skipped" });
    sprint.i++; sprint.locked = false; renderSprintQ();
  };
  inp.onkeydown = (e) => { if (e.key === "Enter") checkSprint(); };
  if (sprint.left <= 60) $("#s-timer").classList.add("danger");
}
function checkSprint() {
  if (!sprint || sprint.locked || sprint.done) return;
  const w = sprint.words[sprint.i];
  const inp = $("#s-in");
  const fb = $("#s-fb");
  if (accepted(inp.value, w)) {
    sprint.correct++;
    sprint.locked = true;
    fb.textContent = "✓ Correct";
    fb.className = "feedback ok";
    sprint.i++;
    setTimeout(() => { if (sprint && !sprint.done) renderSprintQ(); }, 450);
  } else {
    sprint.locked = true;
    sprint.missed.push({ w, why: `you wrote: ${inp.value.trim() || "—"}` });
    fb.textContent = `✗ ${w.en.join(" / ")}`;
    fb.className = "feedback no";
    const btn = $("#s-check");
    btn.textContent = "Next →";
    btn.onclick = () => { sprint.i++; sprint.locked = false; renderSprintQ(); };
  }
}
function finishSprint(timeUp) {
  if (!sprint || sprint.done) return;
  sprint.done = true;
  stopTimer();
  const used = SPRINT_SEC - sprint.left;
  const total = sprint.words.length;
  sprintView.innerHTML = "";
  const box = document.createElement("div");
  box.className = "card";
  box.innerHTML = `
    <div class="kicker">Sprint result · ${escapeHtml(unit().title)}</div>
    <h2 style="margin:.4em 0">${timeUp ? "⏱ Time!" : "Done!"} ${sprint.correct}/${total}</h2>
    <p style="color:var(--muted)">Time used: ${fmt(used)} / ${fmt(SPRINT_SEC)} · Missed: ${sprint.missed.length}</p>
    ${sprint.missed.length ? `<ol class="missed">${sprint.missed.map(m =>
      `<li>${m.w.sec ? `<span style="color:var(--muted)">[${escapeHtml(m.w.sec)}]</span> ` : ""}<b lang="hu">${escapeHtml(m.w.hu)}</b> → ${escapeHtml(m.w.en.join(" / "))} <span style="color:var(--muted)">(${escapeHtml(m.why)})</span></li>`).join("")}</ol>` : "<p>Flawless. Szép munka! 🎉</p>"}
    <div class="row">
      <button class="ghost" id="s-again">↻ New sprint</button>
      <button class="primary" id="s-retry" ${sprint.missed.length ? "" : "disabled"}>Retry missed (${sprint.missed.length})</button>
    </div>`;
  sprintView.appendChild(box);
  $("#s-again").onclick = () => renderSprintIntro();
  const r = $("#s-retry");
  if (sprint.missed.length) r.onclick = () => {
    const words = shuffled(sprint.missed.map(m => m.w));
    sprint = { words, i: 0, correct: 0, missed: [], left: SPRINT_SEC, locked: false, done: false, t0: Date.now() };
    renderSprintQ();
    stopTimer();
    timerId = setInterval(() => {
      if (!sprint || sprint.done) { stopTimer(); return; }
      sprint.left--;
      const t = $("#s-timer");
      if (t) { t.textContent = fmt(sprint.left); if (sprint.left <= 60) t.classList.add("danger"); }
      if (sprint.left <= 0) finishSprint(true);
    }, 1000);
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

// init
$("#study-back").onclick = () => { renderBook(); show("book"); };
renderDashboard();
show("dashboard");
