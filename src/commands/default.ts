const createDefault = (input?: string) : string[] => {
  const cmd = input ? `'${input}'` : 'that';
  const defaultMsgArr = [
    "<br>",
    `Command not found: <span class='command'>${cmd}</span>`,
    "Type <span class='command'>'help'</span> to see available commands.",
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
