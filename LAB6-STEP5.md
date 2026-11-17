# Lab 6 — Step 5: live TypeScript on server

This patch switches **actual server execution** to `config.ts` and `room-manager.ts` via Node.js 22+ built-in type stripping. `room.js` and `websocket.js` remain JavaScript for now. Existing wire protocol and room event payloads are unchanged.

## Install
Extract over the project directory. This ZIP contains only `server/src/index.js` and `server/package.json`.

## Verify
```powershell
node -v
npm run typecheck
npm run build
npm run test:determinism
npm run dev:server
```
Open the client in another terminal (`npm run dev`) and test room creation/join with two browser tabs. `node --experimental-strip-types` is required for `.ts` imports on Node 22.15.0.

## Rollback
Restore `server/src/index.js` and `server/package.json` from the backup. This is an incremental patch, **not** the complete Lab 6 migration.
