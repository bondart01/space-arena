

### Lab 6: server TypeScript migration (incremental)

`server/src/config.ts` contains the strict, Zod-validated environment configuration and `server/src/room-events.ts` defines branded room/player identifiers and a discriminated union for room lifecycle events with an exhaustive `never` check.

**Migration status:** `server/src/config.js` remains the runtime module until the Node server entry point and imports are migrated to a TypeScript-aware build. The TypeScript counterpart is checked by `npm run typecheck`, but the runtime still uses the JavaScript module. This is an intermediate step, not the completed Lab 6 migration.
