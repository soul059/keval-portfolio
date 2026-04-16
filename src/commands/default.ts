import command from '../../config.json' assert {type: 'json'};

const createDefault = (input?: string) : string[] => {
  const cmd = input ? `'${input}'` : 'that';
  const prefix = command.messages?.unknownCommandPrefix ?? "Command not found";
  const hint = command.messages?.unknownCommandHint ?? "Type <span class='command'>'help'</span> to see available commands.";
  const defaultMsgArr = [
    "<br>",
    `${prefix}: <span class='command'>${cmd}</span>`,
    hint,
    "<br>"
  ]  
  
  const defaultMsg : string[] = [];
  
  defaultMsgArr.forEach((ele) => {
    defaultMsg.push(ele);
  })

  return defaultMsg;
}

export const DEFAULT = createDefault;
export const DEFAULT_MSG = createDefault();
