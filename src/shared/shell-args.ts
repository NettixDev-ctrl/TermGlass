// Parses user-typed shell startup arguments into an argv array. No shell is involved: the result is passed
// straight to the PTY spawn call, so quoting only exists to let one argument contain spaces.
export const MAX_SHELL_ARGS = 32;
export const MAX_SHELL_ARG_LENGTH = 256;
export const MAX_SHELL_ARGS_TEXT = 512;

export type ParsedArgs = { ok: true; args: string[] } | { ok: false; error: string };

export function parseShellArgs(input: string): ParsedArgs {
  if (input.length > MAX_SHELL_ARGS_TEXT) return { ok: false, error: `Arguments are longer than ${MAX_SHELL_ARGS_TEXT} characters.` };
  if (/[\0\r\n]/.test(input)) return { ok: false, error: 'Arguments cannot contain line breaks.' };

  const args: string[] = [];
  let cur = '';
  let started = false;
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === '\\' && quote === '"' && (input[i + 1] === '"' || input[i + 1] === '\\')) cur += input[++i];
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (/\s/.test(ch)) {
      if (started) {
        args.push(cur);
        cur = '';
        started = false;
      }
    } else {
      cur += ch;
      started = true;
    }
  }
  if (quote) return { ok: false, error: `Unclosed ${quote === '"' ? 'double' : 'single'} quote.` };
  if (started) args.push(cur);
  if (args.length > MAX_SHELL_ARGS) return { ok: false, error: `At most ${MAX_SHELL_ARGS} arguments are allowed.` };
  if (args.some((a) => a.length > MAX_SHELL_ARG_LENGTH)) return { ok: false, error: `An argument is longer than ${MAX_SHELL_ARG_LENGTH} characters.` };
  return { ok: true, args };
}
