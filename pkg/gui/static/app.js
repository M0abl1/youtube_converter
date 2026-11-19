"use strict";

// The token is in the URL ytconv opened; every API call must carry it.
const token = new URLSearchParams(location.search).get("token") || "";
const $ = (id) => document.getElementById(id);

const state = {
  view: "download",
  info: null,          // last /api/info result
  url: "",
  format: "mp4",
  videoContainers: [],
  audioContainers: [],
  mp3Bitrates: [0, 320, 256, 192, 128],
  ffmpeg: true,
  ffmpegHint: "",
  fetching: false,
  lastAdded: null,     // {n, folder} of the last download request
  jobs: new Map(),     // id -> job
  historyOn: true,
  history: [],         // newest first
  historyLoaded: false,
  openGroups: new Set(),
};

// Preset choices for playlists (height 0 = best available).
const RESOLUTIONS = [0, 2160, 1440, 1080, 720, 480, 360, 240, 144];
const AUDIO_LEVELS = ["best", "medium", "low"];

function store(key, value) {
  try { localStorage.setItem("ytconv." + key, value); } catch { /* storage may be blocked */ }
}
function recall(key) {
  try { return localStorage.getItem("ytconv." + key); } catch { return null; }
}

async function api(path, body) {
  const opts = { headers: { "X-Ytconv-Token": token } };
  if (body !== undefined) {
    opts.method = "POST";
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, opts);
  } catch {
    throw new Error(t("unreachable"));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ? translateServer(data.error) : t("requestFailed", { status: res.status }));
  return data;
}

