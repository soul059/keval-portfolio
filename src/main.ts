import command from '../config.json';
import { HELP_TYPES } from "./commands/help";
import { BANNER } from "./commands/banner";
import { executeCommand } from "./commands/execute";

type ThemeName = string;

interface SessionState {
  theme: ThemeName;
  reducedMotion: boolean;
  sound: boolean;
  unlockedSecret: boolean;
  visited: string[];
  guideStep: number;
  history: string[];
  usage: Record<string, number>;
  adminMode: boolean;
}

interface AdminUser {
  id: string;
  username: string;
  role: "admin";
}

interface AdminAuthState {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: AdminUser;
}

interface BlogEditorDraft {
  title: string;
  slug: string;
  excerpt: string;
  tags: string[];
  status: "draft" | "published";
  lines: string[];
  coverImage: { url: string; publicId: string } | null;
  images: Array<{ url: string; publicId: string }>;
}

interface Theme {
  bg: string;
  fg: string;
  border: string;
  banner: string;
  promptDefault: string;
  promptUser: string;
  promptHost: string;
  promptInput: string;
  linkText: string;
  linkHighlight: string;
  linkHighlightText: string;
  commandText: string;
  inputValid: string;
  inputInvalid: string;
}

const STORAGE_KEY = "webshell.session.v4";
const ANALYTICS_SESSION_KEY = "webshell.analytics.session.v1";
const ADMIN_AUTH_KEY = "webshell.admin.auth.v1";
const RESUME_BLOB_REVOKE_DELAY_MS = 60_000;
const IMAGE_PICKER_CANCEL_DELAY_MS = 150;
const fallbackTheme: Theme = {
  bg: command.colors.background,
  fg: command.colors.foreground,
  border: command.colors.border.color,
  banner: command.colors.banner,
  promptDefault: command.colors.prompt.default,
  promptUser: command.colors.prompt.user,
  promptHost: command.colors.prompt.host,
  promptInput: command.colors.prompt.input,
  linkText: command.colors.link.text,
  linkHighlight: command.colors.link.highlightColor,
  linkHighlightText: command.colors.link.highlightText,
  commandText: command.colors.commands.textColor,
  inputValid: command.colors.commands.textColor,
  inputInvalid: "#ff6b81"
};
const configThemes = command.themes as Record<string, Theme> | undefined;
const THEMES: Record<ThemeName, Theme> = configThemes && Object.keys(configThemes).length > 0
  ? configThemes
  : { default: fallbackTheme };
const DEFAULT_THEME: ThemeName = (command.defaultTheme && THEMES[command.defaultTheme])
  ? command.defaultTheme
  : (Object.keys(THEMES)[0] ?? "default");

const ANALYTICS_SESSION_ID = (() => {
  const existing = localStorage.getItem(ANALYTICS_SESSION_KEY);
  if (existing) return existing;
  const created = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(ANALYTICS_SESSION_KEY, created);
  return created;
})();

function loadAdminAuth(): AdminAuthState | null {
  const raw = localStorage.getItem(ADMIN_AUTH_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AdminAuthState;
    if (!parsed?.accessToken || !parsed?.refreshToken || !parsed?.expiresAt || !parsed?.user?.username) return null;
    if (parsed.expiresAt <= Date.now()) {
      localStorage.removeItem(ADMIN_AUTH_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(ADMIN_AUTH_KEY);
    return null;
  }
}

function persistAdminAuth(auth: AdminAuthState | null) {
  if (!auth) {
    localStorage.removeItem(ADMIN_AUTH_KEY);
    return;
  }
  localStorage.setItem(ADMIN_AUTH_KEY, JSON.stringify(auth));
}

const COMMANDS = [
  "help", "start", "about", "education", "projects", "project", "whoami", "repo", "github", "linkedin",
  "email", "resume", "history", "man", "keys", "demo", "stats", "version", "status", "hire", "book", "banner", "clear", "theme", "motion", "sound", "prefs", "ls", "cat", "open", "blogs", "blog", "quest", "secret", "sudo", "su", "admin", "rm"
];
const ALIASES: Record<string, string> = {
  gh: "github",
  li: "linkedin",
  p: "projects",
  h: "help",
  q: "quest"
};
const QUEST_STEPS = [
  { id: "about", label: "Run about" },
  { id: "projects", label: "Run projects" },
  { id: "project", label: "Run project <name>" },
  { id: "cat resume.md", label: "Run cat resume.md" },
  { id: "whoami", label: "Run whoami" },
  { id: "theme", label: "Switch theme once" },
  { id: "resume", label: "Download resume PDF" }
];

// mutWriteLines gets deleted and reassigned
let mutWriteLines = document.getElementById("write-lines");
let historyIdx = 0;
let tempInput = "";
let userInput = "";
let isSudo = false;
let isPasswordInput = false;
let passwordCounter = 0;
let passwordPromptMode: "sudo" | "su" | null = null;
let pendingSuUsername = "";
let adminAuth: AdminAuthState | null = loadAdminAuth();
let isBlogEditorMode = false;
let blogDraft: BlogEditorDraft | null = null;
let blogEditId: string | null = null;
let pendingBlogNewTitle = false;
let editorInputMode: "insert" | "command" = "insert";
let editorStatusMessage = "";
let editorLiveInput = "";
let editorCursorPos = 0;
let editorEditingLineIndex: number | null = null;
let isEditorSaving = false;
let editorOverlayEl: HTMLDivElement | null = null;
let listenersInitialized = false;
let swRegistered = false;
let blogPickerRequestId = 0;
let blogPicker: {
  action: "edit" | "view" | "publish" | "delete";
  items: Array<{ _id: string; title: string; status: string; slug: string }>;
  selectedIndex: number;
} | null = null;
let bareMode = false;
let audioCtx: AudioContext | null = null;

const WRITELINESCOPY = mutWriteLines;
const TERMINAL = document.getElementById("terminal");
const USERINPUT = document.getElementById("user-input") as HTMLInputElement;
const INPUT_HIDDEN = document.getElementById("input-hidden");
const PASSWORD = document.getElementById("password-input");
const PASSWORD_INPUT = document.getElementById("password-field") as HTMLInputElement;
const PRE_HOST = document.getElementById("pre-host");
const PRE_USER = document.getElementById("pre-user");
const HOST = document.getElementById("host");
const USER = document.getElementById("user");
const PROMPT = document.getElementById("prompt");
const MAIN = document.getElementById("main");

const SUDO_PASSWORD = command.password;
const REPO_LINK = command.repoLink;
const SOCIAL = command.social;
const BOOKING_LINK = `https://www.linkedin.com/in/${SOCIAL.linkedin}`;
const BACKEND_BASE_URL = (command as { backend?: { apiBaseUrl?: string } }).backend?.apiBaseUrl ?? "http://localhost:4000";

const VIRTUAL_FILES: Record<string, string> = {
  "resume.md": (command.resume?.fallback ?? [
    "# Resume",
    "Add your fallback resume in config.json -> resume.fallback"
  ]).join("\n"),
  "skills.md": [
    "# Skill Stack",
    "- Frontend: React, TypeScript, JavaScript, CSS",
    "- Backend: Node.js, REST APIs",
    "- Mobile: React Native",
    "- Tooling: Vite, Git, Vercel"
  ].join("\n"),
  "now.txt": "Currently improving this terminal portfolio to be unforgettable.",
  "contact.md": [
    "# Contact",
    `- Email: ${SOCIAL.email}`,
    `- GitHub: https://github.com/${SOCIAL.github}`,
    `- LinkedIn: https://www.linkedin.com/in/${SOCIAL.linkedin}`
  ].join("\n")
};

const GUIDE_STEPS = [
  { command: "about", text: "Step 1/4: Meet me." },
  { command: "projects", text: "Step 2/4: See featured work." },
  { command: "project swoosh", text: "Step 3/4: Open a deep-dive." },
  { command: "hire", text: "Step 4/4: Let us work together." }
];

const DEFAULT_SESSION: SessionState = {
  theme: DEFAULT_THEME,
  reducedMotion: false,
  sound: true,
  unlockedSecret: false,
  visited: [],
  guideStep: -1,
  history: [],
  usage: {},
  adminMode: false
};

const SESSION = loadSession();
const HISTORY: string[] = [...SESSION.history];
historyIdx = HISTORY.length;

const scrollToBottom = () => {
  if (!MAIN) return;
  MAIN.scrollTop = MAIN.scrollHeight;
};

function loadSession(): SessionState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_SESSION };
  try {
    const parsed = JSON.parse(raw) as Partial<SessionState>;
    return {
      theme: parsed.theme && parsed.theme in THEMES ? parsed.theme : DEFAULT_SESSION.theme,
      reducedMotion: Boolean(parsed.reducedMotion),
      sound: Boolean(parsed.sound),
      unlockedSecret: Boolean(parsed.unlockedSecret),
      visited: Array.isArray(parsed.visited) ? parsed.visited.filter(Boolean) : [],
      guideStep: typeof parsed.guideStep === "number" ? parsed.guideStep : -1,
      history: Array.isArray(parsed.history) ? parsed.history.filter(Boolean).slice(-80) : [],
      usage: parsed.usage && typeof parsed.usage === "object" ? parsed.usage : {},
      adminMode: false
    };
  } catch {
    console.warn("Failed to parse session state. Resetting local session.");
    localStorage.removeItem(STORAGE_KEY);
    return { ...DEFAULT_SESSION };
  }
}

function persistSession() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(SESSION));
}

function getPreferenceSnapshot() {
  return {
    theme: SESSION.theme,
    reducedMotion: SESSION.reducedMotion,
    sound: SESSION.sound
  };
}

function resetPreferences() {
  const defaults = { ...DEFAULT_SESSION };
  SESSION.theme = defaults.theme;
  SESSION.reducedMotion = defaults.reducedMotion;
  SESSION.sound = defaults.sound;
  SESSION.unlockedSecret = defaults.unlockedSecret;
  SESSION.visited = [];
  SESSION.guideStep = -1;
  SESSION.history = [];
  SESSION.usage = {};
  SESSION.adminMode = false;
  HISTORY.length = 0;
  historyIdx = 0;
  tempInput = "";
  USERINPUT.value = "";
  localStorage.removeItem(STORAGE_KEY);
  applyTheme(SESSION.theme);
  applyMotionPreference();
  updateInputState();
  persistSession();
}

function trackCommandUse(commandName: string) {
  if (!command.telemetry?.enabled) return;
  SESSION.usage[commandName] = (SESSION.usage[commandName] ?? 0) + 1;
  persistSession();
}

