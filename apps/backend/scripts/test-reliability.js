// Dedicated local test database: never migrate/reset the development database.
const fs = require('fs');
const { spawnSync } = require('child_process');
const { parse } = require('dotenv');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const env = parse(fs.readFileSync('.env.test'));
  const database = new URL(env.DATABASE_URL);
  if (!['localhost', '127.0.0.1'].includes(database.hostname)) throw new Error('Reliability runner requires local PostgreSQL');
  database.pathname = '/saverlly_reliability_test';
  const administrative = new URL(database);
  administrative.pathname = '/postgres';
  const client = new PrismaClient({ datasources: { db: { url: administrative.href } } });
  try {
    const exists = await client.$queryRaw`SELECT datname FROM pg_database WHERE datname = 'saverlly_reliability_test'`;
    if (!exists.length) await client.$executeRawUnsafe('CREATE DATABASE saverlly_reliability_test');
  } finally { await client.$disconnect(); }
  const redis = new URL(env.REDIS_URL);
  if (!['localhost', '127.0.0.1'].includes(redis.hostname)) throw new Error('Reliability runner requires local Redis');
  redis.pathname = '/2';
  const childEnv = { ...process.env, ...env, NODE_ENV: 'test', DATABASE_URL: database.href,
    TEST_DATABASE_URL: database.href, REDIS_URL: redis.href, TEST_REDIS_URL: redis.href };
  for (const args of [
    [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
    [require.resolve('jest/bin/jest'), '--config', './test/jest-e2e.json', '--runInBand', ...(process.argv.slice(2).length ? process.argv.slice(2) : ['reliability-regressions'])],
  ]) {
    const result = spawnSync(process.execPath, args, { env: childEnv, stdio: 'inherit', windowsHide: true });
    if (result.error) throw result.error;
    if (result.status !== 0) { process.exitCode = result.status ?? 1; return; }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
