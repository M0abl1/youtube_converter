"use strict";

// Interface texts in English and Brazilian Portuguese. {name} placeholders
// are filled by t(key, {name: value}).
const MESSAGES = {
  en: {
    quit: "Quit",
    quitTitle: "Stop ytconv",
    offline: "ytconv is not running anymore. Start it again to keep downloading.",
    linkLabel: "YouTube link",
    linkPlaceholder: "Paste a YouTube video or playlist link",
    fetch: "Fetch",
    fetching: "Fetching…",
    useList: "This video is part of a playlist — download the whole playlist instead",
    all: "All",
    none: "None",
    format: "Format",
    formatVideo: "Video with audio",
    formatAudio: "Audio only",
    h264: "Re-encode video to H.264 so it plays everywhere",
    h264Note: "(slower, needs ffmpeg)",
    videoQuality: "Video quality",
    audioQuality: "Audio quality",
    bestAvailable: "Best available",
    maxRes: "Maximum resolution",
    resBest: "Best available",
    res2160: "2160p (4K)",
    res1440: "1440p (2K)",
    res1080: "1080p (Full HD)",
    res720: "720p (HD)",
    res480: "480p",
    res360: "360p",
    res240: "240p",
    res144: "144p",
    audioBest: "Best (largest file)",
    audioMedium: "Medium",
    audioLow: "Smallest file",
    mp3Bitrate: "MP3 bitrate",
    mp3Best: "Best (VBR, ~245 kbps)",
    mp3Kbps: "{n} kbps",
    mp3Hint128: "(smallest)",
    hintPresetVideo: "Each video gets the best stream up to the chosen resolution; videos that are only available in a higher resolution use the smallest one they have.",
    hintPresetAudio: "Each video gets the best, a medium or the smallest audio stream YouTube offers for this format.",
    hintMp3: "The audio is converted to MP3 with ffmpeg at the chosen bitrate.",
    saveTo: "Save to",
    subfolder: "Put the playlist in its own folder",
    download: "Download",
    downloads: "Downloads",
    cancelAll: "Cancel all",
    clearFinished: "Clear finished",
    queueEmpty: "Nothing here yet. Fetch a link above to start.",
    playlist: "Playlist",
    videos: "{n} videos",
    leftOut: "{n} private or deleted left out",
    selected: "{n} of {total} selected",
    added: "Added {n} to the queue · {folder}",
    savedCount: "{saved} of {total} saved",
    failedCount: "{n} failed",
    cancel: "Cancel",
    showInFolder: "Show in folder",
    alreadyDownloaded: "already downloaded",
    stQueued: "Queued",
    stDownloading: "Downloading",
    stConverting: "Converting",
    stSaving: "Saving",
    stSaved: "Saved",
    stFailed: "Failed",
    stCancelled: "Cancelled",
    ffmpegMissing: "{what} needs ffmpeg, which was not found. Install it with “{hint}”, then restart ytconv.",
    confirmQuit: "Downloads are still running. Stop ytconv anyway?",
    stopped: "ytconv stopped",
    closeTab: "You can close this tab.",
    noToken: "This page must be opened from ytconv (run “ytconv gui”).",
    unreachable: "Could not reach ytconv. Is it still running?",
    requestFailed: "Request failed (HTTP {status})",
  },
  pt: {
    quit: "Sair",
    quitTitle: "Encerrar o ytconv",
    offline: "O ytconv não está mais rodando. Abra de novo para continuar baixando.",
    linkLabel: "Link do YouTube",
    linkPlaceholder: "Cole o link de um vídeo ou playlist do YouTube",
    fetch: "Buscar",
    fetching: "Buscando…",
    useList: "Este vídeo faz parte de uma playlist — baixar a playlist inteira",
    all: "Todos",
    none: "Nenhum",
    format: "Formato",
    formatVideo: "Vídeo com áudio",
    formatAudio: "Só áudio",
    h264: "Converter o vídeo para H.264 para tocar em qualquer aparelho",
    h264Note: "(mais lento, precisa do ffmpeg)",
    videoQuality: "Qualidade do vídeo",
    audioQuality: "Qualidade do áudio",
    bestAvailable: "Melhor disponível",
    maxRes: "Resolução máxima",
    resBest: "Melhor disponível",
    res2160: "2160p (4K)",
    res1440: "1440p (2K)",
    res1080: "1080p (Full HD)",
    res720: "720p (HD)",
    res480: "480p",
    res360: "360p",
    res240: "240p",
    res144: "144p",
    audioBest: "Melhor (arquivo maior)",
    audioMedium: "Média",
    audioLow: "Arquivo menor",
    mp3Bitrate: "Taxa de bits do MP3",
    mp3Best: "Melhor (VBR, ~245 kbps)",
    mp3Kbps: "{n} kbps",
    mp3Hint128: "(menor)",
    hintPresetVideo: "Cada vídeo é baixado na melhor qualidade até a resolução escolhida; vídeos que só existem em resolução maior usam a menor que tiverem.",
    hintPresetAudio: "Cada vídeo usa o melhor, um médio ou o menor áudio que o YouTube oferece para este formato.",
    hintMp3: "O áudio é convertido para MP3 com o ffmpeg na taxa de bits escolhida.",
    saveTo: "Salvar em",
    subfolder: "Colocar a playlist numa pasta própria",
    download: "Baixar",
    downloads: "Downloads",
    cancelAll: "Cancelar todos",
    clearFinished: "Limpar concluídos",
    queueEmpty: "Nada por aqui ainda. Busque um link acima para começar.",
    playlist: "Playlist",
    videos: "{n} vídeos",
    leftOut: "{n} privados ou excluídos ignorados",
    selected: "{n} de {total} selecionados",
    added: "{n} adicionados à fila · {folder}",
    savedCount: "{saved} de {total} salvos",
    failedCount: "{n} com erro",
    cancel: "Cancelar",
    showInFolder: "Mostrar na pasta",
    alreadyDownloaded: "já baixado",
    stQueued: "Na fila",
    stDownloading: "Baixando",
    stConverting: "Convertendo",
    stSaving: "Salvando",
    stSaved: "Salvo",
    stFailed: "Erro",
    stCancelled: "Cancelado",
    ffmpegMissing: "{what} precisa do ffmpeg, que não foi encontrado. Instale com “{hint}” e abra o ytconv de novo.",
    confirmQuit: "Ainda há downloads em andamento. Encerrar o ytconv mesmo assim?",
    stopped: "ytconv encerrado",
    closeTab: "Você já pode fechar esta aba.",
    noToken: "Esta página precisa ser aberta pelo ytconv (rode “ytconv gui”).",
    unreachable: "Não foi possível falar com o ytconv. Ele ainda está rodando?",
    requestFailed: "A requisição falhou (HTTP {status})",
  },
};