function applyTheme(theme: ThemeName) {
  const root = document.documentElement;
  const t = THEMES[theme];
  root.style.setProperty("--bg", t.bg);
  root.style.setProperty("--text", t.fg);
  root.style.setProperty("--border", t.border);
  root.style.setProperty("--banner-color", t.banner);
  root.style.setProperty("--prompt-default", t.promptDefault);
  root.style.setProperty("--prompt-user", t.promptUser);
  root.style.setProperty("--prompt-host", t.promptHost);
  root.style.setProperty("--prompt-input", t.promptInput);
  root.style.setProperty("--link-text", t.linkText);
  root.style.setProperty("--link-highlight-bg", t.linkHighlight);
  root.style.setProperty("--link-highlight-text", t.linkHighlightText);
  root.style.setProperty("--command-text", t.commandText);
  root.style.setProperty("--input-valid", t.inputValid);
  root.style.setProperty("--input-invalid", t.inputInvalid);
  SESSION.theme = theme;
  persistSession();
}

function applyMotionPreference() {
  document.body.classList.toggle("reduced-motion", SESSION.reducedMotion);
}

function ensureEditorOverlay() {
  if (editorOverlayEl && editorOverlayEl.isConnected && editorOverlayEl.parentElement === TERMINAL) return editorOverlayEl;
  if (editorOverlayEl && !editorOverlayEl.isConnected) editorOverlayEl = null;
  if (!TERMINAL) return null;
  const overlay = document.createElement("div");
  overlay.id = "editor-overlay";
  overlay.style.display = "none";
  TERMINAL.prepend(overlay);
  editorOverlayEl = overlay;
  return overlay;
}

function renderEditorOverlay() {
  const overlay = ensureEditorOverlay();
  if (!overlay) return;
  if (blogPicker) {
    renderBlogPicker();
    return;
  }
  if (!isBlogEditorMode || !blogDraft) {
    overlay.style.display = "none";
    overlay.innerHTML = "";
    return;
  }
  overlay.style.display = "block";
  const lines = blogDraft.lines.length > 0 ? blogDraft.lines : [""];
  const modeLabel = editorInputMode === "insert" ? "-- INSERT --" : "-- COMMAND --";
  const status = editorStatusMessage || `:${editorInputMode === "command" ? "ready" : "type text, Esc for command mode"}`;
  const clampedCursor = Math.max(0, Math.min(editorCursorPos, editorLiveInput.length));
  const before = escapeHtml(editorLiveInput.slice(0, clampedCursor));
  const currentChar = editorLiveInput.charAt(clampedCursor);
  const caretChar = escapeHtml(currentChar || " ");
  const after = escapeHtml(editorLiveInput.slice(Math.min(clampedCursor + 1, editorLiveInput.length)));
  const cmdPrefix = editorInputMode === "command" ? ":" : "";
  overlay.innerHTML = [
    "<div class='editor-header'>",
    `  "${blogDraft.slug}.md" ${blogEditId ? "[EDIT]" : "[NEW]"}  ${blogDraft.status.toUpperCase()}`,
    "</div>",
    "<div class='editor-body'>",
    ...lines.map((line, idx) => `<div class='editor-line ${editorEditingLineIndex === idx ? "editor-line-editing" : ""}'><span class='editor-lineno'>${String(idx + 1).padStart(3, " ")}</span> ${line ? renderMarkdownLine(line) : "&nbsp;"}</div>`),
    `<div class='editor-cmdline'>${cmdPrefix}${before}<span class='editor-caret'>${caretChar}</span>${after}</div>`,
    "</div>",
    `<div class='editor-status'><span>${modeLabel}</span><span>${status}</span></div>`
  ].join("");
}

function setEditorStatus(message: string) {
  editorStatusMessage = message;
  renderEditorOverlay();
}

