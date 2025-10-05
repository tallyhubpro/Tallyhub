/** Lightweight logger with levels (error,warn,info,debug). Controlled by LOG_LEVEL env var. */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVELS: LogLevel[] = ['error', 'warn', 'info', 'debug'];
const envLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
const activeIndex = LEVELS.indexOf(envLevel as LogLevel) === -1 ? 2 : LEVELS.indexOf(envLevel as LogLevel);

function ts() {
  return new Date().toISOString();
}

function should(level: LogLevel) {
  return LEVELS.indexOf(level) <= activeIndex;
}

export const logger = {
  error: (msg: string, meta?: any) => should('error') && console.error(`[${ts()}] ERROR  ${msg}`, meta ?? ''),
  warn:  (msg: string, meta?: any) => should('warn')  && console.warn(`[${ts()}] WARN   ${msg}`, meta ?? ''),
  info:  (msg: string, meta?: any) => should('info')  && console.log(`[${ts()}] INFO   ${msg}`, meta ?? ''),
  debug: (msg: string, meta?: any) => should('debug') && console.debug(`[${ts()}] DEBUG  ${msg}`, meta ?? ''),
};
