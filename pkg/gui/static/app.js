"use strict";

// The token is in the URL ytconv opened; every API call must carry it.
const token = new URLSearchParams(location.search).get("token") || "";
const $ = (id) => document.getElementById(id);

const state = {
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

function show(el, on) { el.hidden = !on; }

function setError(el, msg) {
  el.textContent = msg || "";
  show(el, !!msg);
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

// ---- Language --------------------------------------------------------------

function setLang(l) {
  lang = l;
  store("lang", l);
  applyStatic();
  if (!state.fetching) $("fetch").textContent = t("fetch");
  if (state.info) {
    renderListMeta();
    renderFormats();
    updateSummary();
  }
  state.jobs.forEach(renderJob);
  renderQueueMeta();
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

function renderListMeta() {
  const info = state.info;
  if (!isList()) return;
  $("list-title").textContent = info.title || t("playlist");
  let meta = t("videos", { n: info.entries.length });
  if (info.skipped) meta += " · " + t("leftOut", { n: info.skipped });
  $("list-meta").textContent = meta;
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
    renderListMeta();
    const ol = $("entries");
    ol.replaceChildren();
    info.entries.forEach((e, i) => {
      const li = document.createElement("li");
      const label = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = true;
      box.dataset.index = i;
      box.addEventListener("change", updateSummary);
      const n = document.createElement("span");
      n.className = "n";
      n.textContent = i + 1;
      const ti = document.createElement("span");
      ti.className = "t";
      ti.textContent = e.title;
      ti.title = e.title;
      const d = document.createElement("span");
      d.className = "d";
      d.textContent = clock(e.duration);
      label.append(box, n, ti, d);
      li.append(label);
      ol.append(li);
    });
  } else {
    $("thumb").src = info.thumbnail;
    $("video-title").textContent = info.title;
    $("video-meta").textContent = [info.author, clock(info.duration)].filter(Boolean).join(" · ");
    show($("use-list"), !!info.inList);
  }
  renderFormats();
  updateSummary();
}

function renderFormats() {
  const box = $("formats");
  box.replaceChildren();
  const add = (c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = c;
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(c === state.format));
    b.title = isAudio(c) ? t("formatAudio") : t("formatVideo");
    b.addEventListener("click", () => {
      state.format = c;
      store("format", c);
      renderFormats();
    });
    box.append(b);
  };
  state.videoContainers.forEach(add);
  const sep = document.createElement("span");
  sep.className = "sep";
  box.append(sep);
  state.audioContainers.forEach(add);

  const audio = isAudio(state.format);
  show($("h264-row"), !audio && state.format !== "webm");
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
  const body = {
    items,
    format: c,
    h264: $("h264").checked,
    outputDir: $("outdir").value.trim(),
    folder: info.kind === "playlist" && $("subfolder").checked ? info.title : "",
  };
  if (c === "mp3") body.mp3Bitrate = +$("mp3-bitrate").value;
  if (info.kind === "video") {
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
  li = document.createElement("li");
  li.id = "job-" + job.id;
  li.className = "job";
  li.innerHTML = `
    <div class="job-top"><span class="job-title"></span><span class="job-status"></span></div>
    <div class="bar"><i></i></div>
    <div class="job-sub"><span class="detail"></span><button class="ghost cancel" type="button"></button><button class="ghost open" type="button"></button></div>
    <p class="err" hidden></p>`;
  li.querySelector(".cancel").addEventListener("click", () => api("/api/cancel", { id: job.id }).catch(() => {}));
  li.querySelector(".open").addEventListener("click", () => api("/api/open", { id: job.id }).catch((e) => alert(e.message)));
  $("queue").append(li);
  return li;
}

function renderJob(job) {
  const li = jobElement(job);
  li.dataset.status = job.status;
  const title = li.querySelector(".job-title");
  title.textContent = job.title;
  title.title = job.group ? `${job.title} — ${job.group}` : job.title;
  const st = statusKey[job.status] ? t(statusKey[job.status]) : job.status;
  li.querySelector(".job-status").textContent = `${st} · ${job.format}`;
  li.querySelector(".bar > i").style.width = `${Math.round((job.progress || 0) * 100)}%`;
  li.querySelector(".detail").textContent = translateServer(job.detail || "");
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
  es.addEventListener("error", () => show($("offline"), true));
}

// ---- Start -----------------------------------------------------------------

$("quit").addEventListener("click", async () => {
  if ([...state.jobs.values()].some((j) => !finished(j)) && !confirm(t("confirmQuit"))) return;
  await api("/api/quit", {}).catch(() => {});
  const main = document.createElement("main");
  main.innerHTML = '<section class="card"><h1></h1><p class="dim"></p></section>';
  main.querySelector("h1").textContent = t("stopped");
  main.querySelector("p").textContent = t("closeTab");
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
    state.ffmpeg = s.ffmpeg;
    state.ffmpegHint = s.ffmpegHint;
    const fmt = recall("format");
    if (fmt && (s.videoContainers.includes(fmt) || s.audioContainers.includes(fmt))) state.format = fmt;
    $("outdir").value = recall("outdir") || s.outputDir;
    resetJobs(s.jobs || []);
  } catch (e) {
    setError($("fetch-error"), e.message);
    return;
  }
  connectEvents();
  $("url").focus();
}

init();