function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeBlogTitle(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function isValidBlogTitle(value: string) {
  return value.length >= 3 && value.length <= 120;
}

function isValidImageUrlCandidate(value: string) {
  try {
    const parsed = new URL(value);
    if (!(parsed.protocol === "http:" || parsed.protocol === "https:")) return false;
    const ext = parsed.pathname.toLowerCase();
    return /\.(png|jpe?g|gif|webp|avif|svg)$/.test(ext) || parsed.pathname.length > 1;
  } catch {
    return false;
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttr(value: string) {
  return escapeHtml(value)
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderCoverImage(url: string | null | undefined, altText: string) {
  if (!url) return [];
  const safeUrl = escapeHtmlAttr(url);
  const safeAlt = escapeHtmlAttr(altText);
  return [
    "<div class='blog-cover'>",
    `  <a href='${safeUrl}' target='_blank' rel='noreferrer'>`,
    `    <img class='blog-cover-image' src='${safeUrl}' alt='${safeAlt}' loading='lazy' />`,
    "  </a>",
    "</div>"
  ];
}

function parseMarkdownImageLine(line: string) {
  const match = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
  if (!match) return null;
  return { alt: match[1], url: match[2] };
}

function renderMarkdownLine(line: string) {
  const parsed = parseMarkdownImageLine(line.trim());
  if (!parsed) return escapeHtml(line);
  const safeUrl = escapeHtmlAttr(parsed.url);
  const safeAlt = escapeHtmlAttr(parsed.alt || "embedded image");
  return [
    "<div class='blog-inline-image'>",
    `  <a href='${safeUrl}' target='_blank' rel='noreferrer'>`,
    `    <img src='${safeUrl}' alt='${safeAlt}' loading='lazy' />`,
    "  </a>",
    "</div>"
  ].join("");
}

function hasEmbeddedImage(content: string) {
  return content.split("\n").some((line) => Boolean(parseMarkdownImageLine(line.trim())));
}

function insertCoverImageLine(img: { url: string; publicId: string }) {
  if (!blogDraft) return;
  const previousCoverUrl = blogDraft.coverImage?.url;
  if (previousCoverUrl) {
    const previousCoverIndex = blogDraft.lines.findIndex((line) => parseMarkdownImageLine(line.trim())?.url === previousCoverUrl);
    if (previousCoverIndex >= 0) {
      blogDraft.lines.splice(previousCoverIndex, 1);
      if (blogDraft.lines[previousCoverIndex] === "") {
        blogDraft.lines.splice(previousCoverIndex, 1);
      }
    }
  }
  blogDraft.coverImage = img;
  const insertAt = Math.min(1, blogDraft.lines.length);
  blogDraft.lines.splice(insertAt, 0, `![cover](${img.url})`);
  blogDraft.lines.splice(insertAt + 1, 0, "");
  editorEditingLineIndex = insertAt + 1;
  editorInputMode = "insert";
  USERINPUT.value = "";
  editorLiveInput = "";
  editorCursorPos = 0;
  renderEditorOverlay();
  setEditorStatus("Cover image inserted at the top. Continue writing on the next line.");
  setTimeout(() => USERINPUT.focus(), 0);
}

function insertInlineImageLine(img: { url: string; publicId: string }, insertAt: number) {
  if (!blogDraft) return;
  blogDraft.images.push(img);
  const normalizedInsertAt = Math.min(Math.max(0, insertAt), blogDraft.lines.length);
  blogDraft.lines.splice(normalizedInsertAt, 0, `![image](${img.url})`);
  blogDraft.lines.splice(normalizedInsertAt + 1, 0, "");
  editorEditingLineIndex = normalizedInsertAt + 1;
  editorInputMode = "insert";
  USERINPUT.value = "";
  editorLiveInput = "";
  editorCursorPos = 0;
  renderEditorOverlay();
  setEditorStatus(`Inserted image at line ${normalizedInsertAt + 1}. Continue writing on the next line.`);
  setTimeout(() => USERINPUT.focus(), 0);
}

function playKeySound() {
  if (!SESSION.sound) return;
  const AudioContextRef = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextRef) return;
  if (!audioCtx) {
    audioCtx = new AudioContextRef();
  }
  const oscillator = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  oscillator.type = "square";
  oscillator.frequency.value = 680;
  gain.gain.value = 0.02;
  oscillator.connect(gain);
  gain.connect(audioCtx.destination);
  oscillator.start();
  oscillator.stop(audioCtx.currentTime + 0.03);
}

function userInputHandler(e: KeyboardEvent) {
  if (blogPicker) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      blogPicker.selectedIndex = Math.max(0, blogPicker.selectedIndex - 1);
      renderBlogPicker();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      blogPicker.selectedIndex = Math.min(blogPicker.items.length - 1, blogPicker.selectedIndex + 1);
      renderBlogPicker();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      chooseBlogPickerSelection();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      cancelBlogPicker();
      return;
    }
  }

  if (isBlogEditorMode && e.key === "Escape") {
    e.preventDefault();
    editorInputMode = editorInputMode === "insert" ? "command" : "insert";
    editorEditingLineIndex = null;
    setEditorStatus(editorInputMode === "command" ? ": (command) :edit <line> :wq :q! :show :img <line> [url] :cover [url]" : "-- INSERT --");
    USERINPUT.value = "";
    editorLiveInput = "";
    editorCursorPos = 0;
    updateInputState();
    return;
  }

  if (e.key.length === 1 || e.key === "Backspace") {
    playKeySound();
  }

  switch (e.key) {
    case "Enter":
      e.preventDefault();
      if (!isPasswordInput) {
        enterKey();
      } else {
        passwordHandler();
      }
      scrollToBottom();
      break;
    case "Escape":
      USERINPUT.value = "";
      updateInputState();
      break;
    case "ArrowUp":
      if (isBlogEditorMode) {
        setTimeout(() => updateInputState(), 0);
      } else {
        arrowKeys(e.key);
        e.preventDefault();
      }
      break;
    case "ArrowDown":
      if (isBlogEditorMode) {
        setTimeout(() => updateInputState(), 0);
      } else {
        arrowKeys(e.key);
        e.preventDefault();
      }
      break;
    case "ArrowLeft":
    case "ArrowRight":
    case "Home":
    case "End":
    case "Delete":
      if (isBlogEditorMode) setTimeout(() => updateInputState(), 0);
      break;
    case "Tab":
      tabKey();
      e.preventDefault();
      break;
  }
}

function enterKey() {
  if (!mutWriteLines || !PROMPT) return;
  const resetInput = "";
  const rawInput = USERINPUT.value;
  userInput = rawInput.trim();
  if (isBlogEditorMode) {
    handleBlogEditorInput(rawInput);
    USERINPUT.value = resetInput;
    userInput = resetInput;
    editorLiveInput = resetInput;
    editorCursorPos = 0;
    updateInputState();
    return;
  }
  const output = bareMode ? escapeHtml(userInput) : `<span class='output'>${escapeHtml(userInput)}</span>`;

  if (userInput.length > 0) {
    HISTORY.push(userInput);
    historyIdx = HISTORY.length;
    SESSION.history = HISTORY.slice(-80);
    persistSession();
  }

  const div = document.createElement("div");
  const promptMarkup = PROMPT?.innerHTML ?? `${escapeHtml(command.username)}@${escapeHtml(command.hostname)}:$ ~`;
  div.innerHTML = `<span id="prompt">${promptMarkup}</span> ${output}`;
  if (mutWriteLines.parentNode) {
    mutWriteLines.parentNode.insertBefore(div, mutWriteLines);
  }

  if (userInput.length > 0) {
    commandHandler(userInput.toLowerCase());
  }

  USERINPUT.value = resetInput;
  userInput = resetInput;
  updateInputState();
}

function tabKey() {
  const currInputRaw = USERINPUT.value;
  const currInput = currInputRaw.trim().toLowerCase();
  if (!currInput) return;
  const matches = getTabCompletions(currInputRaw);

  if (matches.length === 1) {
    USERINPUT.value = matches[0];
    USERINPUT.classList.add("tab-flash");
    setTimeout(() => USERINPUT.classList.remove("tab-flash"), 300);
    updateInputState();
  } else if (matches.length > 1) {
    const safeChips = matches
      .map((m) => `<span class='cmd-chip' data-command='${escapeHtmlAttr(m)}'>${escapeHtml(m)}</span>`)
      .join(" ");
    writeLines([
      "<br>",
      `Suggestions: ${safeChips}`,
      "<br>"
    ]);
  }
}

function getProjectSuggestions(prefix: string): string[] {
  const query = prefix.trim().toLowerCase();
  const named = command.projects
    .map((ele) => ele[0].toLowerCase())
    .filter((name) => name.startsWith(query));
  const indexed = command.projects
    .map((_, idx) => `${idx + 1}`)
    .filter((idx) => idx.startsWith(query));
  return [...indexed, ...named];
}

function getManTopics(): string[] {
  const manPages = command.manPages as Record<string, string[]> | undefined;
  return Object.keys(manPages ?? {});
}

function getScenarioNames(): string[] {
  const scenarios = command.scenarios as Record<string, string[]> | undefined;
  return Object.keys(scenarios ?? {});
}

function getTabCompletions(inputRaw: string): string[] {
  const value = inputRaw.toLowerCase();
  const trimmed = value.trim();
  if (!trimmed) return [];

  const hasArgs = trimmed.includes(" ");
  if (!hasArgs) {
    return COMMANDS.filter((cmd) => cmd.startsWith(trimmed));
  }

  const parts = trimmed.split(/\s+/);
  const aliasOrCmd = ALIASES[parts[0]] ?? parts[0];
  const argPrefix = trimmed.slice(trimmed.indexOf(" ") + 1);
  const complete = (arg: string) => `${aliasOrCmd} ${arg}`.trim();

  if (aliasOrCmd === "cat") {
    const candidates = [
      ...listVirtual("."),
      ...listVirtual("projects").map((p) => `projects/${p}`)
    ];
    return candidates.filter((item) => item.startsWith(argPrefix)).map(complete);
  }
  if (aliasOrCmd === "ls") {
    const candidates = [".", "projects"];
    return candidates.filter((item) => item.startsWith(argPrefix)).map(complete);
  }
  if (aliasOrCmd === "open") {
    const candidates = ["repo", "github", "linkedin", "email", "resume", ...getProjectSuggestions(argPrefix.replace(/^project\s+/, "")).map((p) => `project ${p}`)];
    return candidates.filter((item) => item.startsWith(argPrefix)).map(complete);
  }
  if (aliasOrCmd === "theme") {
    return (Object.keys(THEMES) as ThemeName[]).filter((item) => item.startsWith(argPrefix)).map(complete);
  }
  if (aliasOrCmd === "motion" || aliasOrCmd === "sound") {
    return ["on", "off"].filter((item) => item.startsWith(argPrefix)).map(complete);
  }
  if (aliasOrCmd === "prefs") {
    return ["export", "reset"].filter((item) => item.startsWith(argPrefix)).map(complete);
  }
  if (aliasOrCmd === "help") {
    return HELP_TYPES.filter((item) => item.startsWith(argPrefix)).map(complete);
  }
  if (aliasOrCmd === "man") {
    return getManTopics().filter((item) => item.startsWith(argPrefix)).map(complete);
  }
  if (aliasOrCmd === "demo") {
    return getScenarioNames().filter((item) => item.startsWith(argPrefix)).map(complete);
  }
  if (aliasOrCmd === "project") {
    return getProjectSuggestions(argPrefix).map(complete);
  }
  if (aliasOrCmd === "blog") {
    return ["search", "view"].filter((item) => item.startsWith(argPrefix)).map(complete);
  }
  if (aliasOrCmd === "blogs") {
    return ["search", "tag"].filter((item) => item.startsWith(argPrefix)).map(complete);
  }
  if (aliasOrCmd === "admin") {
    return ["whoami", "logout", "blogs", "config", "analytics", "blog-new", "blog-edit", "blog-delete", "blog-publish", "blog-view", "blog-select"].filter((item) => item.startsWith(argPrefix)).map(complete);
  }
  return [];
}

function isCommandInputValid(inputRaw: string): boolean | null {
  const trimmed = inputRaw.trim().toLowerCase();
  if (!trimmed) return null;

  const parts = trimmed.split(/\s+/);
  const first = parts[0];
  const resolved = ALIASES[first] ?? first;

  if (!COMMANDS.includes(resolved)) return false;

  const args = parts.slice(1);
  if (args.length === 0) return COMMANDS.includes(resolved) && !trimmed.endsWith(" ");
  const argStr = args.join(" ");

  switch (resolved) {
    case "theme":
      return (Object.keys(THEMES) as ThemeName[]).includes(args[0] as ThemeName);
    case "motion":
    case "sound":
      return ["on", "off"].includes(args[0]);
    case "open":
      if (["repo", "github", "linkedin", "email", "resume"].includes(argStr)) return true;
      if (argStr.startsWith("project ")) {
        const projectArg = argStr.replace(/^project\s+/, "");
        return getProjectSuggestions(projectArg).some((p) => p === projectArg);
      }
      return false;
    case "ls":
      return [".", "projects", ""].includes(argStr);
    case "cat":
      return [
        ...listVirtual("."),
        ...listVirtual("projects").map((p) => `projects/${p}`)
      ].includes(argStr);
    case "project":
      return getProjectSuggestions(argStr).some((p) => p === argStr);
    case "prefs":
      return ["", "export", "reset"].includes(argStr);
    case "help":
      return argStr === "" || HELP_TYPES.includes(argStr as typeof HELP_TYPES[number]);
    case "history":
    case "keys":
    case "stats":
    case "version":
    case "status":
      return argStr === "";
    case "man":
      if (argStr === "") return false;
      return getManTopics().includes(argStr);
    case "demo":
      if (argStr === "") return false;
      return getScenarioNames().includes(argStr);
    case "rm":
      if (argStr === "-rf") return true;
      if (argStr.startsWith("-rf ")) return true;
      return false;
    case "su":
      return args.length === 1 && !!args[0];
    case "admin":
      return argStr === "" || argStr.startsWith("whoami") || argStr.startsWith("logout") || argStr.startsWith("blogs") || argStr.startsWith("config") || argStr.startsWith("analytics") || argStr === "blog-new" || argStr === "blog-edit" || argStr.startsWith("blog-edit ") || argStr === "blog-delete" || argStr.startsWith("blog-delete ") || argStr === "blog-publish" || argStr.startsWith("blog-publish ") || argStr === "blog-view" || argStr.startsWith("blog-view ") || argStr.startsWith("blog-select ");
    case "blogs":
      return argStr === "" || argStr.startsWith("search ") || argStr.startsWith("tag ");
    case "blog":
      return argStr.startsWith("view ") || argStr.startsWith("search ");
    default:
      return true;
  }
}

function updateInputState() {
  if (isBlogEditorMode) {
    editorLiveInput = USERINPUT.value;
    editorCursorPos = USERINPUT.selectionStart ?? USERINPUT.value.length;
    renderEditorOverlay();
    return;
  }
  const validity = isCommandInputValid(USERINPUT.value);
  USERINPUT.classList.remove("command-valid", "command-invalid");
  if (validity === true) USERINPUT.classList.add("command-valid");
  if (validity === false) USERINPUT.classList.add("command-invalid");
}

function arrowKeys(key: string) {
  if (key === "ArrowDown") {
    if (historyIdx !== HISTORY.length) {
      historyIdx += 1;
      USERINPUT.value = HISTORY[historyIdx] ?? "";
      if (historyIdx === HISTORY.length) USERINPUT.value = tempInput;
    }
    return;
  }

  if (historyIdx === HISTORY.length) tempInput = USERINPUT.value;
  if (historyIdx !== 0) {
    historyIdx -= 1;
    USERINPUT.value = HISTORY[historyIdx];
  }
}

function registerVisit(marker: string) {
  if (!SESSION.visited.includes(marker)) {
    SESSION.visited.push(marker);
    persistSession();
  }
}

function updateQuestProgress() {
  const complete = QUEST_STEPS.every((item) => SESSION.visited.includes(item.id));
  if (complete && !SESSION.unlockedSecret) {
    SESSION.unlockedSecret = true;
    persistSession();
    writeLines([
      "<br>",
      "Quest complete. Secret unlocked.",
      "Try <span class='command'>'secret'</span> or <span class='command'>'cat secret.md'</span>.",
      "<br>"
    ]);
  }
}

async function downloadResume() {
  const pdfPath = command.resume?.pdfPath ?? "/res/resume.pdf";
  try {
    const response = await fetch(pdfPath, { method: "GET", cache: "no-store" });
    if (!response.ok) {
      writeLines(["PDF not found. Showing fallback resume.", "<br>", ...(command.resume?.fallback ?? VIRTUAL_FILES["resume.md"].split("\n")), "<br>"]);
      return;
    }
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = command.resume?.filename ?? "Resume.pdf";
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), RESUME_BLOB_REVOKE_DELAY_MS);
  } catch {
    writeLines(["Failed to fetch resume PDF. Showing fallback resume.", "<br>", ...(command.resume?.fallback ?? VIRTUAL_FILES["resume.md"].split("\n")), "<br>"]);
  }
}

