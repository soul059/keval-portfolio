import command from '../config.json' assert {type: 'json'};

(() => {
  const style = document.createElement('style');
  const head = document.head;
  const rootVars = `
    --bg: ${command.colors.background};
    --text: ${command.colors.foreground};
    --border: ${command.colors.border.color};
    --banner-color: ${command.colors.banner};
    --prompt-default: ${command.colors.prompt.default};
    --prompt-user: ${command.colors.prompt.user};
    --prompt-host: ${command.colors.prompt.host};
    --prompt-input: ${command.colors.prompt.input};
    --link-text: ${command.colors.link.text};
    --link-highlight-bg: ${command.colors.link.highlightColor};
    --link-highlight-text: ${command.colors.link.highlightText};
    --command-text: ${command.colors.commands.textColor};
    --input-valid: ${command.colors.commands.textColor};
    --input-invalid: #ff6b81;
  `;

  head.appendChild(style);


  if (!style.sheet) return;

  if (!command.colors.border.visible) {
    style.sheet.insertRule("#bars {display: none}");
    style.sheet.insertRule("main {border: none}");
  } else {
    style.sheet.insertRule("#bars {background: var(--bg)}");
    style.sheet.insertRule("main {border-color: var(--border)}");
    style.sheet.insertRule("#bar-1 {background: var(--border); color: var(--bg)}");
    style.sheet.insertRule("#bar-2 {background: var(--border)}");
    style.sheet.insertRule("#bar-3 {background: var(--border)}");
    style.sheet.insertRule("#bar-4 {background: var(--border)}");
    style.sheet.insertRule("#bar-5 {background: var(--border)}");
  }

  style.sheet.insertRule(`:root { ${rootVars} }`);
})();
