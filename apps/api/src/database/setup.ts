import { DataSource } from 'typeorm';
import studio from './data-source';

function errorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
}

async function createDatabase() {
  const options = studio.options;
  const name = studio.driver.database;
  if (options.type !== 'postgres' || !name) throw new Error('Specify the studio database in DATABASE_URL or DATABASE_NAME.');

  const url = options.url ? new URL(options.url) : undefined;
  if (url) url.pathname = '/postgres';
  const maintenance = new DataSource({
    ...options, database: 'postgres', url: url?.toString(), entities: [], migrations: [],
  });
  await maintenance.initialize();
  try {
    // PostgreSQL parameters represent values, so quote the database identifier explicitly.
    const identifier = '"' + name.replaceAll('"', '""') + '"';
    await maintenance.query(`CREATE DATABASE ${identifier}`);
    console.log(`Created database ${name}.`);
  } catch (error) {
    if (errorCode(error) !== '42P04') throw error;
  } finally {
    await maintenance.destroy();
  }
}

async function setup() {
  try {
    await studio.initialize();
  } catch (error) {
    if (errorCode(error) !== '3D000') throw error;
    await createDatabase();
    await studio.initialize();
  }
  try {
    const applied = await studio.runMigrations();
    console.log(applied.length ? `Applied ${applied.length} migration(s).` : 'Database is ready. No pending migrations.');
  } finally {
    await studio.destroy();
  }
}

void setup().catch(error => {
  console.error('Database setup failed. ' + (error instanceof Error ? error.message : 'Check the PostgreSQL connection.'));
  process.exitCode = 1;
});
