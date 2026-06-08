// Ambient stub so the Sentry init files typecheck before `npm install`
// pulls in @sentry/nextjs. Real types take over once installed.
declare module '@sentry/nextjs' {
  export function init(options: Record<string, unknown>): void;
  export function captureException(err: unknown): void;
  export function captureMessage(msg: string): void;
}