function runScenario(name: string) {
  const key = name.toLowerCase();
  const scenarios = command.scenarios as Record<string, string[]> | undefined;
  const scenario = scenarios?.[key];
  if (!scenario || !Array.isArray(scenario)) {
    writeLines([`Scenario not found. Available: ${getScenarioNames().join(", ") || "none"}`, "<br>"]);
    return;
  }
  writeLines([`Running demo scenario: <span class='command'>${key}</span>`, "<br>"]);
  scenario.forEach((cmd, idx) => {
    setTimeout(() => commandHandler(String(cmd).toLowerCase()), 350 * (idx + 1));
  });
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${BACKEND_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const payload = await response.json() as { message?: string };
      if (payload?.message) message = payload.message;
    } catch {
      // keep fallback message
    }
    throw new Error(message);
  }
  if (response.status === 204) return {} as T;
  return response.json() as Promise<T>;
}

function renderBar(count: number, max: number, width = 24) {
  const safeMax = Math.max(1, max);
  const filled = Math.max(1, Math.round((count / safeMax) * width));
  return `${"█".repeat(filled)}${"░".repeat(Math.max(0, width - filled))}`;
}

async function trackAnalyticsEvent(eventType: string, commandName?: string, metadata?: Record<string, unknown>) {
  if (!command.telemetry?.enabled) return;
  try {
    await apiPost("/api/analytics/event", {
      sessionId: ANALYTICS_SESSION_ID,
      eventType,
      command: commandName,
      path: window.location.pathname,
      referrer: document.referrer || undefined,
      metadata
    });
  } catch {
    // Do not block UX on telemetry failures.
  }
}

