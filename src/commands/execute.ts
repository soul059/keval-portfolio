import { createHelpAll, createHelpByType } from "./help";
import { ABOUT } from "./about";
import { DEFAULT } from "./default";
import { PROJECTS } from "./projects";
import { createWhoami } from "./whoami";
import { EDUCATION } from "./education";
import { BANNER } from "./banner";

interface QuestStep {
  id: string;
  label: string;
}

interface SessionLike {
  theme: string;
  reducedMotion: boolean;
  sound: boolean;
  visited: string[];
  unlockedSecret: boolean;
  adminMode?: boolean;
}

interface SocialLike {
  email: string;
  linkedin: string;
}

export interface ExecuteCommandContext {
  input: string;
  aliasOrCmd: string;
  args: string[];
  writeLines: (message: string[]) => void;
  resetWriteLines: () => void;
  registerVisit: (marker: string) => void;
  runGuidedModeStart: () => void;
  projectDeepDive: (rawQuery: string) => string[];
  openTarget: (target: string) => boolean;
  downloadResume: () => Promise<void>;
  showHistory: () => void;
  showMan: (topic?: string) => void;
  showKeys: () => void;
  getScenarioNames: () => string[];
  runScenario: (name: string) => void;
  showStats: () => void;
  showVersion: () => void;
  showStatus: () => void;
  session: SessionLike;
  themes: Record<string, unknown>;
  applyTheme: (theme: string) => void;
  applyMotionPreference: () => void;
  persistSession: () => void;
  resetPreferences: () => void;
  getPreferenceSnapshot: () => unknown;
  listVirtual: (pathArg?: string) => string[];
  readVirtualFile: (rawPath: string) => string | null;
  questSteps: QuestStep[];
  social: SocialLike;
  bookingLink: string;
  passwordEl: HTMLElement | null;
  userInputEl: HTMLInputElement;
  inputHiddenEl: HTMLElement | null;
  passwordInputEl: HTMLInputElement;
  setPasswordInputMode: (value: boolean) => void;
  isSudo: boolean;
  getCommandSuggestions: (input: string) => string[];
}

