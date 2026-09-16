import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
dotenv.config({ path: path.join(root, ".env"), quiet: true });
dotenv.config({ path: path.join(root, ".env.minimax"), quiet: true });
export const production = process.env.NODE_ENV === "production";
export const config = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || "0.0.0.0",
  dataDir: path.resolve(root, process.env.DATA_DIR || "data"),
  origin: process.env.APP_ORIGIN || "http://localhost:5173",
  apiKey: process.env.MINIMAX_API_KEY || "",
  baseUrl: (
    process.env.MINIMAX_BASE_URL || "https://api.minimaxi.com/v1"
  ).replace(/\/$/, ""),
  model: process.env.MINIMAX_MODEL || "MiniMax-M3",
  inviteCode:
    process.env.PILOT_INVITE_CODE || (production ? "" : "LOCAL-PILOT-2026"),
  demo:
    process.env.ENABLE_DEMO === "true" ||
    (!production && process.env.ENABLE_DEMO !== "false"),
  concurrency: Math.min(
    8,
    Math.max(1, Number(process.env.MODEL_CONCURRENCY) || 3),
  ),
};
if (
  production &&
  (!config.origin.startsWith("https://") ||
    config.inviteCode.length < 20 ||
    config.inviteCode === "LOCAL-PILOT-2026" ||
    config.demo)
) {
  throw new Error(
    "Production requires HTTPS APP_ORIGIN, a private PILOT_INVITE_CODE of at least 20 characters, and ENABLE_DEMO=false.",
  );
}
