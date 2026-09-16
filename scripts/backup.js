import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../server/config.js";
import { db } from "../server/db.js";
const directory = path.join(
  config.dataDir,
  "backups",
  new Date().toISOString().replace(/[:.]/g, "-"),
);
await fs.mkdir(directory, { recursive: true });
// VACUUM INTO creates a consistent snapshot, including committed WAL records.
db.prepare("VACUUM INTO ?").run(path.join(directory, "app.sqlite"));
await fs.cp(
  path.join(config.dataDir, "uploads"),
  path.join(directory, "uploads"),
  { recursive: true },
);
db.close();
console.log(`Backup created: ${directory}`);
console.log(
  "For an exact database/photo snapshot, stop the application before running this command.",
);
