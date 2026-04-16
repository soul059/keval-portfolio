import command from '../config.json' assert {type: 'json'};

(() => {
  const style = document.createElement('style');
  const head = document.head;
  const themes = command.themes as Record<string, {
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
  }> | undefined;
  const selected = (command.defaultTheme && themes?.[command.defaultTheme])
    ? themes[command.defaultTheme]
    : undefined;
  const rootVars = `
    --bg: ${selected?.bg ?? command.colors.background};
    --text: ${selected?.fg ?? command.colors.foreground};
    --border: ${selected?.border ?? command.colors.border.color};
    --banner-color: ${selected?.banner ?? command.colors.banner};
    --prompt-default: ${selected?.promptDefault ?? command.colors.prompt.default};
    --prompt-user: ${selected?.promptUser ?? command.colors.prompt.user};
    --prompt-host: ${selected?.promptHost ?? command.colors.prompt.host};
    --prompt-input: ${selected?.promptInput ?? command.colors.prompt.input};
    --link-text: ${selected?.linkText ?? command.colors.link.text};
    --link-highlight-bg: ${selected?.linkHighlight ?? command.colors.link.highlightColor};
    --link-highlight-text: ${selected?.linkHighlightText ?? command.colors.link.highlightText};
    --command-text: ${selected?.commandText ?? command.colors.commands.textColor};
    --input-valid: ${selected?.inputValid ?? command.colors.commands.textColor};
    --input-invalid: ${selected?.inputInvalid ?? "#ff6b81"};
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
