import 'reflect-metadata';

import * as fs from 'node:fs';
import * as path from 'node:path';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { AIDLC_CONFIG, AidlcConfig } from './config/aidlc.config';
import { ToolingProbe } from './shared/infrastructure/tooling.probe';
import { DomainExceptionFilter } from './shared/interface/domain-exception.filter';

/**
 * Reads `.env` into `process.env` before anything else looks at it.
 *
 * Done here rather than through ConfigModule because `loadAidlcConfig` is a plain
 * function the DI container calls during module construction — by then a Nest-lifecycle
 * loader would already be too late, and the symptom is silent: the console reports
 * ai-dlc-verify as missing on a machine where it is installed.
 *
 * Values already in the environment win, so `PORT=8080 node dist/main.js` still works.
 */
function loadDotEnv(): void {
  const file = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(file)) return;

  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (key in process.env) continue;
    process.env[key] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
}

async function bootstrap(): Promise<void> {
  loadDotEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get<AidlcConfig>(AIDLC_CONFIG);
  const logger = new Logger('bootstrap');

  app.enableCors({ origin: config.corsOrigins, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new DomainExceptionFilter());
  app.enableShutdownHooks();

  // Fail loudly at boot rather than on the first click: a console pointed at a controller
  // it cannot run is read-only, and the user should learn that from the log, not from a
  // button that silently does nothing.
  const tooling = await app.get(ToolingProbe).status(true);
  if (!tooling.available) {
    logger.error(`AI-DLC controller unavailable at ${tooling.corePath}: ${tooling.error}`);
    logger.error('Reads will work; every gate and ticket action will fail until this is fixed.');
  } else {
    logger.log(`controller ready: uow_graph ${tooling.uowGraphVersion} (ruleset ${tooling.ruleset})`);
  }

  // Loopback unless told otherwise. This API has no authentication of its own — it
  // browses the filesystem, runs the controller as a subprocess and can launch agent
  // CLIs, so binding every interface by default puts all of that on the local network.
  await app.listen(config.port, config.host);
  logger.log(`AI-DLC Console API on http://${config.host}:${config.port}`);
  // Only meaningful outside a container. Inside one, 0.0.0.0 is the container's own
  // interfaces and the publish mapping decides what the host exposes, so warning here
  // would cry wolf on every single boot.
  if (config.host === '0.0.0.0' && !fs.existsSync('/.dockerenv')) {
    logger.warn('bound to every interface with no authentication — put an authenticating proxy in front, or set HOST=127.0.0.1');
  }
}

void bootstrap();
