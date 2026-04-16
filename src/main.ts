import command from '../config.json' assert { type: 'json' };
import { HELP } from "./commands/help";
import { BANNER } from "./commands/banner";
import { ABOUT } from "./commands/about";
import { DEFAULT } from "./commands/default";
import { PROJECTS } from "./commands/projects";
import { createWhoami } from "./commands/whoami";
import { EDUCATION } from './commands/education';

type ThemeName = "retro" | "neon" | "minimal";

interface SessionState {
  theme: ThemeName;
  reducedMotion: boolean;
  sound: boolean;
  unlockedSecret: boolean;
  visited: string[];
  guideStep: number;
  history: string[];
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

const STORAGE_KEY = "webshell.session.v3";
const THEMES: Record<ThemeName, Theme> = {
  retro: {
    bg: "#002b36",
    fg: "#F8DDE5",
    border: "#A3CCBE",
    banner: "#FF9951",
    promptDefault: "#268bd2",
    promptUser: "#FE6BC9",
    promptHost: "#70FDFF",
    promptInput: "#98E5A5",
    linkText: "#B6AAEE",
    linkHighlight: "#8ae234",
    linkHighlightText: "#555753",
    commandText: "#98E5A5",
    inputValid: "#98E5A5",
    inputInvalid: "#FF6B81"
  },
  neon: {
    bg: "#0C0623",
    fg: "#E9EBFF",
    border: "#FFADE2",
    banner: "#FF9951",
    promptDefault: "#A5A7A7",
    promptUser: "#FE6BC9",
    promptHost: "#70FDFF",
    promptInput: "#FF7685",
    linkText: "#B6AAEE",
    linkHighlight: "#FFADE2",
    linkHighlightText: "#0C0623",
    commandText: "#FD9BDB",
    inputValid: "#7CFC98",
    inputInvalid: "#FF6B81"
  },
  minimal: {
    bg: "#0D1117",
    fg: "#C9D1D9",
    border: "#30363D",
    banner: "#58A6FF",
    promptDefault: "#8B949E",
    promptUser: "#79C0FF",
    promptHost: "#A5D6FF",
    promptInput: "#C9D1D9",
    linkText: "#58A6FF",
    linkHighlight: "#1F6FEB",
    linkHighlightText: "#FFFFFF",
    commandText: "#7EE787",
    inputValid: "#7EE787",
    inputInvalid: "#FF7B72"
  }
};

const COMMANDS = [
  "help", "start", "about", "education", "projects", "project", "whoami", "repo", "github", "linkedin",
  "email", "resume", "hire", "book", "banner", "clear", "theme", "motion", "sound", "prefs", "ls", "cat", "open", "quest", "secret", "sudo", "rm"
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

const VIRTUAL_FILES: Record<string, string> = {
  "resume.md": [
    "# Keval S. Chauhan",
    "",
    "Web developer focused on React, TypeScript, Node.js, and product-minded UX.",
    "",
    "## Highlights",
    "- B.Tech IT @ DDU Nadiad (2023-2027)",
    "- Built projects in WebRTC, chat systems, and content platforms",
    "- Passionate about high-performance, polished interfaces",
    "",
    "Use `hire` or `email` to contact me quickly."
  ].join("\n"),
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
  theme: "neon",
  reducedMotion: false,
  sound: true,
  unlockedSecret: false,
  visited: [],
  guideStep: -1,
  history: []
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
      history: Array.isArray(parsed.history) ? parsed.history.filter(Boolean).slice(-80) : []
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
      arrowKeys(e.key);
      e.preventDefault();
      break;
    case "ArrowDown":
      arrowKeys(e.key);
      e.preventDefault();
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
  userInput = USERINPUT.value.trim();
  const output = bareMode ? userInput : `<span class='output'>${userInput}</span>`;

  if (userInput.length > 0) {
    HISTORY.push(userInput);
    historyIdx = HISTORY.length;
    SESSION.history = HISTORY.slice(-80);
    persistSession();
  }

  const div = document.createElement("div");
  div.innerHTML = `<span id="prompt">${PROMPT.innerHTML}</span> ${output}`;
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
    writeLines([
      "<br>",
      `Suggestions: ${matches.map((m) => `<span class='cmd-chip' data-command='${m}'>${m}</span>`).join(" ")}`,
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
  if (aliasOrCmd === "project") {
    return getProjectSuggestions(argPrefix).map(complete);
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
    case "rm":
      if (argStr === "-rf") return true;
      if (argStr.startsWith("-rf ")) return true;
      return false;
    default:
      return true;
  }
}

function updateInputState() {
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

function downloadResume() {
  const link = document.createElement("a");
  link.href = "/res/resume.pdf";
  link.download = "Keval-Chauhan-Resume.pdf";
  link.target = "_blank";
  document.body.appendChild(link);
  link.click();
  link.remove();
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
    window.open(REPO_LINK, "_blank");
    return true;
  }
  if (target === "github") {
    window.open(`https://github.com/${SOCIAL.github}`, "_blank");
    return true;
  }
  if (target === "linkedin") {
    window.open(`https://www.linkedin.com/in/${SOCIAL.linkedin}`, "_blank");
    return true;
  }
  if (target === "email") {
    window.open(`mailto:${SOCIAL.email}?subject=Portfolio%20Inquiry`, "_blank");
    return true;
  }
  if (target === "resume") {
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

function commandHandler(input: string) {
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
  checkGuideProgress(normalizedInput);

  switch (aliasOrCmd) {
    case "clear":
      setTimeout(() => {
        if (!TERMINAL || !WRITELINESCOPY) return;
        TERMINAL.innerHTML = "";
        TERMINAL.appendChild(WRITELINESCOPY);
        mutWriteLines = WRITELINESCOPY;
      });
      break;
    case "banner":
      writeLines(BANNER);
      registerVisit("banner");
      break;
    case "start":
      runGuidedModeStart();
      registerVisit("start");
      break;
    case "help":
      writeLines(HELP);
      registerVisit("help");
      break;
    case "whoami":
      writeLines(createWhoami());
      registerVisit("whoami");
      break;
    case "about":
      writeLines(ABOUT);
      registerVisit("about");
      break;
    case "education":
      writeLines(EDUCATION);
      registerVisit("education");
      break;
    case "projects":
      writeLines(PROJECTS);
      registerVisit("projects");
      break;
    case "project":
      writeLines(projectDeepDive(args.join(" ")));
      registerVisit("project");
      break;
    case "repo":
      writeLines(["Redirecting to repo...", "<br>"]);
      setTimeout(() => window.open(REPO_LINK, "_blank"), 300);
      registerVisit("repo");
      break;
    case "linkedin":
    case "github":
      writeLines([`Redirecting to ${aliasOrCmd}...`, "<br>"]);
      setTimeout(() => openTarget(aliasOrCmd), 300);
      registerVisit(aliasOrCmd);
      break;
    case "email":
      writeLines([`Opening mail client for <span class='command'>${SOCIAL.email}</span>...`, "<br>"]);
      setTimeout(() => openTarget("email"), 300);
      registerVisit("email");
      break;
    case "resume":
      writeLines(["Downloading resume PDF...", "If it does not download, add your file at <span class='command'>public/resume.pdf</span> or <span class='command'>res/resume.pdf</span>.", "<br>"]);
      setTimeout(() => downloadResume(), 200);
      registerVisit("resume");
      break;
    case "hire":
      writeLines([
        "<br>",
        "Let us build something outstanding.",
        `Email: <a href='mailto:${SOCIAL.email}'>${SOCIAL.email}</a>`,
        `LinkedIn: <a href='https://www.linkedin.com/in/${SOCIAL.linkedin}' target='_blank'>/${SOCIAL.linkedin}</a>`,
        "Quick actions: <span class='cmd-chip' data-command='email'>email</span> <span class='cmd-chip' data-command='book'>book</span> <span class='cmd-chip' data-command='projects'>projects</span>",
        "<br>"
      ]);
      registerVisit("hire");
      break;
    case "book":
      writeLines(["Opening booking/profile link...", "<br>"]);
      setTimeout(() => window.open(BOOKING_LINK, "_blank"), 300);
      registerVisit("book");
      break;
    case "theme":
      if (args.length === 0) {
        writeLines([
          "<br>",
          `Active theme: <span class='command'>${SESSION.theme}</span>`,
          "Available: retro, neon, minimal",
          "Usage: <span class='command'>theme neon</span>",
          "<br>"
        ]);
        break;
      }
      if (args[0] in THEMES) {
        applyTheme(args[0] as ThemeName);
        writeLines([`Theme switched to <span class='command'>${args[0]}</span>.`, "<br>"]);
        registerVisit("theme");
      } else {
        writeLines(["Unknown theme.", "<br>"]);
      }
      break;
    case "motion":
      if (args[0] === "on") SESSION.reducedMotion = true;
      else if (args[0] === "off") SESSION.reducedMotion = false;
      else SESSION.reducedMotion = !SESSION.reducedMotion;
      applyMotionPreference();
      persistSession();
      writeLines([`Reduced motion: <span class='command'>${SESSION.reducedMotion ? "on" : "off"}</span>`, "<br>"]);
      break;
    case "sound":
      if (args[0] === "on") SESSION.sound = true;
      else if (args[0] === "off") SESSION.sound = false;
      else SESSION.sound = !SESSION.sound;
      persistSession();
      writeLines([`Typing sound: <span class='command'>${SESSION.sound ? "on" : "off"}</span>`, "<br>"]);
      break;
    case "prefs":
      if (args[0] === "reset") {
        resetPreferences();
        writeLines(["Preferences reset to default and saved in localStorage.", "<br>"]);
        break;
      }
      if (args[0] === "export") {
        writeLines([
          "<br>",
          "Stored preferences:",
          JSON.stringify(getPreferenceSnapshot(), null, 2).replace(/\n/g, "<br>").replace(/ /g, "&nbsp;"),
          "<br>"
        ]);
        break;
      }
      writeLines([
        "<br>",
        "Preferences are stored in localStorage.",
        `Current: theme=<span class='command'>${SESSION.theme}</span>, motion=<span class='command'>${SESSION.reducedMotion ? "on" : "off"}</span>, sound=<span class='command'>${SESSION.sound ? "on" : "off"}</span>`,
        "Commands: <span class='command'>prefs export</span> <span class='command'>prefs reset</span>",
        "<br>"
      ]);
      break;
    case "ls": {
      const items = listVirtual(args[0]);
      if (!items.length) {
        writeLines(["Path not found.", "<br>"]);
      } else {
        writeLines(["<br>", ...items, "<br>"]);
      }
      break;
    }
    case "cat": {
      const file = args.join(" ");
      if (!file) {
        writeLines(["Usage: <span class='command'>'cat &lt;file&gt;'</span>", "<br>"]);
        break;
      }
      const content = readVirtualFile(file);
      if (!content) {
        writeLines(["File not found.", "<br>"]);
        break;
      }
      writeLines(["<br>", ...content.split("\n"), "<br>"]);
      if (file === "resume.md") registerVisit("cat resume.md");
      break;
    }
    case "open": {
      const target = args.join(" ");
      if (!target) {
        writeLines(["Usage: <span class='command'>'open &lt;repo|github|linkedin|email&gt;'</span>", "<br>"]);
        break;
      }
      if (target.startsWith("project ")) {
        const projectArg = target.replace("project ", "");
        const selected = projectDeepDive(projectArg);
        writeLines(selected);
        break;
      }
      if (!openTarget(target)) {
        writeLines(["Unsupported open target.", "<br>"]);
      } else {
        writeLines([`Opening ${target}...`, "<br>"]);
      }
      break;
    }
    case "quest": {
      const completed = QUEST_STEPS.filter((item) => SESSION.visited.includes(item.id));
      const pending = QUEST_STEPS.filter((item) => !SESSION.visited.includes(item.id));
      writeLines([
        "<br>",
        `Quest progress: ${completed.length}/${QUEST_STEPS.length}`,
        `Completed: ${completed.map((item) => item.label).join(", ") || "none"}`,
        `Left: ${pending.map((item) => item.label).join(", ") || "none"}`,
        SESSION.unlockedSecret ? "Secret unlocked: yes" : "Secret unlocked: no",
        "<br>"
      ]);
      break;
    }
    case "secret":
      if (!SESSION.unlockedSecret) {
        writeLines(["Secret is locked. Run <span class='command'>'quest'</span> for clues.", "<br>"]);
      } else {
        writeLines([
          "<br>",
          "Unlocked: Project Night Terminal",
          "A private concept for command-driven storytelling and 3D terminal transitions.",
          "If you want access, run <span class='command'>'email'</span> with subject: Secret Project.",
          "<br>"
        ]);
      }
      break;
    case "sudo":
      if (!PASSWORD) return;
      isPasswordInput = true;
      USERINPUT.disabled = true;
      if (INPUT_HIDDEN) INPUT_HIDDEN.style.display = "none";
      PASSWORD.style.display = "block";
      setTimeout(() => PASSWORD_INPUT.focus(), 100);
      break;
    case "rm":
      if (args[0] === "-rf") {
        if (isSudo) {
          writeLines(["Usage: <span class='command'>'rm -rf &lt;dir&gt;'</span>", "<br>"]);
        } else {
          writeLines(["Permission not granted.", "<br>"]);
        }
        break;
      }
      writeLines(DEFAULT(input));
      break;
    default: {
      const notFound = DEFAULT(input);
      const suggestions = getCommandSuggestions(aliasOrCmd);
      if (suggestions.length > 0) {
        notFound.push(`Did you mean: ${suggestions.map((cmd) => `<span class='cmd-chip' data-command='${cmd}'>${cmd}</span>`).join(" ")}`);
      }
      writeLines(notFound);
      break;
    }
  }

  updateQuestProgress();
}

function writeLines(message: string[]) {
  message.forEach((item, idx) => displayText(item, idx));
}

function displayText(item: string, idx: number) {
  const delay = SESSION.reducedMotion ? 0 : 35 * idx;
  setTimeout(() => {
    if (!mutWriteLines) return;
    const p = document.createElement("p");
    p.innerHTML = item;
    mutWriteLines.parentNode!.insertBefore(p, mutWriteLines);
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
  setTimeout(() => USERINPUT.focus(), 150);
}

function passwordHandler() {
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
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      console.warn("Service worker registration failed.");
    });
  });
}

function initEventListeners() {
  if (HOST) HOST.innerText = command.hostname;
  if (USER) USER.innerText = command.username;
  if (PRE_HOST) PRE_HOST.innerText = command.hostname;
  if (PRE_USER) PRE_USER.innerText = command.username;

  window.addEventListener("load", () => {
    applyTheme(SESSION.theme);
    applyMotionPreference();
    writeLines(BANNER);
    writeLines([
      "Type <span class='cmd-chip' data-command='start'>start</span> for guided mode or <span class='cmd-chip' data-command='help'>help</span> to explore.",
      "<br>"
    ]);
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
  USERINPUT.setAttribute("name", "terminal-input");
  updateInputState();
}

registerServiceWorker();
initEventListeners();
