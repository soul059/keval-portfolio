import command from '../../config.json' assert {type: 'json'};

const createBanner = () : string[] => {
  const banner : string[] = [];
  banner.push("<br>")
  command.ascii.forEach((ele) => {
    let bannerString = "";
    //this is for the ascii art
    for (let i = 0; i < ele.length; i++) {
      if (ele[i] === " ") {
        bannerString += "&nbsp;";
      } else {
        bannerString += ele[i];
      }
    }
    
    let eleToPush = `<pre>${bannerString}</pre>`;
    banner.push(eleToPush);
  });  
  banner.push("<br>");
  banner.push("Welcome to WebShell v1.0.0");
  banner.push("Type <span class='command'>'help'</span> for a list of all available commands.");
  banner.push("Try: <span class='cmd-chip' data-command='start'>start</span> <span class='cmd-chip' data-command='about'>about</span> <span class='cmd-chip' data-command='projects'>projects</span> <span class='cmd-chip' data-command='resume'>resume</span>");
  banner.push("Terminal OS: <span class='cmd-chip' data-command='ls'>ls</span> <span class='cmd-chip' data-command='cat resume.md'>cat resume.md</span> <span class='cmd-chip' data-command='theme neon'>theme neon</span>");
  banner.push("Type <span class='command'>'about'</span> to learn more about me.");
  banner.push(`Type <span class='command'>'repo'</span> to view the GitHub repository or click <a href='${command.repoLink}' target='_blank'>here</a>.`);
  banner.push("<br>");
  return banner;
}

export const BANNER = createBanner();