function clock(secs) {
  if (!secs) return "";
  const h = Math.floor(secs / 3600), m = Math.floor(secs / 60) % 60, s = secs % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function formatSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 || n >= 100 ? 0 : 1)} ${units[i]}`;
}

function locale() { return lang === "pt" ? "pt-BR" : "en"; }

// when describes a saved time: "Today, 14:32", "Yesterday, 09:10", "3 Nov, 18:05".
function when(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const now = new Date();
  const time = d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d >= today) return t("today", { time });
  if (d >= new Date(today - 864e5)) return t("yesterday", { time });
  const opts = { day: "numeric", month: "short" };
  if (d.getFullYear() !== now.getFullYear()) opts.year = "numeric";
  return `${d.toLocaleDateString(locale(), opts)}, ${time}`;
}

function show(el, on) { el.hidden = !on; }

function setError(el, msg) {
  el.textContent = msg || "";
  show(el, !!msg);
}

// el builds an element: el("span", {className: "x"}, "text", child, ...).
function el(tag, props, ...children) {
  const node = document.createElement(tag);
  if (props) Object.assign(node, props);
  for (const c of children) if (c != null && c !== false) node.append(c);
  return node;
}

function metaLine(target, parts) {
  target.replaceChildren(...parts.filter(Boolean).map((p) => el("span", null, p)));
}

// fillSelect replaces the options of select and keeps the current value
// when it is still offered (else want, else the first option).
function fillSelect(select, options, want) {
  const prev = select.value;
  select.replaceChildren(...options.map(([value, label]) => new Option(label, String(value))));
  const has = (v) => v != null && options.some(([o]) => String(o) === String(v));
  if (has(prev)) select.value = prev;
  else if (has(want)) select.value = String(want);
}

const ICONS = {
  playlist: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h11M4 11h11M4 16h6"/><path d="M15 14.5v6l5-3z" fill="currentColor"/></svg>',
  chevron: '<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
};
function icon(name) {
  const span = document.createElement("span");
  span.innerHTML = ICONS[name];
  return span.firstElementChild;
}

// ---- Views and language ----------------------------------------------------

function setView(view) {
  state.view = view;
  document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === view)));
  show($("view-download"), view === "download");
  show($("view-history"), view === "history");
  if (view === "history") loadHistory();
  if (view === "download") $("url").focus();
}

document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
$("home").addEventListener("click", (e) => { e.preventDefault(); setView("download"); });
$("history-start").addEventListener("click", () => setView("download"));

function setLang(l) {
  lang = l;
  store("lang", l);
  applyStatic();
  if (!state.fetching) $("fetch").textContent = t("fetch");
  if (state.info) {
    renderInfoMeta();
    renderFormats();
    updateSummary();
  }
  state.jobs.forEach(renderJob);
  renderQueueMeta();
  renderHistory();
}

document.querySelectorAll("#lang button").forEach((b) => b.addEventListener("click", () => setLang(b.dataset.lang)));

// ---- Fetch -----------------------------------------------------------------

async function fetchInfo(url, playlist) {
  const btn = $("fetch");
  btn.disabled = true;
  state.fetching = true;
  btn.textContent = t("fetching");
  setError($("fetch-error"), "");
  try {
    const info = await api("/api/info", { url, playlist });
    state.info = info;
    state.url = url;
    state.lastAdded = null;
    renderResult();
  } catch (e) {
    setError($("fetch-error"), e.message);
  } finally {
    btn.disabled = false;
    state.fetching = false;
    btn.textContent = t("fetch");
  }
}

$("fetch-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const url = $("url").value.trim();
  if (url) fetchInfo(url, false);
});

$("use-list").addEventListener("click", () => fetchInfo(state.url, true));

// ---- Result ----------------------------------------------------------------

function isAudio(c) { return state.audioContainers.includes(c); }
function isList() { return state.info && state.info.kind === "playlist"; }

function renderInfoMeta() {
  const info = state.info;
  if (!info) return;
  if (isList()) {
    $("list-title").textContent = info.title || t("playlist");
    metaLine($("list-meta"), [
      t("videos", { n: info.entries.length }),
      info.skipped ? t("leftOut", { n: info.skipped }) : "",
    ]);
  } else {
    metaLine($("video-meta"), [info.author, clock(info.duration)]);
  }
}

function renderResult() {
  const info = state.info;
  show($("result"), !!info);
  if (!info) return;
  const list = isList();

  show($("video-head"), !list);
  show($("list-box"), list);
  show($("subfolder-row"), list);

  if (list) {
    const ol = $("entries");
    ol.replaceChildren(...info.entries.map((e, i) => {
      const box = el("input", { type: "checkbox", checked: true });
      box.dataset.index = i;
      return el("li", null, el("label", null,
        box,
        el("span", { className: "n", textContent: i + 1 }),
        el("span", { className: "t", textContent: e.title, title: e.title }),
        el("span", { className: "d", textContent: clock(e.duration) })));
    }));
  } else {
    $("thumb").src = info.thumbnail;
    $("video-title").textContent = info.title;
    show($("use-list"), !!info.inList);
  }
  renderInfoMeta();
  renderFormats();
  updateSummary();
}

function renderFormats() {
  const box = $("formats");
  box.replaceChildren();
  const add = (c) => {
    const b = el("button", { type: "button", textContent: c, title: isAudio(c) ? t("formatAudio") : t("formatVideo") });
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(c === state.format));
    b.addEventListener("click", () => {
      state.format = c;
      store("format", c);
      renderFormats();
    });
    box.append(b);
  };
  box.append(el("span", { className: "group-label", textContent: t("formatsVideo") }));
  state.videoContainers.forEach(add);
  box.append(el("span", { className: "gap" }), el("span", { className: "group-label", textContent: t("formatsAudio") }));
  state.audioContainers.forEach(add);

  const audio = isAudio(state.format);
  show($("h264-row"), !audio && state.format !== "webm" && !(state.app && !state.ffmpeg));
  if (audio || state.format === "webm") $("h264").checked = false;
  renderQualities();
  renderFFmpegWarning();
}

function renderQualities() {
  const info = state.info;
  if (!info) return;
  const c = state.format;
  const audio = isAudio(c);
  const mp3 = c === "mp3";
  const list = isList();

  // Single video: the exact streams of this video.
  show($("quality"), !list && !(audio && mp3));
  if (!list) {
    const h264 = $("h264").checked;
    const streams = (formats, keep) => [["0", t("bestAvailable")], ...formats.filter(keep).map((f) => [f.itag, f.label])];
    show($("video-q-field"), !audio);
    fillSelect($("video-q"), streams(info.video, (f) => h264 || f.fits.includes(c)));
    // mp3 re-encodes any audio; everything else copies the stream as is.
    fillSelect($("audio-q"), streams(info.audio, (f) => mp3 || f.fits.includes(c)));
  }

  // Playlist: presets applied to every video.
  show($("presets"), list && !(audio && mp3));
  if (list) {
    show($("max-res-field"), !audio);
    fillSelect($("max-res"), RESOLUTIONS.map((h) => [h, t(h ? "res" + h : "resBest")]), recall("maxRes") || 0);
    show($("audio-level-field"), !mp3);
    fillSelect($("audio-level"), AUDIO_LEVELS.map((l) => [l, t("audio" + l[0].toUpperCase() + l.slice(1))]), recall("audioLevel") || "best");
  }

  // MP3: the bitrate of the converted file.
  show($("mp3-field"), mp3);
  if (mp3) {
    fillSelect($("mp3-bitrate"), state.mp3Bitrates.map((k) => [k, k ? t("mp3Kbps", { n: k }) + (k === 128 ? " " + t("mp3Hint128") : "") : t("mp3Best")]), recall("mp3Bitrate") || 0);
  }

  const hints = [];
  if (list && !audio) hints.push(t("hintPresetVideo"));
  if (list && !mp3) hints.push(t("hintPresetAudio"));
  if (mp3) hints.push(t("hintMp3"));
  $("quality-hint").textContent = hints.join(" ");
  show($("quality-hint"), hints.length > 0);
}

$("h264").addEventListener("change", () => { renderQualities(); renderFFmpegWarning(); });
$("max-res").addEventListener("change", () => store("maxRes", $("max-res").value));
$("audio-level").addEventListener("change", () => store("audioLevel", $("audio-level").value));
$("mp3-bitrate").addEventListener("change", () => store("mp3Bitrate", $("mp3-bitrate").value));

function needsFFmpeg() { return state.format === "mp3" || $("h264").checked; }

function renderFFmpegWarning() {
  const warn = $("ffmpeg-warn");
  if (needsFFmpeg() && !state.ffmpeg) {
    warn.textContent = t("ffmpegMissing", { what: state.format === "mp3" ? "MP3" : "H.264", hint: state.ffmpegHint });
    show(warn, true);
  } else {
    show(warn, false);
  }
}

function selectedEntries() {
  const info = state.info;
  if (info.kind !== "playlist") return [{ id: info.id, title: info.title }];
  return [...$("entries").querySelectorAll("input:checked")].map((b) => info.entries[+b.dataset.index]);
}

function updateSummary() {
  if (!state.info) return;
  const n = selectedEntries().length;
  let text = "";
  if (state.lastAdded) text = t("added", state.lastAdded);
  else if (isList()) text = t("selected", { n, total: state.info.entries.length });
  $("dl-summary").textContent = text;
  $("download").disabled = n === 0;
}

function setAll(on) {
  $("entries").querySelectorAll("input").forEach((b) => { b.checked = on; });
  state.lastAdded = null;
  updateSummary();
}
$("select-all").addEventListener("click", () => setAll(true));
$("select-none").addEventListener("click", () => setAll(false));
$("entries").addEventListener("change", () => { state.lastAdded = null; updateSummary(); });

$("outdir").addEventListener("change", () => store("outdir", $("outdir").value.trim()));

$("download").addEventListener("click", async () => {
  const info = state.info;
  const items = selectedEntries();
  const btn = $("download");
  const c = state.format;
  btn.disabled = true;
  setError($("dl-error"), "");
  const list = info.kind === "playlist";
  const body = {
    items,
    format: c,
    h264: $("h264").checked,
    outputDir: $("outdir").value.trim(),
    folder: list && $("subfolder").checked ? info.title : "",
    listId: list ? info.id : "",
    listTitle: list ? info.title : "",
  };
  if (c === "mp3") body.mp3Bitrate = +$("mp3-bitrate").value;
  if (!list) {
    body.videoItag = isAudio(c) ? 0 : +$("video-q").value;
    body.audioItag = c === "mp3" ? 0 : +$("audio-q").value;
  } else {
    body.maxHeight = isAudio(c) ? 0 : +$("max-res").value;
    if (c !== "mp3") body.audioQuality = $("audio-level").value;
  }
  try {
    const res = await api("/api/download", body);
    state.lastAdded = { n: res.jobs.length, folder: res.folder };
    updateSummary();
  } catch (e) {
    setError($("dl-error"), e.message);
  } finally {
    btn.disabled = false;
  }
});

// ---- Queue -----------------------------------------------------------------

const statusKey = {
  queued: "stQueued",
  downloading: "stDownloading",
  converting: "stConverting",
  saving: "stSaving",
  saved: "stSaved",
  failed: "stFailed",
  cancelled: "stCancelled",
};
const finished = (j) => j.status === "saved" || j.status === "failed" || j.status === "cancelled";

function jobElement(job) {
  let li = document.getElementById("job-" + job.id);
  if (li) return li;
  const cancel = el("button", { className: "quiet cancel", type: "button" });
  const open = el("button", { className: "quiet open", type: "button" });
  cancel.addEventListener("click", () => api("/api/cancel", { id: job.id }).catch(() => {}));
  open.addEventListener("click", () => api("/api/open", { id: job.id }).catch((e) => alert(e.message)));
  li = el("li", { id: "job-" + job.id, className: "job" },
    el("div", { className: "job-top" }, el("span", { className: "job-title" }), el("span", { className: "job-status" })),
    el("div", { className: "bar" }, el("i")),
    el("div", { className: "job-sub" }, el("span", { className: "detail" }), cancel, open),
    el("p", { className: "err", hidden: true }));
  $("queue").append(li);
  return li;
}

function renderJob(job) {
  const li = jobElement(job);
  li.dataset.status = job.status;
  const title = li.querySelector(".job-title");
  title.textContent = job.title;
  title.title = job.group ? `${job.title} (${job.group})` : job.title;
  const st = statusKey[job.status] ? t(statusKey[job.status]) : job.status;
  li.querySelector(".job-status").textContent = `${st} · ${job.format}`;
  li.querySelector(".bar > i").style.width = `${Math.round((job.progress || 0) * 100)}%`;
  li.querySelector(".detail").textContent = [job.quality, translateServer(job.detail || "")].filter(Boolean).join(" · ");
  const cancel = li.querySelector(".cancel"), open = li.querySelector(".open");
  cancel.textContent = t("cancel");
  open.textContent = t("showInFolder");
  show(cancel, !finished(job));
  show(open, job.status === "saved" && !!job.path);
  setError(li.querySelector(".err"), job.status === "failed" ? translateServer(job.error) : "");
}

function renderQueueMeta() {
  const jobs = [...state.jobs.values()];
  show($("queue-empty"), jobs.length === 0);
  const saved = jobs.filter((j) => j.status === "saved").length;
  const failed = jobs.filter((j) => j.status === "failed").length;
  let text = jobs.length ? t("savedCount", { saved, total: jobs.length }) : "";
  if (failed) text += " · " + t("failedCount", { n: failed });
  $("queue-count").textContent = text;
  show($("cancel-all"), jobs.some((j) => !finished(j)));
  show($("clear"), jobs.some(finished));
}

function resetJobs(list) {
  state.jobs = new Map(list.map((j) => [j.id, j]));
  $("queue").replaceChildren();
  list.forEach(renderJob);
  renderQueueMeta();
}

$("cancel-all").addEventListener("click", () => api("/api/cancel", { id: "" }).catch(() => {}));
$("clear").addEventListener("click", () => api("/api/clear", {}).catch(() => {}));

// ---- History ---------------------------------------------------------------

async function loadHistory() {
  if (!state.historyOn) {
    setError($("history-error"), t("historyOff"));
    return;
  }
  try {
    const res = await api("/api/history");
    state.history = res.entries || [];
    state.historyLoaded = true;
    setError($("history-error"), "");
  } catch (e) {
    setError($("history-error"), e.message);
  }
  renderHistory();
}

// groupHistory puts the files of one playlist together; a single video is
// its own group. Groups are ordered by their newest file.
function groupHistory(entries) {
  const groups = [];
  const byKey = new Map();
  for (const e of entries) {
    const key = e.listId ? "list:" + e.listId : "file:" + e.id;
    let g = byKey.get(key);
    if (!g) {
      g = { key, list: !!e.listId, title: e.listTitle || e.title, entries: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    g.entries.push(e);
  }
  return groups;
}

function matches(e, q) {
  return [e.title, e.listTitle, e.folder, e.format, e.quality].some((v) => v && v.toLowerCase().includes(q));
}

function filesLabel(n) { return n === 1 ? t("oneFile") : t("nFiles", { n }); }

function renderHistory() {
  const all = state.history;
  const total = all.reduce((sum, e) => sum + (e.size || 0), 0);
  const lists = new Set(all.filter((e) => e.listId).map((e) => e.listId)).size;
  const count = $("history-count");
  count.textContent = all.length;
  show(count, all.length > 0);
  $("history-summary").textContent = all.length
    ? t("historySummary", {
      files: filesLabel(all.length),
      lists: lists === 0 ? t("noPlaylists") : lists === 1 ? t("onePlaylist") : t("nPlaylists", { n: lists }),
      size: formatSize(total),
    })
    : "";
  show($("history-clear"), all.length > 0);
  show($("history-search"), all.length > 0);
  show($("history-empty"), state.historyLoaded && all.length === 0);

  const q = $("history-search").value.trim().toLowerCase();
  const shown = q ? all.filter((e) => matches(e, q)) : all;
  show($("history-nomatch"), !!q && shown.length === 0);

  const groups = groupHistory(shown);
  if (!q && state.openGroups.size === 0 && groups.length && groups[0].list) state.openGroups.add(groups[0].key);
  $("history-list").replaceChildren(...groups.map((g) => (g.list ? playlistGroup(g, !!q) : fileRow(g.entries[0], null))));
}

function playlistGroup(g, forceOpen) {
  const newest = g.entries[0];
  const folder = newest.folder;
  const size = g.entries.reduce((sum, e) => sum + (e.size || 0), 0);

  const openBtn = el("button", { className: "quiet", type: "button", textContent: t("openFolder") });
  openBtn.addEventListener("click", (ev) => { ev.preventDefault(); openEntry(g.entries.find((e) => e.exists) || newest); });
  const removeBtn = el("button", { className: "quiet danger", type: "button", textContent: t("removeGroup"), title: t("removeTitle") });
  removeBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    if (confirm(t("confirmRemoveGroup", { title: g.title, n: g.entries.length }))) removeEntries(g.entries.map((e) => e.id));
  });

  const meta = el("p", { className: "meta" });
  metaLine(meta, [filesLabel(g.entries.length), formatSize(size), t("lastSaved", { when: when(newest.savedAt) })]);
  const where = whereLine(folder);

  const head = el("summary", { className: "group-head" },
    el("span", { className: "group-icon" }, icon("playlist")),
    el("span", { className: "group-text" },
      el("span", { className: "group-title", textContent: g.title, title: g.title }), meta, where),
    el("span", { className: "group-actions" }, openBtn, removeBtn, icon("chevron")));

  const body = el("div", { className: "group-body" }, ...g.entries.map((e) => fileRow(e, folder)));
  const details = el("details", { className: "group", open: forceOpen || state.openGroups.has(g.key) }, head, body);
  details.addEventListener("toggle", () => {
    if (details.open) state.openGroups.add(g.key);
    else state.openGroups.delete(g.key);
  });
  return details;
}

// whereLine shows the folder; long paths lose their start, so the end
// (the folder's own name) stays readable.
function whereLine(folder) {
  return el("p", { className: "where", title: folder },
    el("span", { className: "where-label", textContent: t("savedIn") }),
    el("span", { className: "where-path" }, el("bdi", { textContent: folder })));
}

// fileRow is one saved file. groupFolder hides the folder when it is the
// same as the playlist's.
function fileRow(e, groupFolder) {
  const audio = state.audioContainers.includes(e.format);
  const meta = el("p", { className: "meta" });
  metaLine(meta, [e.quality, formatSize(e.size), when(e.savedAt)]);

  const text = el("div", { className: "file-text" },
    el("span", { className: "file-title", textContent: e.title, title: e.title }), meta);
  if (!e.exists) {
    text.append(el("p", { className: "missing", textContent: t("missing") }));
  }
  if (e.folder !== groupFolder) {
    text.append(whereLine(e.folder));
  }

  const open = el("button", { className: "quiet", type: "button", textContent: e.exists ? t("showInFolder") : t("openFolder") });
  open.addEventListener("click", () => openEntry(e));
  const remove = el("button", { className: "quiet", type: "button", textContent: t("remove"), title: t("removeTitle") });
  remove.addEventListener("click", () => removeEntries([e.id]));

  return el("div", { className: "file" },
    el("span", { className: "fmt " + (audio ? "audio" : "video"), textContent: e.format }),
    text,
    el("div", { className: "file-actions" }, open, remove));
}

async function openEntry(e) {
  try {
    await api("/api/history/open", { id: e.id });
  } catch (err) {
    setError($("history-error"), err.message);
  }
}

async function removeEntries(ids) {
  try {
    await api("/api/history/remove", { ids });
    state.history = state.history.filter((e) => !ids.includes(e.id));
    renderHistory();
  } catch (err) {
    setError($("history-error"), err.message);
  }
}

$("history-search").addEventListener("input", renderHistory);
$("history-clear").addEventListener("click", async () => {
  if (!confirm(t("confirmClear"))) return;
  try {
    await api("/api/history/clear", {});
    state.history = [];
    state.openGroups.clear();
    renderHistory();
  } catch (err) {
    setError($("history-error"), err.message);
  }
});

// ---- Live updates ----------------------------------------------------------

function connectEvents() {
  const es = new EventSource("/api/events?token=" + encodeURIComponent(token));
  es.addEventListener("open", () => show($("offline"), false));
  es.addEventListener("reset", (e) => resetJobs(JSON.parse(e.data) || []));
  es.addEventListener("job", (e) => {
    const job = JSON.parse(e.data);
    state.jobs.set(job.id, job);
    renderJob(job);
    renderQueueMeta();
  });
  es.addEventListener("history", (e) => {
    const entry = JSON.parse(e.data);
    if (!state.history.some((h) => h.id === entry.id)) state.history.unshift(entry);
    renderHistory();
  });
  es.addEventListener("error", () => show($("offline"), true));
}

// ---- Start -----------------------------------------------------------------

$("quit").addEventListener("click", async () => {
  if ([...state.jobs.values()].some((j) => !finished(j)) && !confirm(t("confirmQuit"))) return;
  await api("/api/quit", {}).catch(() => {});
  const main = el("main", { className: "view" },
    el("section", { className: "empty-state" },
      el("img", { src: "logo.svg", alt: "", width: 48, height: 48 }),
      el("h1", { className: "view-title", textContent: t("stopped") }),
      el("p", { textContent: t("closeTab") })));
  document.body.replaceChildren(main);
});

async function init() {
  lang = initialLang(recall("lang"));
  applyStatic();
  if (!token) {
    setError($("fetch-error"), t("noToken"));
    return;
  }
  try {
    const s = await api("/api/state");
    $("version").textContent = s.version ? "v" + s.version : "";
    state.videoContainers = s.videoContainers;
    state.audioContainers = s.audioContainers;
    if (Array.isArray(s.mp3Bitrates)) state.mp3Bitrates = s.mp3Bitrates;
    state.historyOn = s.history !== false;
    state.ffmpeg = s.ffmpeg;
    state.ffmpegHint = s.ffmpegHint;
    state.app = s.app === true;
    if (state.app) enterAppMode();
    const fmt = recall("format");
    if (fmt && (s.videoContainers.includes(fmt) || s.audioContainers.includes(fmt))) state.format = fmt;
    $("outdir").value = (state.app ? null : recall("outdir")) || s.outputDir;
    $("outdir").readOnly = state.app;
    resetJobs(s.jobs || []);
  } catch (e) {
    setError($("fetch-error"), e.message);
    return;
  }
  connectEvents();
  loadHistory();
  if (!takeSharedLink()) $("url").focus();
}

// Inside the Android app: the app owns the server, so there is no Quit, and
// the texts talk about "this device".
function enterAppMode() {
  document.documentElement.classList.add("in-app");
  show($("quit"), false);
  document.querySelector(".intake-sub").dataset.i18n = "intakeSubApp";
  document.querySelector(".history-note").dataset.i18n = "historyNoteApp";
  applyStatic();
}

// A link shared to the app from YouTube arrives as ?share=; fetch it right away.
function takeSharedLink() {
  const params = new URLSearchParams(location.search);
  const shared = params.get("share");
  if (!shared) return false;
  params.delete("share");
  history.replaceState(null, "", location.pathname + "?" + params.toString());
  $("url").value = shared;
  fetchInfo(shared, false);
  return true;
}

init();
