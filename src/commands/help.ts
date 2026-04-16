const helpObj = {
  "discover": [
    ["'about'", "Who made this website?"],
    ["'education'", "What did I study?"],
    ["'projects'", "Maybe there's something interesting."],
    ["'whoami'", "A perplexing question."]
  ],
  "navigate": [
    ["'repo'", "View the GitHub repository."],
    ["'github'", "Open my GitHub profile."],
    ["'linkedin'", "Open my LinkedIn profile."],
    ["'banner'", "Display the banner again."]
  ],
  "system": [
    ["'clear'", "Clear the terminal."],
    ["'sudo'", "Unlock hidden commands."],
    ["'ls'", "List directory contents."]
  ]
}

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

const createHelp = () : string[] => {
  const help : string[] = []
  help.push("<br>")
  help.push("Quick start: <span class='cmd-chip' data-command='about'>about</span> <span class='cmd-chip' data-command='projects'>projects</span> <span class='cmd-chip' data-command='education'>education</span> <span class='cmd-chip' data-command='repo'>repo</span>");
  help.push("<br>");
  pushCommandSection(help, "Discover", helpObj.discover);
  pushCommandSection(help, "Navigate", helpObj.navigate);
  pushCommandSection(help, "System", helpObj.system);

  help.push("<br>");
  help.push("Press <span class='keys'>[Tab]</span> for auto completion.");
  help.push("Press <span class='keys'>[Esc]</span> to clear the input line.");
  help.push("Press <span class='keys'>[↑][↓]</span> to scroll through your history of commands.");
  help.push("<br>");
  return help
}

export const HELP = createHelp();
