import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { ProjectEntity, Session, UserAccount } from './entities';
import { InitialStudio1795191000000 } from './migrations/1795191000000-InitialStudio';

config({ quiet: true });

export function databaseOptions(): DataSourceOptions {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL in apps/api/.env or in the process environment.');
  return {
    type: 'postgres',
    url,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false,
    entities: [UserAccount, Session, ProjectEntity],
    migrations: [InitialStudio1795191000000],
    synchronize: false,
    uuidExtension: 'pgcrypto',
    installExtensions: false,
  };
}

export default new DataSource(databaseOptions());
