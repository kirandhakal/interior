# Room Paint Studio

A responsive paint preview editor with an interactive Three.js room, a Next.js interface, and a NestJS REST API backed by PostgreSQL. Open the furnished starter room to try the editor immediately.

## Local setup

Use Node.js 20.9 or later, npm, PostgreSQL, and a recent browser with WebGL 2. Use the following copy commands when the destination files do not exist yet.

```bash
npm ci
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

### Use PostgreSQL installed locally

Start your PostgreSQL service. Set `DATABASE_URL` in `apps/api/.env` or use `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`, and `DATABASE_NAME`. When both are set, `DATABASE_URL` takes precedence. Percent-encode special characters in a URL password, such as `@` as `%40`. Use the raw password in `DATABASE_PASSWORD`.

```bash
npm run db:setup
```

This command creates the named database if it is missing and applies pending migrations. The configured role needs permission to create a missing database and create tables in the target database.

### Use PostgreSQL through Docker Compose

Copy the root environment example to `.env`, then choose a local database password. Match the database name, port, username, and password in `apps/api/.env`. Set a different `POSTGRES_PORT` if another service already uses 5432.

```bash
cp .env.example .env
docker compose up -d --wait db
npm run migration:run
```

### Start the studio

Run each command in its own terminal from the repository root.

```bash
npm run dev:api
npm run dev
```

Open [the editor](http://localhost:3000) or check [API health](http://127.0.0.1:4000/api/health). The interface forwards same-origin `/api` calls to NestJS.

## Using the editor

- Add a room from a preset or enter its dimensions. Open **Dimensions** to set length, width, height, and the length and thickness of each wall. Choose meters, centimeters, feet, or inches. The live plan shows floor area, perimeter, and wall area with and without openings. Click a wall's dimension label to edit its length.
- Click a wall in the scene or choose **Selected surface**. Pick a palette chip, search a name, or enter a HEX value. Change the finish and use **Paint all walls** to apply the selection throughout the room.
- Drag empty space to orbit, scroll or pinch to zoom, and use the camera buttons or **Top view** to reframe. Use the hand tool to drag furniture, fixtures, or openings in the scene. The inspector provides precise placement, sizing, orientation, and removal.
- Browse the **Furniture** catalog by room category or search. Drag pieces into the preview or click to add them. The inspector controls size, rotation, finish color, and duplication. TV and desktop PC screens cast adjustable light, and desktop PC setups support one to three monitors.
- Change daylight below the scene. Under **Lighting**, drag a fixture from the catalog onto the preview or select it to add it at a default position. Drop wall sconces directly onto a wall in **3D view**. Use **Mount** to switch between the surfaces the selected fixture supports.
- Drag a placed fixture along its mount. The inspector lets you enter an exact position and intensity in lumens, switch power, and adjust warmth. Directional fixtures also offer direction and tilt controls. **Top view** makes positioning ceiling fixtures and floor lamps easier.
- Open **Ceiling view** to inspect the ceiling from below and place or drag ceiling-mounted fixtures. **3D view** shows the ceiling edges with the room cut away for editing.
- Open **Compare paint options** to capture the current wall colors and finishes, compare against a saved option under matching lighting, or apply the option.
- Select **Save project** to save in this browser. Create an account or sign in from the account button and save again to store the project in PostgreSQL. Use **Projects** to reopen, rename, copy, or delete saved projects. The last saved project opens again on refresh when its storage is accessible.
- Use the toolbar to undo or redo edits, or press Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z.

Screen settings and real-world lighting affect perceived paint color. The study uses approximate daylight and material roughness. Rooms have four-sided footprints and are edited individually within a house project. Furniture can overlap intentionally, such as a table on a rug.

## Project structure

```text
apps/web/app/                  Next.js pages and studio styles
apps/web/src/components/       Shared form controls and dialogs
apps/web/src/editor/          Room tools, paint, lighting, furniture, and scene
apps/web/src/projects/        Account UI, project library, and persistence clients
apps/api/src/auth/            Accounts and HTTP-only sessions
apps/api/src/projects/        Project API, validation, and ownership
apps/api/src/database/        TypeORM entities, data source, and migrations
packages/studio/              Shared project types and placement rules
```

## Configuration

| File | Variables |
| --- | --- |
| Root `.env` | `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT` |
| `apps/api/.env` | `DATABASE_URL` or `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`, `DATABASE_NAME`. Also `DATABASE_SSL`, `PORT`, `BIND_HOST`, `APP_ORIGIN`, `COOKIE_SECURE`. |
| `apps/web/.env.local` | `BACKEND_URL`, the server-side target of the Next.js API rewrite |

Set `APP_ORIGIN` to the URL used to open the frontend, including its scheme and port. Use `COOKIE_SECURE=true` when serving the studio over HTTPS. Set `DATABASE_SSL=true` for a PostgreSQL host with a trusted server certificate. Only the example files belong in source control.

## REST API and migrations

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Check API availability |
| POST | `/api/auth/register`, `/api/auth/login` | Accept `email` and `password`, then set a session cookie |
| GET | `/api/auth/me` | Get the signed-in account |
| POST | `/api/auth/logout` | End the current session |
| GET | `/api/projects` | List projects for the signed-in account |
| POST | `/api/projects` | Create a project from `id` (UUID v4), `name`, and `rooms` |
| GET | `/api/projects/:id` | Read a project and its version |
| PUT | `/api/projects/:id` | Update `name` and `rooms` using the supplied `version` |
| DELETE | `/api/projects/:id` | Delete an owned project |

Projects store validated room records in a PostgreSQL JSONB column. A save updates the document and its version atomically. A stale version returns HTTP 409. Reopen the current server version or use **Save a copy** to keep your edits. Validation returns HTTP 400 with details.

`npm run migration:run` applies pending migrations. `npm run migration:revert` rolls back the most recent migration. The initial rollback drops the studio tables and their data. The development database is stored in a Docker named volume and survives `docker compose down`.

## Checks and Git workflow

```bash
npm run typecheck
npm test
npm run build
docker compose --env-file .env.example config
git switch -c feature/your-change
git status --short
git diff
git add <changed-files>
git commit -m "Describe the change"
```

For a workspace with a read-only `.git` path and studio metadata in `.git-local`, run Git with `--git-dir=.git-local --work-tree=.` until the workspace permits a standard checkout.
