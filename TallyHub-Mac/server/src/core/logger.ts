/** Lightweight logger (Mac server) */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
const LEVELS: LogLevel[] = ['error', 'warn', 'info', 'debug'];
const envLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
const active = LEVELS.includes(envLevel as LogLevel) ? (envLevel as LogLevel) : 'info';
function idx(l: LogLevel){ return LEVELS.indexOf(l); }
function ts(){ return new Date().toISOString(); }
function enabled(l: LogLevel){ return idx(l) <= idx(active); }
export const logger = {
  error: (m: string, meta?: any) => enabled('error') && console.error(`[${ts()}] ERROR  ${m}`, meta ?? ''),
  warn:  (m: string, meta?: any) => enabled('warn')  && console.warn(`[${ts()}] WARN   ${m}`, meta ?? ''),
  info:  (m: string, meta?: any) => enabled('info')  && console.log(`[${ts()}] INFO   ${m}`, meta ?? ''),
  debug: (m: string, meta?: any) => enabled('debug') && console.debug(`[${ts()}] DEBUG  ${m}`, meta ?? ''),
};