export function executeCommand(ctx: ExecuteCommandContext) {
  const { aliasOrCmd, args } = ctx;
  switch (aliasOrCmd) {
    case "clear":
      setTimeout(() => {
        ctx.resetWriteLines();
      });
      break;
    case "banner":
      ctx.writeLines(BANNER);
      ctx.registerVisit("banner");
      break;
    case "start":
      ctx.runGuidedModeStart();
      ctx.registerVisit("start");
      break;
    case "help":
      if (args[0]) {
        ctx.writeLines(createHelpByType(args[0], Boolean(ctx.session.adminMode)));
      } else {
        ctx.writeLines(createHelpAll(Boolean(ctx.session.adminMode)));
      }
      ctx.registerVisit("help");
      break;
    case "whoami":
      ctx.writeLines(createWhoami());
      ctx.registerVisit("whoami");
      break;
    case "about":
      ctx.writeLines(ABOUT);
      ctx.registerVisit("about");
      break;
    case "education":
      ctx.writeLines(EDUCATION);
      ctx.registerVisit("education");
      break;
    case "projects":
      ctx.writeLines(PROJECTS);
      ctx.registerVisit("projects");
      break;
    case "project":
      ctx.writeLines(ctx.projectDeepDive(args.join(" ")));
      ctx.registerVisit("project");
      break;
    case "repo":
      ctx.writeLines(["Redirecting to repo...", "<br>"]);
      setTimeout(() => ctx.openTarget("repo"), 300);
      ctx.registerVisit("repo");
      break;
    case "linkedin":
    case "github":
      ctx.writeLines([`Redirecting to ${aliasOrCmd}...`, "<br>"]);
      setTimeout(() => ctx.openTarget(aliasOrCmd), 300);
      ctx.registerVisit(aliasOrCmd);
      break;
    case "email":
      ctx.writeLines([`Opening mail client for <span class='command'>${ctx.social.email}</span>...`, "<br>"]);
      setTimeout(() => ctx.openTarget("email"), 300);
      ctx.registerVisit("email");
      break;
    case "resume":
      ctx.writeLines(["Downloading resume PDF...", "If it does not download, add your file at <span class='command'>public/resume.pdf</span> or <span class='command'>res/resume.pdf</span>.", "<br>"]);
      setTimeout(() => { void ctx.downloadResume(); }, 200);
      ctx.registerVisit("resume");
      break;
    case "history":
      ctx.showHistory();
      break;
    case "man":
      ctx.showMan(args[0]);
      break;
    case "keys":
      ctx.showKeys();
      break;
    case "demo":
      if (!args[0]) {
        ctx.writeLines([`Usage: <span class='command'>demo &lt;${ctx.getScenarioNames().join("|") || "scenario"}&gt;</span>`, "<br>"]);
        break;
      }
      ctx.runScenario(args[0]);
      break;
    case "stats":
      ctx.showStats();
      break;
    case "version":
      ctx.showVersion();
      break;
    case "status":
      ctx.showStatus();
      break;
    case "hire":
      ctx.writeLines([
        "<br>",
        "Let us build something outstanding.",
        `Email: <a href='mailto:${ctx.social.email}'>${ctx.social.email}</a>`,
        `LinkedIn: <a href='https://www.linkedin.com/in/${ctx.social.linkedin}' target='_blank'>/${ctx.social.linkedin}</a>`,
        "Quick actions: <span class='cmd-chip' data-command='email'>email</span> <span class='cmd-chip' data-command='book'>book</span> <span class='cmd-chip' data-command='projects'>projects</span>",
        "<br>"
      ]);
      ctx.registerVisit("hire");
      break;
    case "book":
      ctx.writeLines(["Opening booking/profile link...", "<br>"]);
      setTimeout(() => window.open(ctx.bookingLink, "_blank"), 300);
      ctx.registerVisit("book");
      break;
    case "theme":
      if (args.length === 0) {
        ctx.writeLines([
          "<br>",
          `Active theme: <span class='command'>${ctx.session.theme}</span>`,
          "Available: retro, neon, minimal",
          "Usage: <span class='command'>theme neon</span>",
          "<br>"
        ]);
        break;
      }
      if (args[0] in ctx.themes) {
        ctx.applyTheme(args[0]);
        ctx.writeLines([`Theme switched to <span class='command'>${args[0]}</span>.`, "<br>"]);
        ctx.registerVisit("theme");
      } else {
        ctx.writeLines(["Unknown theme.", "<br>"]);
      }
      break;
    case "motion":
      if (args[0] === "on") ctx.session.reducedMotion = true;
      else if (args[0] === "off") ctx.session.reducedMotion = false;
      else ctx.session.reducedMotion = !ctx.session.reducedMotion;
      ctx.applyMotionPreference();
      ctx.persistSession();
      ctx.writeLines([`Reduced motion: <span class='command'>${ctx.session.reducedMotion ? "on" : "off"}</span>`, "<br>"]);
      break;
    case "sound":
      if (args[0] === "on") ctx.session.sound = true;
      else if (args[0] === "off") ctx.session.sound = false;
      else ctx.session.sound = !ctx.session.sound;
      ctx.persistSession();
      ctx.writeLines([`Typing sound: <span class='command'>${ctx.session.sound ? "on" : "off"}</span>`, "<br>"]);
      break;
    case "prefs":
      if (args[0] === "reset") {
        ctx.resetPreferences();
        ctx.writeLines(["Preferences reset to default and saved in localStorage.", "<br>"]);
        break;
      }
      if (args[0] === "export") {
        ctx.writeLines([
          "<br>",
          "Stored preferences:",
          JSON.stringify(ctx.getPreferenceSnapshot(), null, 2).replace(/\n/g, "<br>").replace(/ /g, "&nbsp;"),
          "<br>"
        ]);
        break;
      }
      ctx.writeLines([
        "<br>",
        "Preferences are stored in localStorage.",
        `Current: theme=<span class='command'>${ctx.session.theme}</span>, motion=<span class='command'>${ctx.session.reducedMotion ? "on" : "off"}</span>, sound=<span class='command'>${ctx.session.sound ? "on" : "off"}</span>`,
        "Commands: <span class='command'>prefs export</span> <span class='command'>prefs reset</span>",
        "<br>"
      ]);
      break;
    case "ls": {
      const items = ctx.listVirtual(args[0]);
      if (!items.length) {
        ctx.writeLines(["Path not found.", "<br>"]);
      } else {
        ctx.writeLines(["<br>", ...items, "<br>"]);
      }
      break;
    }
    case "cat": {
      const file = args.join(" ");
      if (!file) {
        ctx.writeLines(["Usage: <span class='command'>'cat &lt;file&gt;'</span>", "<br>"]);
        break;
      }
      const content = ctx.readVirtualFile(file);
      if (!content) {
        ctx.writeLines(["File not found.", "<br>"]);
        break;
      }
      ctx.writeLines(["<br>", ...content.split("\n"), "<br>"]);
      if (file === "resume.md") ctx.registerVisit("cat resume.md");
      break;
    }
    case "open": {
      const target = args.join(" ");
      if (!target) {
        ctx.writeLines(["Usage: <span class='command'>'open &lt;repo|github|linkedin|email&gt;'</span>", "<br>"]);
        break;
      }
      if (target.startsWith("project ")) {
        const projectArg = target.replace("project ", "");
        const selected = ctx.projectDeepDive(projectArg);
        ctx.writeLines(selected);
        break;
      }
      if (!ctx.openTarget(target)) {
        ctx.writeLines(["Unsupported open target.", "<br>"]);
      } else {
        ctx.writeLines([`Opening ${target}...`, "<br>"]);
      }
      break;
    }
    case "quest": {
      const completed = ctx.questSteps.filter((item) => ctx.session.visited.includes(item.id));
      const pending = ctx.questSteps.filter((item) => !ctx.session.visited.includes(item.id));
      ctx.writeLines([
        "<br>",
        `Quest progress: ${completed.length}/${ctx.questSteps.length}`,
        `Completed: ${completed.map((item) => item.label).join(", ") || "none"}`,
        `Left: ${pending.map((item) => item.label).join(", ") || "none"}`,
        ctx.session.unlockedSecret ? "Secret unlocked: yes" : "Secret unlocked: no",
        "<br>"
      ]);
      break;
    }
    case "secret":
      if (!ctx.session.unlockedSecret) {
        ctx.writeLines(["Secret is locked. Run <span class='command'>'quest'</span> for clues.", "<br>"]);
      } else {
        ctx.writeLines([
          "<br>",
          "Unlocked: Project Night Terminal",
          "A private concept for command-driven storytelling and 3D terminal transitions.",
          "If you want access, run <span class='command'>'email'</span> with subject: Secret Project.",
          "<br>"
        ]);
      }
      break;
    case "sudo":
      if (!ctx.passwordEl) return;
      ctx.setPasswordInputMode(true);
      ctx.userInputEl.disabled = true;
      if (ctx.inputHiddenEl) ctx.inputHiddenEl.style.display = "none";
      ctx.passwordEl.style.display = "block";
      setTimeout(() => ctx.passwordInputEl.focus(), 100);
      break;
    case "rm":
      if (args[0] === "-rf") {
        if (ctx.isSudo) {
          ctx.writeLines(["Usage: <span class='command'>'rm -rf &lt;dir&gt;'</span>", "<br>"]);
        } else {
          ctx.writeLines(["Permission not granted.", "<br>"]);
        }
        break;
      }
      ctx.writeLines(DEFAULT(ctx.input));
      break;
    default: {
      const notFound = DEFAULT(ctx.input);
      const suggestions = ctx.getCommandSuggestions(aliasOrCmd);
      if (suggestions.length > 0) {
        notFound.push(`Did you mean: ${suggestions.map((cmd) => `<span class='cmd-chip' data-command='${cmd}'>${cmd}</span>`).join(" ")}`);
      }
      ctx.writeLines(notFound);
      break;
    }
  }
}
