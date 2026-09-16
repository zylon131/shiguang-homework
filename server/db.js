import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { randomUUID, randomBytes, createHash } from "node:crypto";
fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(path.join(config.dataDir, "uploads"), { recursive: true });
const connection = new DatabaseSync(path.join(config.dataDir, "app.sqlite"));
export const db = {
  prepare: (sql) => connection.prepare(sql),
  exec: (sql) => connection.exec(sql),
  close: () => connection.close(),
  transaction:
    (fn) =>
    (...args) => {
      connection.exec("BEGIN IMMEDIATE");
      try {
        const result = fn(...args);
        connection.exec("COMMIT");
        return result;
      } catch (e) {
        connection.exec("ROLLBACK");
        throw e;
      }
    },
};
db.exec(
  "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;",
);
db.exec(`
CREATE TABLE IF NOT EXISTS organizations (id TEXT PRIMARY KEY, name TEXT NOT NULL, demo INTEGER DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), name TEXT NOT NULL, phone TEXT NOT NULL UNIQUE, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','teacher')));
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS invitations (token_hash TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), expires_at TEXT NOT NULL, used INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), teacher_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, grade INTEGER NOT NULL CHECK(grade BETWEEN 1 AND 6), class_name TEXT NOT NULL DEFAULT '晚托一班', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), student_id TEXT NOT NULL REFERENCES students(id), teacher_id TEXT NOT NULL REFERENCES users(id), subject TEXT NOT NULL, image_path TEXT, status TEXT NOT NULL, error TEXT, idempotency_key TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(org_id,idempotency_key));
CREATE TABLE IF NOT EXISTS questions (id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), student_id TEXT NOT NULL REFERENCES students(id), job_id TEXT NOT NULL REFERENCES jobs(id), subject TEXT NOT NULL, number TEXT NOT NULL, text TEXT NOT NULL, student_answer TEXT NOT NULL, correct_answer TEXT NOT NULL, explanation TEXT NOT NULL, knowledge TEXT NOT NULL, ai_verdict TEXT NOT NULL, confidence REAL NOT NULL, status TEXT NOT NULL, mastered INTEGER DEFAULT 0, reviewed_by TEXT, reviewed_at TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS practices (id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), question_id TEXT NOT NULL REFERENCES questions(id), content TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_practice_question ON practices(question_id);
CREATE TABLE IF NOT EXISTS practice_tasks (question_id TEXT PRIMARY KEY REFERENCES questions(id), status TEXT NOT NULL, error TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), student_id TEXT NOT NULL REFERENCES students(id), week_start TEXT NOT NULL, week_end TEXT NOT NULL, content TEXT NOT NULL, token_hash TEXT, pin_hash TEXT, expires_at TEXT, created_at TEXT NOT NULL, UNIQUE(org_id,student_id,week_start));
CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, user_id TEXT NOT NULL, action TEXT NOT NULL, target_id TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_jobs_scope ON jobs(org_id,student_id,created_at);
CREATE INDEX IF NOT EXISTS idx_questions_scope ON questions(org_id,student_id,status);
CREATE INDEX IF NOT EXISTS idx_students_teacher ON students(org_id,teacher_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_report_token ON reports(token_hash) WHERE token_hash IS NOT NULL;
`);
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export const token = () => randomBytes(32).toString("base64url");
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export function audit(user, action, target) {
  db.prepare("INSERT INTO audit_events VALUES (?,?,?,?,?,?)").run(
    id(),
    user.org_id,
    user.id,
    action,
    target,
    now(),
  );
}
export function studentFor(user, studentId) {
  return db
    .prepare(
      `SELECT * FROM students WHERE id=? AND org_id=? ${user.role === "admin" ? "" : "AND teacher_id=?"}`,
    )
    .get(
      ...[studentId, user.org_id, ...(user.role === "admin" ? [] : [user.id])],
    );
}
export function scopedStudents(user) {
  return db
    .prepare(
      `SELECT s.*,u.name teacher_name FROM students s JOIN users u ON s.teacher_id=u.id WHERE s.org_id=? ${user.role === "admin" ? "" : "AND s.teacher_id=?"} ORDER BY s.created_at,s.name`,
    )
    .all(...[user.org_id, ...(user.role === "admin" ? [] : [user.id])]);
}
export function weekRange(date = new Date()) {
  const local = new Date(date.getTime() + 8 * 3600000);
  const day = local.getUTCDay() || 7;
  local.setUTCDate(local.getUTCDate() - day + 1);
  local.setUTCHours(0, 0, 0, 0);
  const start = local.toISOString().slice(0, 10);
  local.setUTCDate(local.getUTCDate() + 7);
  return { start, end: local.toISOString().slice(0, 10) };
}