// Messages that come from the server (and from YouTube through it) are in
// English; these patterns translate the known ones. $1… are regex groups.
const SERVER_MESSAGES_PT = [
  [/^paste a YouTube link first$/, "Cole um link do YouTube primeiro."],
  [/^could not find a YouTube video ID in the given URL$/, "Não encontrei um vídeo do YouTube nesse link."],
  [/^could not find a YouTube playlist ID in the given URL$/, "Não encontrei uma playlist do YouTube nesse link."],
  [/^YouTube mixes \(list=RD\.\.\.\) are generated per viewer/, "Mixes do YouTube (list=RD…) são gerados para cada pessoa e não podem ser baixados como playlist."],
  [/^playlist not found \(it may be private or deleted\)$/, "Playlist não encontrada (pode ser privada ou ter sido excluída)."],
  [/^playlist unavailable: (.*)$/, "Playlist indisponível: $1"],
  [/^the playlist has no playable videos$/, "A playlist não tem vídeos que possam ser baixados."],
  [/^live streams are not supported$/, "Transmissões ao vivo não são suportadas."],
  [/^YouTube returned no downloadable streams for this video$/, "O YouTube não ofereceu nenhum arquivo para baixar deste vídeo."],
  [/^video unavailable: (.*)$/, "Vídeo indisponível: $1"],
  [/^could not start a YouTube session/, "Não foi possível conectar ao YouTube. Verifique sua internet."],
  [/^YouTube refused the download \(HTTP 403\)/, "O YouTube recusou o download (HTTP 403). O link pode ter expirado; tente de novo."],
  [/^nothing selected$/, "Nenhum vídeo selecionado."],
  [/^the folder must be a full path, like (.*)$/, "A pasta precisa ser um caminho completo, como $1"],
  [/^cannot use folder (.*?): (.*)$/, "Não foi possível usar a pasta $1: $2"],
  [/^download queue is full$/, "A fila de downloads está cheia."],
  [/^no valid video IDs$/, "Nenhum vídeo válido."],
  [/^this download has no file yet$/, "Este download ainda não tem arquivo."],
  [/^(\S+) needs ffmpeg, which was not found\. Install it with: (.*)$/, "$1 precisa do ffmpeg, que não foi encontrado. Instale com: $2"],
  [/^no video streams can be saved as (\S+)/, "Nenhum vídeo pode ser salvo como $1 sem conversão; tente o formato mkv."],
  [/^no audio streams can be saved as (\S+)/, "Nenhum áudio pode ser salvo como $1."],
  [/^download failed after (\d+) attempts: (.*)$/, "O download falhou depois de $1 tentativas: $2"],
  [/^already downloaded$/, "já baixado"],
];

const LANGS = ["pt", "en"];
let lang = "en";

function t(key, params) {
  let s = (MESSAGES[lang] && MESSAGES[lang][key]) || MESSAGES.en[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

// translateServer turns a known English server message into the current language.
function translateServer(msg) {
  if (!msg || lang !== "pt") return msg;
  for (const [re, pt] of SERVER_MESSAGES_PT) {
    if (re.test(msg)) return msg.replace(re, pt);
  }
  return msg;
}

// applyStatic translates the elements marked with data-i18n attributes.
function applyStatic() {
  document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll("#lang button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.lang === lang)));
}

function initialLang(saved) {
  if (LANGS.includes(saved)) return saved;
  const prefs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "en"];
  return prefs.some((l) => String(l).toLowerCase().startsWith("pt")) ? "pt" : "en";
}
