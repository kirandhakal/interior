import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { ProjectEntity, Session, UserAccount } from './entities';
import { InitialStudio1795191000000 } from './migrations/1795191000000-InitialStudio';

config({ quiet: true });

type PostgresOptions = Extract<DataSourceOptions, { type: 'postgres' }>;

function databaseCredentials() {
  const url = process.env.DATABASE_URL?.trim();
  if (url) return { url };

  const host = process.env.DATABASE_HOST?.trim() || 'localhost';
  const port = Number(process.env.DATABASE_PORT?.trim() || '5432');
  const username = process.env.DATABASE_USERNAME?.trim();
  const password = process.env.DATABASE_PASSWORD;
  const database = process.env.DATABASE_NAME?.trim();

  if (!username || !database) {
    throw new Error('Set DATABASE_URL, or set DATABASE_USERNAME, DATABASE_PASSWORD, and DATABASE_NAME in apps/api/.env.');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DATABASE_PORT must be a whole number between 1 and 65535.');
  }
  return { host, port, username, password, database };
}

export function databaseOptions(): PostgresOptions {
  return {
    type: 'postgres',
    ...databaseCredentials(),
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false,
    entities: [UserAccount, Session, ProjectEntity],
    migrations: [InitialStudio1795191000000],
    synchronize: false,
    uuidExtension: 'pgcrypto',
    installExtensions: false,
  };
}

export default new DataSource(databaseOptions());
