import { buildApp } from './app.js';
import { env } from './config/env.js';
import { flushErrorReports, initErrorReporting, reportError } from './error-reporting.js';
import { installGracefulShutdown } from './shutdown.js';

async function main(): Promise<void> {
  initErrorReporting({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT,
    release: env.APP_RELEASE,
  });

  const app = buildApp();

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    installGracefulShutdown(app, { timeoutMs: env.SHUTDOWN_TIMEOUT_SECONDS * 1000 });
  } catch (error) {
    app.log.error(error, 'server.start.failed');
    reportError(error, 'server.start.failed');
    await flushErrorReports();
    process.exit(1);
  }
}

void main();
