import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export type StoreDriver = 'file' | 'postgres';

export interface DatabaseConfig {
  url: string;
  /** Applied at boot. Turning this off is for a replica that must not race the migrator. */
  migrateOnBoot: boolean;
  poolMax: number;
}

export interface RedisConfig {
  url: string;
  /** Prefixed so one Redis can serve more than one console without key collisions. */
  keyPrefix: string;
}

export interface ObjectStoreConfig {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
}

export interface AidlcConfig {
  /** Root of the installed ai-dlc-core skill. `scripts/aidlc.py` must sit under it. */
  corePath: string;
  /** Root of ai-dlc-verify, or null when the skill is not installed. */
  verifyPath: string | null;
  pythonBin: string;
  /**
   * Which drivers back the console's own state.
   *
   * `file` keeps everything under `consoleHome`, which is what a laptop wants: no
   * infrastructure to start before `pnpm dev`. `postgres` moves the registry, settings,
   * agent definitions and run transcripts into Postgres, the plan cache into Redis, and
   * the evidence blobs into MinIO — which is what a deployed, multi-user console wants.
   *
   * Plan data is never in either: `.ai/` on disk stays the source of truth, because the
   * controller is a subprocess that reads and writes those files.
   */
  store: StoreDriver;
  /** Console-local state (the tracked-repository registry). Never plan data. */
  consoleHome: string;
  database: DatabaseConfig;
  redis: RedisConfig;
  objectStore: ObjectStoreConfig;
  /**
   * Directories scanned for *installable* skill packages — this repo's `skills/` and
   * `examples/`, not the installed copies. A package is any subdirectory holding a
   * `SKILL.md`.
   */
  skillSources: string[];
  /**
   * Directories the folder picker may walk.
   *
   * Browsing is a directory-disclosure surface: it lets whoever can reach the API
   * enumerate the filesystem it runs on. On a laptop that is the user's own machine and
   * uninteresting; behind a shared deployment it is not, so the walk is confined to these
   * roots and refuses to climb above them.
   */
  browseRoots: string[];
  /**
   * Where a `global`-scoped skill is installed so every project on this machine sees it.
   * A `project`-scoped skill goes to `<repo>/.claude/skills/` instead, which is why this
   * is a single path and not a per-repository setting.
   */
  globalSkillsHome: string;
  port: number;
  /** Interface to bind. Loopback by default: nothing authenticates this API. */
  host: string;
  corsOrigins: string[];
  planCacheTtlMs: number;
  controllerConcurrency: number;
  /**
   * Request header carrying the authenticated user, set by whatever sits in front.
   *
   * When set, it is the only source of the name written into a repository's audit trail.
   * When unset the console is single-user-on-a-laptop and takes the name from the client,
   * which is fine for one person and is not evidence for a team.
   */
  trustedUserHeader: string | null;
}

function expandHome(target: string): string {
  return target.startsWith('~') ? path.join(os.homedir(), target.slice(1)) : target;
}

export function loadAidlcConfig(env: NodeJS.ProcessEnv = process.env): AidlcConfig {
  const skillsRoot = path.join(os.homedir(), '.claude', 'skills');
  const corePath = expandHome(env.AIDLC_CORE_PATH ?? path.join(skillsRoot, 'ai-dlc-core'));

  // ai-dlc-verify installs alongside core, so default to the sibling rather than to null.
  // Getting this wrong is quiet: the verification panel reports "not installed" on a
  // machine where it is installed, and nobody thinks to check an env var they never set.
  const declaredVerify = env.AIDLC_VERIFY_PATH ? expandHome(env.AIDLC_VERIFY_PATH) : null;
  const siblingVerify = path.join(path.dirname(corePath), 'ai-dlc-verify');
  const verifyPath = declaredVerify ?? (fs.existsSync(siblingVerify) ? siblingVerify : null);

  return {
    corePath,
    verifyPath,
    pythonBin: env.AIDLC_PYTHON ?? 'python3',
    skillSources: resolveSkillSources(env),
    browseRoots: (env.AIDLC_BROWSE_ROOTS ?? os.homedir())
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => path.resolve(expandHome(entry))),
    globalSkillsHome: expandHome(env.AIDLC_GLOBAL_SKILLS_HOME ?? path.join(skillsRoot)),
    store: env.AIDLC_STORE === 'postgres' ? 'postgres' : 'file',
    consoleHome: expandHome(env.AIDLC_CONSOLE_HOME ?? '~/.aidlc-console'),
    database: {
      url: env.DATABASE_URL ?? 'postgres://aidlc:aidlc@localhost:5432/aidlc',
      migrateOnBoot: env.AIDLC_DB_MIGRATE !== 'false',
      poolMax: Number(env.AIDLC_DB_POOL_MAX ?? 10),
    },
    redis: {
      url: env.REDIS_URL ?? 'redis://localhost:6379',
      keyPrefix: env.REDIS_KEY_PREFIX ?? 'aidlc:',
    },
    objectStore: {
      endPoint: env.MINIO_ENDPOINT ?? 'localhost',
      port: Number(env.MINIO_PORT ?? 9000),
      useSSL: env.MINIO_USE_SSL === 'true',
      accessKey: env.MINIO_ACCESS_KEY ?? 'aidlc',
      secretKey: env.MINIO_SECRET_KEY ?? 'aidlc-secret',
      bucket: env.MINIO_BUCKET ?? 'aidlc-evidence',
      region: env.MINIO_REGION ?? 'us-east-1',
    },
    port: Number(env.PORT ?? 7777),
    host: env.HOST ?? '127.0.0.1',
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((o) => o.trim()).filter(Boolean),
    planCacheTtlMs: Number(env.PLAN_CACHE_TTL_SECONDS ?? 30) * 1000,
    controllerConcurrency: Number(env.CONTROLLER_CONCURRENCY ?? 4),
    trustedUserHeader: (env.AIDLC_TRUSTED_USER_HEADER ?? '').trim().toLowerCase() || null,
  };
}

/**
 * Where the distributable skill packages are read from.
 *
 * The default walks up from the running API (`apps/api`) to the repo root, because the
 * source of a skill is this checkout — not `~/.claude/skills`, which is a *destination*.
 * Conflating the two would make "sync" copy a directory onto itself and report every
 * skill as permanently up to date.
 *
 * The container sets AIDLC_SKILL_SOURCES explicitly: it bakes the packages in at
 * /opt/aidlc and has no repo checkout to walk up to.
 */
function resolveSkillSources(env: NodeJS.ProcessEnv): string[] {
  const declared = (env.AIDLC_SKILL_SOURCES ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(expandHome);
  if (declared.length > 0) return declared;

  const repoRoot = path.resolve(process.cwd(), '..', '..');
  return [path.join(repoRoot, 'skills'), path.join(repoRoot, 'examples')];
}

export const CONTROLLER_SCRIPTS = {
  /** The gate + ticket controller. Owns `.aidlc-state.yaml`. */
  aidlc: 'scripts/aidlc.py',
  /** The graph validator and generator of the three derived files. */
  uowGraph: 'scripts/uow_graph.py',
  /** Read-only repo inventory, used when a repo has no stack profile. */
  discover: 'scripts/discover_generic.py',
} as const;

export const AIDLC_CONFIG = Symbol('AIDLC_CONFIG');
