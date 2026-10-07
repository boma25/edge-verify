type Level = 'info' | 'warn' | 'error';

const PREFIX = '[edge-verify]';

function emit(level: Level, scope: string, message: string, data?: unknown) {
  const line = `${PREFIX} ${scope}: ${message}`;
  if (data !== undefined) {
    if (level === 'error') console.error(line, data);
    else if (level === 'warn') console.warn(line, data);
    else console.log(line, data);
    return;
  }
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/** Dev-facing logs — filter Metro / logcat with "edge-verify". */
export const log = {
  info: (scope: string, message: string, data?: unknown) => emit('info', scope, message, data),
  warn: (scope: string, message: string, data?: unknown) => emit('warn', scope, message, data),
  error: (scope: string, message: string, data?: unknown) => emit('error', scope, message, data),
};