async function apiGet<T>(path: string, accessToken?: string): Promise<T> {
  const response = await fetch(`${BACKEND_BASE_URL}${path}`, {
    method: "GET",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const payload = await response.json() as { message?: string };
      if (payload?.message) message = payload.message;
    } catch {
      // keep fallback message
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

async function loginAdmin(username: string, password: string) {
  const payload = await apiPost<{
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    user: AdminUser;
  }>("/api/auth/login", { username, password });
  adminAuth = payload;
  persistAdminAuth(payload);
  SESSION.adminMode = true;
  persistSession();
}

async function refreshAdminSession() {
  if (!adminAuth) throw new Error("No admin session.");
  const refreshed = await apiPost<{
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  }>("/api/auth/refresh", { refreshToken: adminAuth.refreshToken });
  adminAuth = {
    ...adminAuth,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresAt: refreshed.expiresAt
  };
  persistAdminAuth(adminAuth);
}

async function getValidAdminToken() {
  if (!adminAuth) throw new Error("Admin mode is locked.");
  if (adminAuth.expiresAt - Date.now() < 30_000) {
    await refreshAdminSession();
  }
  return adminAuth.accessToken;
}

async function logoutAdmin() {
  if (!adminAuth) return;
  try {
    await apiPost("/api/auth/logout", { refreshToken: adminAuth.refreshToken });
  } finally {
    adminAuth = null;
    persistAdminAuth(null);
    SESSION.adminMode = false;
    persistSession();
  }
}

async function getAdminBlogs() {
  const token = await getValidAdminToken();
  return apiGet<{ blogs: Array<{ _id: string; title: string; slug: string; status: string; updatedAt?: string }>; pagination?: { total: number } }>("/api/admin/blogs?limit=20", token);
}

async function getAdminConfigSummary() {
  const token = await getValidAdminToken();
  return apiGet<{ data: Record<string, unknown> | null; updatedAt?: string | null }>("/api/admin/config", token);
}

async function getAdminAnalyticsSummary() {
  const token = await getValidAdminToken();
  return apiGet<{
    totalEvents: number;
    uniqueSessions: number;
    eventTypes: Array<{ _id: string; count: number }>;
    topCommands: Array<{ _id: string; count: number }>;
  }>("/api/admin/analytics/summary", token);
}

async function getPublicBlogs(search?: string, tag?: string) {
  const qs = new URLSearchParams();
  qs.set("limit", "20");
  if (search) qs.set("search", search);
  if (tag) qs.set("tag", tag);
  return apiGet<{
    blogs: Array<{ title: string; slug: string; excerpt: string; tags?: string[]; publishedAt?: string }>;
    pagination?: { total: number; page: number; limit: number };
  }>(`/api/blogs?${qs.toString()}`);
}

async function getPublicBlogBySlug(slug: string) {
  return apiGet<{
    blog: {
      title: string;
      slug: string;
      excerpt: string;
      content: string;
      coverImage?: { url?: string; publicId?: string } | null;
      tags?: string[];
      publishedAt?: string;
    };
  }>(`/api/blogs/${encodeURIComponent(slug)}`);
}

async function createAdminBlog(payload: {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  tags: string[];
  status: "draft" | "published";
  coverImage?: { url: string; publicId: string } | null;
  images?: Array<{ url: string; publicId: string }>;
}) {
  const token = await getValidAdminToken();
  const response = await fetch(`${BACKEND_BASE_URL}/api/admin/blogs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const payloadErr = await response.json().catch(() => ({ message: `Request failed (${response.status})` })) as { message?: string };
    throw new Error(payloadErr.message ?? "Failed to create blog.");
  }
  return response.json() as Promise<{ blog: { _id: string; title: string; slug: string; status: string } }>;
}

async function publishAdminBlog(id: string) {
  const token = await getValidAdminToken();
  const response = await fetch(`${BACKEND_BASE_URL}/api/admin/blogs/${encodeURIComponent(id)}/publish`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const payloadErr = await response.json().catch(() => ({ message: `Request failed (${response.status})` })) as { message?: string };
    throw new Error(payloadErr.message ?? "Failed to publish blog.");
  }
  return response.json() as Promise<{ blog: { _id: string; title: string; status: string } }>;
}

async function deleteAdminBlog(id: string) {
  const token = await getValidAdminToken();
  const response = await fetch(`${BACKEND_BASE_URL}/api/admin/blogs/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok && response.status !== 204) {
    const payloadErr = await response.json().catch(() => ({ message: `Request failed (${response.status})` })) as { message?: string };
    throw new Error(payloadErr.message ?? "Failed to delete blog.");
  }
}

async function getAdminBlogById(id: string) {
  const token = await getValidAdminToken();
  return apiGet<{
    blog: {
      _id: string;
      title: string;
      slug: string;
      excerpt: string;
      content?: string;
      tags?: string[];
      status: "draft" | "published";
      coverImage?: { url?: string; publicId?: string } | null;
      images?: Array<{ url: string; publicId: string }>;
    }
  }>(`/api/admin/blogs/${encodeURIComponent(id)}`, token);
}

async function updateAdminBlog(id: string, payload: {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  tags: string[];
  status: "draft" | "published";
  coverImage: { url: string; publicId: string } | null;
  images: Array<{ url: string; publicId: string }>;
}) {
  const token = await getValidAdminToken();
  const response = await fetch(`${BACKEND_BASE_URL}/api/admin/blogs/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const payloadErr = await response.json().catch(() => ({ message: `Request failed (${response.status})` })) as { message?: string };
    throw new Error(payloadErr.message ?? "Failed to update blog.");
  }
  return response.json() as Promise<{ blog: { _id: string; title: string; slug: string; status: string } }>;
}

async function uploadAdminImageFromUrl(url: string) {
  const token = await getValidAdminToken();
  const fileResponse = await fetch(url);
  if (!fileResponse.ok) throw new Error("Unable to fetch image URL.");
  const blob = await fileResponse.blob();
  const file = new File([blob], "image-upload", { type: blob.type || "image/jpeg" });
  const form = new FormData();
  form.append("image", file);

  const response = await fetch(`${BACKEND_BASE_URL}/api/admin/uploads/image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  if (!response.ok) {
    const payloadErr = await response.json().catch(() => ({ message: `Request failed (${response.status})` })) as { message?: string };
    throw new Error(payloadErr.message ?? "Failed to upload image.");
  }
  return response.json() as Promise<{ url: string; publicId: string }>;
}

async function uploadAdminImageFile(file: File) {
  const token = await getValidAdminToken();
  const form = new FormData();
  form.append("image", file);
  const response = await fetch(`${BACKEND_BASE_URL}/api/admin/uploads/image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  if (!response.ok) {
    const payloadErr = await response.json().catch(() => ({ message: `Request failed (${response.status})` })) as { message?: string };
    throw new Error(payloadErr.message ?? "Failed to upload image.");
  }
  return response.json() as Promise<{ url: string; publicId: string }>;
}

function pickLocalImageFile() {
  return new Promise<File>((resolve, reject) => {
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "image/*";
    picker.style.display = "none";
    document.body.appendChild(picker);
    let done = false;
    const cleanup = () => {
      if (picker.parentNode) picker.parentNode.removeChild(picker);
    };
    picker.addEventListener("change", () => {
      done = true;
      const file = picker.files?.[0];
      cleanup();
      if (!file) {
        reject(new Error("No file selected."));
        return;
      }
      resolve(file);
    }, { once: true });
    window.addEventListener("focus", () => {
      setTimeout(() => {
        if (!done) {
          done = true;
          cleanup();
          reject(new Error("Image selection cancelled."));
        }
      }, IMAGE_PICKER_CANCEL_DELAY_MS);
    }, { once: true });
    picker.click();
  });
}

function showAdminHelp() {
  if (!adminAuth) {
    writeLines(["Admin mode is locked. Use <span class='command'>'su &lt;username&gt;'</span> first.", "<br>"]);
    return;
  }
  writeLines([
    "<br>",
    `Admin unlocked for <span class='command'>${adminAuth.user.username}</span>`,
    "Admin commands:",
    "- <span class='command'>admin</span> (show this help)",
    "- <span class='command'>admin whoami</span> (current admin session)",
    "- <span class='command'>admin logout</span> (lock admin commands)",
    "- <span class='command'>admin blogs</span> (placeholder for blog manager)",
    "- <span class='command'>admin config</span> (placeholder for config manager)",
    "- <span class='command'>admin analytics</span> (placeholder for analytics manager)",
    "- <span class='command'>admin blog-new</span> (opens vim-like editor)",
    "- <span class='command'>admin blog-edit [id]</span> (if no id, opens selector list)",
    "- <span class='command'>admin blog-view [id]</span> <span class='command'>admin blog-publish [id]</span> <span class='command'>admin blog-delete [id]</span>",
    "- <span class='command'>admin blog-select <edit|view|publish|delete></span> (force selector mode)",
    "<br>"
  ]);
}

function startBlogEditor(draft: BlogEditorDraft, editId: string | null = null) {
  isBlogEditorMode = true;
  editorInputMode = "insert";
  editorStatusMessage = "";
  editorLiveInput = "";
  editorCursorPos = 0;
  editorEditingLineIndex = null;
  isEditorSaving = false;
  blogDraft = draft;
  blogEditId = editId;
  if (blogPicker) cancelBlogPicker();
  document.body.classList.add("editor-mode");
  const overlay = ensureEditorOverlay();
  if (mutWriteLines && WRITELINESCOPY) {
    while (mutWriteLines.previousSibling) {
      const prev = mutWriteLines.previousSibling;
      if (!prev) break;
      if (overlay && prev === overlay) break;
      mutWriteLines.parentNode?.removeChild(prev);
    }
  }
  if (INPUT_HIDDEN) INPUT_HIDDEN.style.display = "block";
  setEditorStatus("INSERT: type text | Esc command | :edit <line> | :wq save | :q! quit | :img <line> | :cover");
  renderEditorOverlay();
  setTimeout(() => USERINPUT.focus(), 30);
}

function leaveBlogEditor() {
  isBlogEditorMode = false;
  blogDraft = null;
  blogEditId = null;
  editorStatusMessage = "";
  editorLiveInput = "";
  editorCursorPos = 0;
  editorEditingLineIndex = null;
  isEditorSaving = false;
  editorInputMode = "insert";
  document.body.classList.remove("editor-mode");
  document.body.classList.remove("picker-mode");
  if (INPUT_HIDDEN) INPUT_HIDDEN.style.display = "block";
  setPromptIdentity(adminAuth?.user.username ?? command.username);
  renderEditorOverlay();
}

function previewDraftLines() {
  if (!blogDraft) return;
  writeLines([
    "<br>",
    `Title: ${blogDraft.title}`,
    `Slug: ${blogDraft.slug}`,
    `Status: ${blogDraft.status}`,
    `Cover: ${blogDraft.coverImage?.url ?? "none"}`,
    `Tags: ${blogDraft.tags.join(", ") || "none"}`,
    "Content preview:",
    ...blogDraft.lines.map((line, idx) => `${idx + 1}. ${renderMarkdownLine(line)}`),
    "<br>"
  ]);
}

function handleEditorMeta(commandLine: string) {
  if (!blogDraft) return;
  const [cmd, ...rest] = commandLine.slice(1).split(" ");
  const value = rest.join(" ").trim();
  switch (cmd) {
    case "title":
      if (!isValidBlogTitle(normalizeBlogTitle(value))) {
        setEditorStatus("Title must be 3-120 characters.");
        return;
      }
      blogDraft.title = normalizeBlogTitle(value);
      setEditorStatus("Title updated.");
      return;
    case "slug":
      blogDraft.slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      setEditorStatus(`Slug updated: ${blogDraft.slug}`);
      return;
    case "excerpt":
      blogDraft.excerpt = value;
      setEditorStatus("Excerpt updated.");
      return;
    case "tags":
      blogDraft.tags = value ? value.split(",").map((v) => v.trim()).filter(Boolean) : [];
      setEditorStatus(`Tags: ${blogDraft.tags.join(", ") || "none"}`);
      return;
    case "status":
      if (value === "draft" || value === "published") {
        blogDraft.status = value;
        setEditorStatus(`Status: ${value}`);
      } else {
        setEditorStatus("Use :status draft|published");
      }
      return;
    case "rm":
    case "del":
    case "delete": {
      const lineNo = Number(value);
      if (!Number.isFinite(lineNo) || lineNo < 1 || lineNo > blogDraft.lines.length) {
        setEditorStatus(`Usage: :rm <line-number> (1-${blogDraft.lines.length})`);
        return;
      }
      const idx = lineNo - 1;
      const removedLine = blogDraft.lines[idx] ?? "";
      const parsed = parseMarkdownImageLine(removedLine.trim());
      if (parsed && blogDraft.coverImage?.url === parsed.url) {
        blogDraft.coverImage = null;
      }
      blogDraft.lines.splice(idx, 1);
      editorEditingLineIndex = null;
      setEditorStatus(`Removed line ${lineNo}.`);
      renderEditorOverlay();
      return;
    }
    case "edit": {
      const lineNo = Number(value);
      if (!Number.isFinite(lineNo) || lineNo < 1 || lineNo > blogDraft.lines.length) {
        setEditorStatus(`Usage: :edit <line-number> (1-${blogDraft.lines.length})`);
        return;
      }
      const idx = lineNo - 1;
      editorEditingLineIndex = idx;
      editorInputMode = "insert";
      USERINPUT.value = blogDraft.lines[idx] ?? "";
      editorLiveInput = USERINPUT.value;
      editorCursorPos = USERINPUT.value.length;
      setEditorStatus(`Editing line ${lineNo}. Update text and press Enter.`);
      setTimeout(() => {
        USERINPUT.focus();
        USERINPUT.setSelectionRange(USERINPUT.value.length, USERINPUT.value.length);
      }, 0);
      return;
    }
    default:
      setEditorStatus("Unknown editor command.");
  }
}

function handleBlogEditorInput(rawInput: string) {
  const input = rawInput.trim();
  const commandInput = editorInputMode === "command" && input && !input.startsWith(":")
    ? `:${input}`
    : input;
  if (!blogDraft) {
    leaveBlogEditor();
    return;
  }
  if (!input && editorInputMode === "insert") {
    if (editorEditingLineIndex !== null) {
      blogDraft.lines[editorEditingLineIndex] = "";
      setEditorStatus(`Updated line ${editorEditingLineIndex + 1}.`);
      editorEditingLineIndex = null;
    } else {
      blogDraft.lines.push("");
    }
    renderEditorOverlay();
    return;
  }
  if (!input) return;

  if (commandInput === ":q!") {
    editorEditingLineIndex = null;
    leaveBlogEditor();
    writeLines(["Exited editor.", "<br>"]);
    return;
  }
  if (commandInput === ":show") {
    previewDraftLines();
    renderEditorOverlay();
    return;
  }
  if (commandInput === ":cover") {
    setEditorStatus("Select local cover image...");
    void pickLocalImageFile()
      .then((file) => uploadAdminImageFile(file))
      .then((img) => {
        insertCoverImageLine(img);
      })
      .catch((error: unknown) => setEditorStatus(error instanceof Error ? error.message : "Cover upload failed."));
    return;
  }
  if (commandInput === ":img") {
    const insertAt = editorEditingLineIndex !== null ? editorEditingLineIndex + 1 : blogDraft.lines.length;
    setEditorStatus("Select local image...");
    void pickLocalImageFile()
      .then((file) => uploadAdminImageFile(file))
      .then((img) => insertInlineImageLine(img, insertAt))
      .catch((error: unknown) => setEditorStatus(error instanceof Error ? error.message : "Image upload failed."));
    return;
  }
  if (commandInput.startsWith(":cover ")) {
    const url = commandInput.slice(7).trim();
    if (url === "clear" || url === "remove" || url === "delete") {
      if (!blogDraft) return;
      const coverUrl = blogDraft.coverImage?.url;
      if (coverUrl) {
        const coverLineIndex = blogDraft.lines.findIndex((line) => parseMarkdownImageLine(line.trim())?.url === coverUrl);
        if (coverLineIndex >= 0) {
          blogDraft.lines.splice(coverLineIndex, 1);
        }
      }
      blogDraft.coverImage = null;
      setEditorStatus("Cover image removed.");
      renderEditorOverlay();
      return;
    }
    if (!isValidImageUrlCandidate(url)) {
      setEditorStatus("Invalid image URL. Use a valid http(s) image link.");
      return;
    }
    void uploadAdminImageFromUrl(url)
      .then((img) => {
        insertCoverImageLine(img);
      })
      .catch((error: unknown) => setEditorStatus(error instanceof Error ? error.message : "Cover upload failed."));
    return;
  }
  if (commandInput.startsWith(":img ")) {
    const parts = commandInput.split(/\s+/);
    const lineNo = Number(parts[1]);
    const url = parts.slice(2).join(" ");
    if (!Number.isFinite(lineNo) || lineNo < 1) {
      setEditorStatus("Usage: :img <line-number> [image-url]");
      return;
    }
    if (url && !isValidImageUrlCandidate(url)) {
      setEditorStatus("Invalid image URL. Use a valid http(s) image link.");
      return;
    }
    const uploadTask = url
      ? uploadAdminImageFromUrl(url)
      : pickLocalImageFile().then((file) => uploadAdminImageFile(file));
    if (!url) setEditorStatus("Select local image...");
    void uploadTask
      .then((img) => {
        insertInlineImageLine(img, lineNo - 1);
      })
      .catch((error: unknown) => setEditorStatus(error instanceof Error ? error.message : "Image upload failed."));
    return;
  }
  if (commandInput === ":wq") {
    if (isEditorSaving) {
      setEditorStatus("Save already in progress...");
      return;
    }
    isEditorSaving = true;
    editorEditingLineIndex = null;
    const payload = {
      title: blogDraft.title,
      slug: blogDraft.slug,
      excerpt: blogDraft.excerpt,
      content: blogDraft.lines.join("\n"),
      tags: blogDraft.tags,
      status: blogDraft.status,
      coverImage: blogDraft.coverImage,
      images: blogDraft.images
    };
    if (!payload.title || !payload.slug || !payload.excerpt || !payload.content.trim()) {
      isEditorSaving = false;
      setEditorStatus("Missing required fields: :title :slug :excerpt and content.");
      return;
    }
    const currentEditId = blogEditId;
    void (currentEditId ? updateAdminBlog(currentEditId, payload) : createAdminBlog(payload))
      .then((result) => {
        leaveBlogEditor();
        writeLines([`Saved blog: ${result.blog.title} [${result.blog._id}] (${result.blog.status}) | cover: ${payload.coverImage?.url ?? "none"}`, "<br>"]);
      })
      .catch((error: unknown) => {
        isEditorSaving = false;
        setEditorStatus(error instanceof Error ? error.message : "Save failed.");
      });
    return;
  }
  if (commandInput.startsWith(":")) {
    handleEditorMeta(commandInput);
    renderEditorOverlay();
    return;
  }

  if (editorInputMode === "command") {
    setEditorStatus("Press Esc to command mode, type :edit <line> / :wq / :q!, or text in insert mode.");
    return;
  }
  if (editorEditingLineIndex !== null) {
    blogDraft.lines[editorEditingLineIndex] = rawInput;
    setEditorStatus(`Updated line ${editorEditingLineIndex + 1}.`);
    editorEditingLineIndex = null;
  } else {
    blogDraft.lines.push(rawInput);
  }
  renderEditorOverlay();
}

function beginBlogSelection(action: "edit" | "view" | "publish" | "delete") {
  const requestId = ++blogPickerRequestId;
  void getAdminBlogs()
    .then((data) => {
      if (requestId !== blogPickerRequestId) return;
      const items = data.blogs.slice(0, 20).map((b) => ({ _id: b._id, title: b.title, status: b.status, slug: b.slug }));
      if (!items.length) {
        writeLines(["No blogs available.", "<br>"]);
        return;
      }
      blogPicker = { action, items, selectedIndex: 0 };
      document.body.classList.add("picker-mode");
      document.body.classList.remove("editor-mode");
      if (INPUT_HIDDEN) INPUT_HIDDEN.style.display = "block";
      renderBlogPicker();
    })
    .catch((error: unknown) => {
      if (requestId !== blogPickerRequestId) return;
      writeLines([error instanceof Error ? error.message : "Failed to load blogs.", "<br>"]);
    });
}

function renderBlogPicker() {
  if (!blogPicker) return;
  const overlay = ensureEditorOverlay();
  if (!overlay) return;
  overlay.style.display = "block";
  overlay.innerHTML = [
    `<div class='editor-header'>Pick blog for ${blogPicker.action.toUpperCase()}</div>`,
    "<div class='editor-body'>",
    ...blogPicker.items.map((item, idx) => {
      const marker = idx === blogPicker!.selectedIndex ? "❯" : " ";
      return `<div class='editor-line ${idx === blogPicker!.selectedIndex ? "picker-selected" : ""}'><span class='editor-lineno'>${String(idx + 1).padStart(3, " ")}</span> ${marker} ${escapeHtml(item.title)} (${escapeHtml(item.status)}) [${escapeHtml(item.slug)}] <span class='command'>${escapeHtml(item._id)}</span></div>`;
    }),
    "</div>",
    "<div class='editor-status'><span>-- PICKER --</span><span>↑/↓ move • Enter select • Esc cancel</span></div>"
  ].join("");
}

function cancelBlogPicker() {
  blogPickerRequestId++;
  blogPicker = null;
  document.body.classList.remove("picker-mode");
  if (isBlogEditorMode) document.body.classList.add("editor-mode");
  if (INPUT_HIDDEN) INPUT_HIDDEN.style.display = "block";
  renderEditorOverlay();
}

function chooseBlogPickerSelection() {
  if (!blogPicker) return;
  const selected = blogPicker.items[blogPicker.selectedIndex];
  const action = blogPicker.action;
  cancelBlogPicker();
  commandHandler(`admin blog-${action} ${selected._id}`, { bypassPendingBlogTitle: true });
}

function setPromptIdentity(value: string) {
  if (USER) USER.innerText = value;
  if (PRE_USER) PRE_USER.innerText = value;
}

function showMan(topic?: string) {
  if (!topic) {
    writeLines([
      "<br>",
      "Usage: man <topic>",
      `Available: ${Object.keys(command.manPages ?? {}).join(", ") || "none"}`,
      "<br>"
    ]);
    return;
  }
  const manPages = command.manPages as Record<string, string[]> | undefined;
  const page = manPages?.[topic];
  if (!page) {
    writeLines(["No manual entry for that topic.", "<br>"]);
    return;
  }
  const lines = Array.isArray(page) ? page : [String(page)];
  writeLines(["<br>", ...lines, "<br>"]);
}

function showKeys() {
  const shortcuts = command.shortcuts ?? [];
  if (!Array.isArray(shortcuts) || shortcuts.length === 0) {
    writeLines(["No shortcuts configured in config.json.", "<br>"]);
    return;
  }
  writeLines([
    "<br>",
    ...shortcuts.map((entry) => `${entry[0]}: ${entry[1]}`),
    "<br>"
  ]);
}

function showHistory() {
  if (HISTORY.length === 0) {
    writeLines(["No history yet.", "<br>"]);
    return;
  }
  writeLines([
    "<br>",
    ...HISTORY.slice(-30).map((cmd, idx) => `${HISTORY.length - Math.min(30, HISTORY.length) + idx + 1}. ${cmd}`),
    "<br>"
  ]);
}

function showStats() {
  const entries = Object.entries(SESSION.usage).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    writeLines(["No usage data yet.", "<br>"]);
    return;
  }
  writeLines([
    "<br>",
    "Local command usage:",
    ...entries.map(([key, count]) => `${key}: ${count}`),
    "<br>"
  ]);
}

function showVersion() {
  const version = command.version;
  if (!version) {
    writeLines(["Version info not configured.", "<br>"]);
    return;
  }
  writeLines([
    "<br>",
    `${version.name ?? "WebShell"} ${version.number ?? ""}`.trim(),
    version.channel ? `Channel: ${version.channel}` : "",
    "<br>"
  ].filter(Boolean));
}

function showStatus() {
  const status = command.status;
  if (!status) {
    writeLines(["Status not configured.", "<br>"]);
    return;
  }
  writeLines([
    "<br>",
    status.headline ?? "No status headline configured.",
    ...(Array.isArray(status.details) ? status.details : []),
    "<br>"
  ]);
}

function getCommandSuggestions(input: string): string[] {
  const source = COMMANDS.filter((c, i, arr) => arr.indexOf(c) === i);
  return source
    .map((cmd) => ({ cmd, score: levenshtein(input, cmd) }))
    .sort((a, b) => a.score - b.score)
    .filter((item) => item.score <= 3)
    .slice(0, 3)
    .map((item) => item.cmd);
}

function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function runGuidedModeStart() {
  SESSION.guideStep = 0;
  persistSession();
  writeLines([
    "<br>",
    "Guided mode started.",
    GUIDE_STEPS[0].text,
    `Run <span class='cmd-chip' data-command='${GUIDE_STEPS[0].command}'>${GUIDE_STEPS[0].command}</span>`,
    "<br>"
  ]);
}

function checkGuideProgress(input: string) {
  if (SESSION.guideStep < 0 || SESSION.guideStep >= GUIDE_STEPS.length) return;
  const expected = GUIDE_STEPS[SESSION.guideStep].command;
  if (input === expected) {
    SESSION.guideStep += 1;
    persistSession();
    if (SESSION.guideStep >= GUIDE_STEPS.length) {
      writeLines(["<br>", "Guided mode complete. You are now in full explorer mode.", "<br>"]);
      SESSION.guideStep = -1;
      persistSession();
      return;
    }
    const next = GUIDE_STEPS[SESSION.guideStep];
    writeLines([
      "<br>",
      next.text,
      `Run <span class='cmd-chip' data-command='${next.command}'>${next.command}</span>`,
      "<br>"
    ]);
  }
}

function listVirtual(pathArg?: string): string[] {
  const path = (pathArg ?? ".").replace(/^\/+|\/+$/g, "");
  if (path === "." || path === "") {
    return ["about.txt", "resume.md", "resume.pdf", "skills.md", "contact.md", "now.txt", "projects/", SESSION.unlockedSecret ? "secret.md" : ""].filter(Boolean);
  }
  if (path === "projects") {
    return command.projects.map((ele, idx) => `${idx + 1}-${ele[0].toLowerCase().replace(/\s+/g, "-")}.md`);
  }
  return [];
}

function readVirtualFile(rawPath: string): string | null {
  const path = rawPath.replace(/^\/+/, "");
  if (path === "about.txt") {
    return command.aboutGreeting.join("\n");
  }
  if (path === "secret.md") {
    if (!SESSION.unlockedSecret) return null;
    return "# Secret unlocked\nYou found the hidden route.\n\nTry `theme neon` and `start` together for full effect.";
  }
  if (VIRTUAL_FILES[path]) return VIRTUAL_FILES[path];
  if (path === "resume.pdf") {
    return "Binary file detected. Use <span class='command'>'resume'</span> to download.";
  }
  if (path.startsWith("projects/")) {
    const slug = path.split("/")[1].replace(".md", "");
    const project = command.projects.find((ele, idx) => `${idx + 1}-${ele[0].toLowerCase().replace(/\s+/g, "-")}` === slug);
    if (!project) return null;
    return `# ${project[0]}\n\n${project[1]}\n\nLink: ${project[2] ?? "No link provided"}`;
  }
  return null;
}

function openTarget(target: string) {
  if (target === "repo") {
    void trackAnalyticsEvent("link_open", "open", { target });
    window.open(REPO_LINK, "_blank");
    return true;
  }
  if (target === "github") {
    void trackAnalyticsEvent("link_open", "open", { target });
    window.open(`https://github.com/${SOCIAL.github}`, "_blank");
    return true;
  }
  if (target === "linkedin") {
    void trackAnalyticsEvent("link_open", "open", { target });
    window.open(`https://www.linkedin.com/in/${SOCIAL.linkedin}`, "_blank");
    return true;
  }
  if (target === "email") {
    void trackAnalyticsEvent("link_open", "open", { target });
    window.open(`mailto:${SOCIAL.email}?subject=Portfolio%20Inquiry`, "_blank");
    return true;
  }
  if (target === "resume") {
    void trackAnalyticsEvent("link_open", "open", { target });
    downloadResume();
    return true;
  }
  return false;
}

function projectDeepDive(rawQuery: string): string[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) {
    return ["Usage: <span class='command'>'project &lt;name|index&gt;'</span>", "Example: <span class='command'>'project swoosh'</span>"];
  }

  const byIndex = Number.parseInt(query, 10);
  let selected = Number.isNaN(byIndex) ? undefined : command.projects[byIndex - 1];
  if (!selected) {
    selected = command.projects.find((ele) => ele[0].toLowerCase() === query || ele[0].toLowerCase().includes(query));
  }
  if (!selected) {
    return [
      "Project not found.",
      ...command.projects.map((ele, idx) => `- ${idx + 1}. ${ele[0]}`)
    ];
  }

  const lines = [
    "<br>",
    `<span class='command'>${selected[0]}</span>`,
    selected[1],
    selected[2] ? `Open: <a href='${selected[2]}' target='_blank'>${selected[2]}</a>` : "No public link available.",
    "Stack: React, TypeScript, Product-focused UX",
    "Focus: Performance, reliability, and usability",
    "<br>"
  ];
  return lines;
}

function commandHandler(input: string, options?: { bypassPendingBlogTitle?: boolean }) {
  if (input.startsWith("rm -rf") && input.trim() !== "rm -rf") {
    if (isSudo && input === "rm -rf src" && !bareMode) {
      bareMode = true;
      setTimeout(() => {
        if (!TERMINAL || !WRITELINESCOPY) return;
        TERMINAL.innerHTML = "";
        TERMINAL.appendChild(WRITELINESCOPY);
        mutWriteLines = WRITELINESCOPY;
      });
      easterEggStyles();
      setTimeout(() => writeLines(["What made you think that was a good idea?", "<br>"]), 200);
      setTimeout(() => writeLines(["Now everything is ruined.", "<br>"]), 1200);
    } else if (isSudo && input === "rm -rf src" && bareMode) {
      writeLines(["there's no more src folder.", "<br>"]);
    } else {
      writeLines(["Permission not granted.", "<br>"]);
    }
    return;
  }

  const parts = input.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return;
  const aliasOrCmd = ALIASES[parts[0]] ?? parts[0];
  const args = parts.slice(1);
  const normalizedInput = [aliasOrCmd, ...args].join(" ");

  if (pendingBlogNewTitle && !options?.bypassPendingBlogTitle) {
    const title = normalizeBlogTitle(input);
    if (!isValidBlogTitle(title)) {
      writeLines(["Title must be 3-120 characters.", "<br>"]);
      return;
    }
    pendingBlogNewTitle = false;
    startBlogEditor({
      title,
      slug: toSlug(title) || `post-${Date.now()}`,
      excerpt: title,
      tags: [],
      status: "draft",
      lines: [`# ${title}`],
      coverImage: null,
      images: []
    });
    return;
  }

  trackCommandUse(aliasOrCmd);
  void trackAnalyticsEvent("command_run", aliasOrCmd, { input: normalizedInput });
  checkGuideProgress(normalizedInput);

  if (aliasOrCmd === "su") {
    const username = args[0];
    if (!username) {
      writeLines(["Usage: <span class='command'>'su &lt;admin-username&gt;'</span>", "<br>"]);
      return;
    }
    if (!PASSWORD || !INPUT_HIDDEN) {
      writeLines(["Password prompt unavailable.", "<br>"]);
      return;
    }
    pendingSuUsername = username.trim().toLowerCase();
    passwordPromptMode = "su";
    isPasswordInput = true;
    USERINPUT.disabled = true;
    INPUT_HIDDEN.style.display = "none";
    PASSWORD.style.display = "block";
    PASSWORD_INPUT.value = "";
    setTimeout(() => PASSWORD_INPUT.focus(), 100);
    writeLines(["Enter admin password:", "<br>"]);
    return;
  }

  if (aliasOrCmd === "admin") {
    const action = (args[0] ?? "").toLowerCase();
    const rest = args.slice(1);
    if (!adminAuth) {
      writeLines(["Admin mode is locked. Use <span class='command'>'su &lt;username&gt;'</span>.", "<br>"]);
      return;
    }
    if (!action) {
      showAdminHelp();
      return;
    }
    if (action === "whoami") {
      writeLines([
        "<br>",
        `Role: <span class='command'>${adminAuth.user.role}</span>`,
        `Username: <span class='command'>${adminAuth.user.username}</span>`,
        "<br>"
      ]);
      return;
    }
    if (action === "logout") {
      void logoutAdmin().finally(() => {
        setPromptIdentity(command.username);
        writeLines(["Admin locked. Back to visitor mode.", "<br>"]);
      });
      return;
    }
    if (action === "blog-new") {
      const providedTitle = normalizeBlogTitle(rest.join(" "));
      if (providedTitle) {
        if (!isValidBlogTitle(providedTitle)) {
          writeLines(["Title must be 3-120 characters.", "<br>"]);
          return;
        }
        startBlogEditor({
          title: providedTitle,
          slug: toSlug(providedTitle) || `post-${Date.now()}`,
          excerpt: providedTitle,
          tags: [],
          status: "draft",
          lines: [`# ${providedTitle}`],
          coverImage: null,
          images: []
        });
      } else {
        pendingBlogNewTitle = true;
        if (blogPicker) cancelBlogPicker();
        writeLines([
          "<br>",
          "Enter blog title:",
          "(after title, editor opens automatically)",
          "<br>"
        ]);
      }
      return;
    }
    if (action === "blog-edit") {
      const id = rest[0];
      if (!id) {
        beginBlogSelection("edit");
        return;
      }
      void getAdminBlogById(id)
        .then((result) => {
          const b = result.blog;
          startBlogEditor({
            title: b.title,
            slug: b.slug,
            excerpt: b.excerpt,
            tags: b.tags ?? [],
            status: b.status,
            lines: (b.content ?? "").split("\n"),
            coverImage: b.coverImage?.url && b.coverImage.publicId ? { url: b.coverImage.url, publicId: b.coverImage.publicId } : null,
            images: b.images ?? []
          }, b._id);
        })
        .catch((error: unknown) => writeLines([error instanceof Error ? error.message : "Failed to open editor.", "<br>"]));
      return;
    }
    if (action === "blog-select") {
      const pickAction = (rest[0] ?? "").toLowerCase();
      if (pickAction === "edit" || pickAction === "view" || pickAction === "publish" || pickAction === "delete") {
        beginBlogSelection(pickAction);
      } else {
        writeLines(["Usage: <span class='command'>admin blog-select <edit|view|publish|delete></span>", "<br>"]);
      }
      return;
    }
    if (action === "blog-delete") {
      const id = rest[0];
      if (!id) {
        beginBlogSelection("delete");
        return;
      }
      void deleteAdminBlog(id)
        .then(() => writeLines([`Deleted blog: ${id}`, "<br>"]))
        .catch((error: unknown) => writeLines([error instanceof Error ? error.message : "Failed to delete blog.", "<br>"]));
      return;
    }
    if (action === "blog-publish") {
      const id = rest[0];
      if (!id) {
        beginBlogSelection("publish");
        return;
      }
      void publishAdminBlog(id)
        .then((result) => writeLines([`Published: ${result.blog.title} (${result.blog.status})`, "<br>"]))
        .catch((error: unknown) => writeLines([error instanceof Error ? error.message : "Failed to publish blog.", "<br>"]));
      return;
    }
    if (action === "blog-view") {
      const id = rest[0];
      if (!id) {
        beginBlogSelection("view");
        return;
      }
      void getAdminBlogById(id)
        .then((result) => writeLines([
          "<br>",
          `Title: ${result.blog.title}`,
          `Slug: ${result.blog.slug}`,
          `Status: ${result.blog.status}`,
          ...(!hasEmbeddedImage(result.blog.content ?? "") ? renderCoverImage(result.blog.coverImage?.url, result.blog.title) : []),
          result.blog.excerpt,
          ...((result.blog.content ?? "").split("\n").slice(0, 40).map((line) => renderMarkdownLine(line))),
          "<br>"
        ]))
        .catch((error: unknown) => writeLines([error instanceof Error ? error.message : "Failed to fetch blog.", "<br>"]));
      return;
    }
    if (action === "blogs" || action === "config" || action === "analytics") {
      void (async () => {
        try {
          if (action === "blogs") {
            const data = await getAdminBlogs();
            const lines = data.blogs.slice(0, 20).map((item) => `- ${item._id} | ${item.title} (${item.status}) [${item.slug}]`);
            writeLines(["<br>", `Admin blogs: ${data.pagination?.total ?? data.blogs.length}`, ...(lines.length ? lines : ["No blogs found."]), "<br>"]);
            return;
          }
          if (action === "config") {
            const data = await getAdminConfigSummary();
            const keys = data.data ? Object.keys(data.data) : [];
            writeLines(["<br>", `Config keys: ${keys.length}`, ...(keys.slice(0, 20).map((k) => `- ${k}`)), "<br>"]);
            return;
          }
          const data = await getAdminAnalyticsSummary();
          const eventMax = Math.max(1, ...(data.eventTypes ?? []).map((row) => row.count));
          const commandMax = Math.max(1, ...(data.topCommands ?? []).map((row) => row.count));
          writeLines([
            "<br>",
            `Total events: ${data.totalEvents}`,
            `Unique sessions: ${data.uniqueSessions}`,
            "Event types graph:",
            ...((data.eventTypes ?? []).slice(0, 8).map((row) => `${row._id.padEnd(16)} ${renderBar(row.count, eventMax)} ${row.count}`)),
            "Top commands graph:",
            ...((data.topCommands ?? []).slice(0, 8).map((row) => `${String(row._id ?? "unknown").padEnd(16)} ${renderBar(row.count, commandMax)} ${row.count}`)),
            "<br>"
          ]);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : "Admin API request failed.";
          writeLines([message, "<br>"]);
        }
      })();
      return;
    }
    writeLines([
      "Unknown admin subcommand.",
      "Try: <span class='command'>admin blogs</span>, <span class='command'>admin blog-new</span>, <span class='command'>admin blog-edit &lt;id&gt;</span>, <span class='command'>admin blog-publish &lt;id&gt;</span>",
      "<br>"
    ]);
    return;
  }

  if (aliasOrCmd === "blogs") {
    const mode = (args[0] ?? "").toLowerCase();
    const query = args.slice(1).join(" ").trim();
    void (async () => {
      try {
        if (mode === "tag") {
          const data = await getPublicBlogs(undefined, query);
          writeLines(["<br>", `Blogs by tag '${query}': ${data.pagination?.total ?? data.blogs.length}`, ...data.blogs.map((b, i) => `${i + 1}. ${b.title} [${b.slug}]`), "<br>"]);
          return;
        }
        const search = mode === "search" ? query : args.join(" ").trim();
        const data = await getPublicBlogs(search || undefined);
        writeLines(["<br>", `Published blogs: ${data.pagination?.total ?? data.blogs.length}`, ...data.blogs.map((b, i) => `${i + 1}. ${b.title} - ${b.excerpt}`), "<br>"]);
      } catch (error: unknown) {
        writeLines([error instanceof Error ? error.message : "Failed to fetch blogs.", "<br>"]);
      }
    })();
    return;
  }

  if (aliasOrCmd === "blog") {
    const mode = (args[0] ?? "").toLowerCase();
    if (mode === "search") {
      const query = args.slice(1).join(" ").trim();
      void getPublicBlogs(query || undefined)
        .then((data) => writeLines(["<br>", `Search results: ${data.pagination?.total ?? data.blogs.length}`, ...data.blogs.map((b) => `- ${b.title} [${b.slug}]`), "<br>"]))
        .catch((error: unknown) => writeLines([error instanceof Error ? error.message : "Search failed.", "<br>"]));
      return;
    }
    if (mode === "view") {
      const slug = args[1];
      if (!slug) {
        writeLines(["Usage: <span class='command'>blog view <slug></span>", "<br>"]);
        return;
      }
      void getPublicBlogBySlug(slug)
        .then((data) => writeLines([
          "<br>",
          data.blog.title,
          ...(!hasEmbeddedImage(data.blog.content) ? renderCoverImage(data.blog.coverImage?.url, data.blog.title) : []),
          data.blog.excerpt,
          ...(data.blog.content.split("\n").slice(0, 40).map((line) => renderMarkdownLine(line))),
          "<br>"
        ]))
        .catch((error: unknown) => writeLines([error instanceof Error ? error.message : "Failed to fetch blog.", "<br>"]));
      return;
    }
    writeLines(["Usage: <span class='command'>blog view <slug></span> | <span class='command'>blog search <query></span>", "<br>"]);
    return;
  }

  executeCommand({
    input,
    aliasOrCmd,
    args,
    writeLines,
    resetWriteLines: () => {
      if (!TERMINAL || !WRITELINESCOPY) return;
      TERMINAL.innerHTML = "";
      TERMINAL.appendChild(WRITELINESCOPY);
      mutWriteLines = WRITELINESCOPY;
    },
    registerVisit,
    runGuidedModeStart,
    projectDeepDive,
    openTarget,
    downloadResume,
    showHistory,
    showMan,
    showKeys,
    getScenarioNames,
    runScenario,
    showStats,
    showVersion,
    showStatus,
    session: SESSION,
    themes: THEMES,
    applyTheme,
    applyMotionPreference,
    persistSession,
    resetPreferences,
    getPreferenceSnapshot,
    listVirtual,
    readVirtualFile,
    questSteps: QUEST_STEPS,
    social: SOCIAL,
    bookingLink: BOOKING_LINK,
    passwordEl: PASSWORD,
    userInputEl: USERINPUT,
    inputHiddenEl: INPUT_HIDDEN,
    passwordInputEl: PASSWORD_INPUT,
    setPasswordInputMode: (value) => {
      isPasswordInput = value;
    },
    isSudo,
    getCommandSuggestions
  });

  updateQuestProgress();
}

function writeLines(message: string[]) {
  message.forEach((item, idx) => displayText(item, idx));
}

function displayText(item: string, idx: number) {
  const isHelpLayout = item.includes("help-layout");
  const isHelpMeta = item.includes("Help usage:") || item.includes("Types:") || item.includes("Press <span class='keys'>[");
  const base = isHelpLayout || isHelpMeta ? 55 : 35;
  const delay = SESSION.reducedMotion ? 0 : base * idx;
  setTimeout(() => {
    if (!mutWriteLines) return;
    if (!mutWriteLines.parentNode) return;
    const element = document.createElement(isHelpLayout ? "div" : "p");
    if (isHelpLayout) element.classList.add("no-line-anim");
    element.innerHTML = item;
    mutWriteLines.parentNode.insertBefore(element, mutWriteLines);
    scrollToBottom();
  }, delay);
}

function revertPasswordChanges() {
  if (!INPUT_HIDDEN || !PASSWORD) return;
  PASSWORD_INPUT.value = "";
  USERINPUT.disabled = false;
  INPUT_HIDDEN.style.display = "block";
  PASSWORD.style.display = "none";
  isPasswordInput = false;
  passwordPromptMode = null;
  setTimeout(() => USERINPUT.focus(), 150);
}

function passwordHandler() {
  if (passwordPromptMode === "su") {
    const password = PASSWORD_INPUT.value;
    PASSWORD_INPUT.value = "";
    if (!pendingSuUsername) {
      writeLines(["Missing admin username. Run <span class='command'>'su &lt;username&gt;'</span> again.", "<br>"]);
      revertPasswordChanges();
      return;
    }
    void loginAdmin(pendingSuUsername, password)
      .then(() => {
        setPromptIdentity(adminAuth?.user.username ?? command.username);
        writeLines([
          "<br>",
          `Admin unlocked. Welcome <span class='command'>${adminAuth?.user.username ?? "admin"}</span>.`,
          "Run <span class='command'>'admin'</span> to see admin commands.",
          "<br>"
        ]);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Admin login failed.";
        writeLines(["<br>", message, "<br>"]);
      })
      .finally(() => {
        revertPasswordChanges();
      });
    return;
  }

  if (passwordCounter === 2) {
    writeLines(["<br>", "INCORRECT PASSWORD.", "PERMISSION NOT GRANTED.", "<br>"]);
    revertPasswordChanges();
    passwordCounter = 0;
    return;
  }
  if (PASSWORD_INPUT.value === SUDO_PASSWORD) {
    writeLines(["<br>", "PERMISSION GRANTED.", "Try <span class='command'>'rm -rf src'</span>", "<br>"]);
    revertPasswordChanges();
    isSudo = true;
    return;
  }
  PASSWORD_INPUT.value = "";
  passwordCounter++;
}

function easterEggStyles() {
  const bars = document.getElementById("bars");
  const span = document.getElementsByTagName("span");
  if (bars) {
    bars.innerHTML = "";
    bars.remove();
  }
  if (MAIN) MAIN.style.border = "none";
  document.body.style.backgroundColor = "black";
  document.body.style.fontFamily = "VT323, monospace";
  document.body.style.fontSize = "20px";
  document.body.style.color = "white";
  for (let i = 0; i < span.length; i++) {
    span[i].style.color = "white";
  }
  USERINPUT.style.backgroundColor = "black";
  USERINPUT.style.color = "white";
  USERINPUT.style.fontFamily = "VT323, monospace";
  USERINPUT.style.fontSize = "20px";
  if (PROMPT) PROMPT.style.color = "white";
}

function registerServiceWorker() {
  if (swRegistered || (window as Window & { __webshellSwRegistered?: boolean }).__webshellSwRegistered) return;
  swRegistered = true;
  (window as Window & { __webshellSwRegistered?: boolean }).__webshellSwRegistered = true;
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .then(() => caches.keys())
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("webshell-cache-")).map((key) => caches.delete(key))))
      .then(() => navigator.serviceWorker.register("/sw-v3.js"))
      .catch(() => {
        console.warn("Service worker recovery failed.");
      });
  });
}

