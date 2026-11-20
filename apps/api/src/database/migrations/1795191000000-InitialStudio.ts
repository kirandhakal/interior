import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialStudio1795191000000 implements MigrationInterface {
  async up(query: QueryRunner) {
    await query.query(`
      CREATE TABLE accounts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email varchar(254) NOT NULL UNIQUE,
        password_hash varchar(180) NOT NULL
      );
      CREATE TABLE sessions (
        token_hash varchar(64) PRIMARY KEY,
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        expires_at timestamptz NOT NULL
      );
      CREATE INDEX "IDX_sessions_account" ON sessions(account_id);
      CREATE INDEX "IDX_sessions_expiry" ON sessions(expires_at);
      CREATE TABLE projects (
        id uuid PRIMARY KEY,
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        name varchar(80) NOT NULL,
        rooms jsonb NOT NULL,
        version integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_projects_rooms" CHECK (jsonb_typeof(rooms) = 'array'),
        CONSTRAINT "CHK_projects_version" CHECK (version > 0)
      );
      CREATE INDEX "IDX_projects_account_updated" ON projects(account_id, updated_at);
    `);
  }

  async down(query: QueryRunner) {
    await query.query('DROP TABLE projects; DROP TABLE sessions; DROP TABLE accounts;');
  }
}
