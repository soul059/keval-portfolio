const helpObj = {
  "discover": [
    ["'start'", "Run guided portfolio tour."],
    ["'about'", "Who made this website?"],
    ["'education'", "What did I study?"],
    ["'projects'", "Maybe there's something interesting."],
    ["'project <name>'", "Open a detailed project card."],
    ["'whoami'", "A perplexing question."],
    ["'demo <scenario>'", "Run a scripted demo flow."]
  ],
  "navigate": [
    ["'repo'", "View the GitHub repository."],
    ["'github'", "Open my GitHub profile."],
    ["'linkedin'", "Open my LinkedIn profile."],
    ["'email'", "Open email composer."],
    ["'resume'", "Download resume PDF."],
    ["'history'", "Show persisted command history."],
    ["'hire'", "Show quick collaboration actions."],
    ["'book'", "Open LinkedIn for booking/contact."],
    ["'banner'", "Display the banner again."]
  ],
  "terminalOs": [
    ["'ls [path]'", "List virtual files/directories."],
    ["'cat <file>'", "Read virtual files (resume.md, skills.md)."],
    ["'open <target>'", "Open repo/github/linkedin/email/resume."],
    ["'man <topic>'", "Read command manual pages."],
    ["'keys'", "Show keyboard shortcuts."],
    ["'stats'", "Show local command usage stats."],
    ["'version'", "Show site version metadata."],
    ["'status'", "Show current availability status."],
    ["'quest'", "Show easter quest progress."],
    ["'secret'", "Reveal hidden project after unlock."]
  ],
  "system": [
    ["'theme [retro|neon|minimal]'", "Switch terminal theme."],
    ["'motion [on|off]'", "Toggle reduced motion."],
    ["'sound [on|off]'", "Toggle typing sound."],
    ["'prefs [export|reset]'", "Manage local storage preferences."],
    ["'clear'", "Clear the terminal."],
    ["'sudo'", "Unlock hidden commands."],
    ["'ls'", "List directory contents."]
  ]
}

type HelpSection = keyof typeof helpObj;

const sectionOrder: HelpSection[] = ["discover", "navigate", "terminalOs", "system"];
const sectionTitles: Record<HelpSection, string> = {
  discover: "Discover",
  navigate: "Navigate",
  terminalOs: "Terminal OS",
  system: "System"
};
export const HELP_TYPES = ["discover", "navigate", "terminalos", "system"] as const;

const pushCommandSection = (help: string[], title: string, commands: string[][]) => {
  const SPACE = "&nbsp;";
  help.push(`<span class='keys'>${title}</span>`);
  commands.forEach((ele) => {
    let string = "";
    string += SPACE.repeat(2);
    string += "<span class='command'>";
    string += ele[0];
    string += "</span>";
    string += SPACE.repeat(Math.max(2, 17 - ele[0].length));
    string += ele[1];
    help.push(string);
  });
  help.push("<br>");
}

const createHelpAll = () : string[] => {
  const help : string[] = []
  help.push("<br>")
  help.push("Quick start: <span class='cmd-chip' data-command='start'>start</span> <span class='cmd-chip' data-command='about'>about</span> <span class='cmd-chip' data-command='projects'>projects</span> <span class='cmd-chip' data-command='hire'>hire</span>");
  help.push("<br>");
  sectionOrder.forEach((section) => {
    pushCommandSection(help, sectionTitles[section], helpObj[section]);
  });

  help.push("<br>");
  help.push("Help usage:");
  help.push("<span class='command'>'help'</span> - show all sections.");
  help.push("<span class='command'>'help &lt;type&gt;'</span> - show one section.");
  help.push(`Types: ${HELP_TYPES.join(", ")}`);
  help.push("<br>");
  help.push("Press <span class='keys'>[Tab]</span> for auto completion.");
  help.push("Press <span class='keys'>[Esc]</span> to clear the input line.");
  help.push("Press <span class='keys'>[↑][↓]</span> to scroll through your history of commands.");
  help.push("<br>");
  return help
}

export const HELP = createHelpAll();

export const createHelpByType = (type: string): string[] => {
  const normalized = type.toLowerCase();
  const map: Record<string, HelpSection> = {
    discover: "discover",
    navigate: "navigate",
    terminalos: "terminalOs",
    system: "system"
  };
  const section = map[normalized];
  if (!section) {
    return [
      "<br>",
      "Unknown help type.",
      `Valid types: ${HELP_TYPES.join(", ")}`,
      "<br>"
    ];
  }

  const help: string[] = [];
  help.push("<br>");
  pushCommandSection(help, sectionTitles[section], helpObj[section]);
  help.push("<br>");
  return help;
}