function initEventListeners() {
  if (listenersInitialized || (window as Window & { __webshellListenersInit?: boolean }).__webshellListenersInit) return;
  listenersInitialized = true;
  (window as Window & { __webshellListenersInit?: boolean }).__webshellListenersInit = true;
  if (HOST) HOST.innerText = command.hostname;
  if (USER) USER.innerText = command.username;
  if (PRE_HOST) PRE_HOST.innerText = command.hostname;
  if (PRE_USER) PRE_USER.innerText = command.username;
  setPromptIdentity(adminAuth?.user.username ?? command.username);
  SESSION.adminMode = Boolean(adminAuth);
  persistSession();

  window.addEventListener("load", () => {
    if (adminAuth) {
      void refreshAdminSession()
        .then(() => {
          SESSION.adminMode = true;
          persistSession();
          setPromptIdentity(adminAuth?.user.username ?? command.username);
        })
        .catch(() => {
          adminAuth = null;
          persistAdminAuth(null);
          SESSION.adminMode = false;
          persistSession();
          setPromptIdentity(command.username);
        });
    }
    void trackAnalyticsEvent("page_view", "boot", { userAgent: navigator.userAgent });
    applyTheme(SESSION.theme);
    applyMotionPreference();
    const startup = command.startup;
    const shouldShowBanner = startup?.showBanner ?? true;
    const startupDelay = shouldShowBanner ? Math.max(200, BANNER.length * 40) : 0;
    if (shouldShowBanner) {
      writeLines(BANNER);
    } else {
      writeLines(["<br>"]);
    }

    if (startup?.compact) {
      const lines = Array.isArray(startup.hintLines) ? startup.hintLines.filter(Boolean) : [];
      if (lines.length > 0) {
        setTimeout(() => {
          writeLines([
            ...lines,
            "<br>"
          ]);
        }, startupDelay);
      }
    } else {
      setTimeout(() => {
        writeLines([
          "Type <span class='cmd-chip' data-command='start'>start</span> for guided mode or <span class='cmd-chip' data-command='help'>help</span> to explore.",
          "<br>"
        ]);
      }, startupDelay);
    }
    setTimeout(() => USERINPUT.focus(), 80);
    setTimeout(() => updateInputState(), 120);
  });

  USERINPUT.addEventListener("keydown", userInputHandler);
  USERINPUT.addEventListener("input", updateInputState);
  PASSWORD_INPUT.addEventListener("keydown", userInputHandler);

  window.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const chip = target.closest("[data-command]") as HTMLElement | null;
    if (chip?.dataset.command) {
      USERINPUT.value = chip.dataset.command;
      updateInputState();
      enterKey();
      return;
    }
    if (target.tagName !== "A" && target.tagName !== "INPUT") {
      USERINPUT.focus();
    }
  });

  window.addEventListener("keydown", (e) => {
    if (blogPicker || isBlogEditorMode) {
      if (document.activeElement !== USERINPUT && document.activeElement !== PASSWORD_INPUT) {
        USERINPUT.focus();
      }
      return;
    }
    if (e.ctrlKey && (e.key === "r" || e.key === "R")) {
      e.preventDefault();
      const needle = USERINPUT.value.trim().toLowerCase();
      const matched = [...HISTORY].reverse().find((cmd) => cmd.toLowerCase().includes(needle));
      if (matched) {
        USERINPUT.value = matched;
        updateInputState();
      }
      return;
    }
    if (
      document.activeElement !== USERINPUT &&
      document.activeElement !== PASSWORD_INPUT &&
      !e.ctrlKey && !e.altKey && !e.metaKey
    ) {
      USERINPUT.focus();
    }
  });

  USERINPUT.setAttribute("autocomplete", "new-password");
  USERINPUT.setAttribute("autocorrect", "off");
  USERINPUT.setAttribute("aria-autocomplete", "none");
  USERINPUT.setAttribute("inputmode", "text");
  USERINPUT.setAttribute("name", "terminal-input");
  updateInputState();
}

registerServiceWorker();
initEventListeners();
