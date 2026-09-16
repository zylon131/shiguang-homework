import path from "node:path";
import { db, id, now } from "./db.js";
import { config } from "./config.js";
import { gradePhoto, generatePractice, initialStatus } from "./model.js";
let active = 0;
let stopped = false;
export function enqueuePractice(qid) {
  db.prepare(
    "INSERT INTO practice_tasks VALUES (?,'queued',NULL,?) ON CONFLICT(question_id) DO UPDATE SET status='queued',error=NULL,updated_at=excluded.updated_at WHERE practice_tasks.status='failed'",
  ).run(qid, now());
}
async function processJob(job) {
  try {
    const student = db
      .prepare("SELECT grade FROM students WHERE id=?")
      .get(job.student_id);
    const result = await gradePhoto(
      path.join(config.dataDir, "uploads", job.image_path),
      job.subject,
      student.grade,
    );
    db.transaction(() => {
      const insert = db.prepare(
        "INSERT INTO questions (id,org_id,student_id,job_id,subject,number,text,student_answer,correct_answer,explanation,knowledge,ai_verdict,confidence,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      );
      for (const q of result.questions)
        insert.run(
          id(),
          job.org_id,
          job.student_id,
          job.id,
          job.subject,
          q.number,
          q.text,
          q.studentAnswer,
          q.correctAnswer,
          q.explanation,
          q.knowledge,
          q.verdict,
          q.confidence,
          initialStatus(q),
          now(),
        );
      db.prepare(
        "UPDATE jobs SET status='done',error=NULL,updated_at=? WHERE id=?",
      ).run(now(), job.id);
    })();
  } catch (e) {
    const message =
      e.name === "ZodError" || e instanceof SyntaxError
        ? "模型识别结果格式不完整，请重试或拆分拍照"
        : e.message;
    db.prepare(
      "UPDATE jobs SET status='failed',error=?,updated_at=? WHERE id=?",
    ).run(message, now(), job.id);
  }
}
async function processPractice(task) {
  try {
    const q = db
      .prepare(
        "SELECT q.*,s.grade FROM questions q JOIN students s ON q.student_id=s.id WHERE q.id=?",
      )
      .get(task.question_id);
    if (!q || q.status !== "wrong") {
      db.prepare("DELETE FROM practice_tasks WHERE question_id=?").run(
        task.question_id,
      );
      return;
    }
    const result = await generatePractice(q, q.grade);
    db.transaction(() => {
      const current = db
        .prepare("SELECT status,reviewed_at FROM questions WHERE id=?")
        .get(q.id);
      if (
        !current ||
        current.status !== "wrong" ||
        current.reviewed_at !== q.reviewed_at
      )
        return;
      db.prepare(
        "INSERT INTO practices VALUES (?,?,?,?,?) ON CONFLICT(question_id) DO UPDATE SET content=excluded.content,created_at=excluded.created_at",
      ).run(id(), q.org_id, q.id, JSON.stringify(result.exercises), now());
      db.prepare(
        "UPDATE practice_tasks SET status='done',error=NULL,updated_at=? WHERE question_id=?",
      ).run(now(), q.id);
    })();
  } catch (e) {
    db.prepare(
      "UPDATE practice_tasks SET status='failed',error=?,updated_at=? WHERE question_id=? AND status='processing' AND updated_at=?",
    ).run(
      e.name === "ZodError" || e instanceof SyntaxError
        ? "练习生成格式异常，请重试"
        : e.message,
      now(),
      task.question_id,
      task.updated_at,
    );
  }
}
export function startWorker() {
  db.prepare("UPDATE jobs SET status='queued' WHERE status='processing'").run();
  db.prepare(
    "UPDATE practice_tasks SET status='queued' WHERE status='processing'",
  ).run();
  const tick = () => {
    if (stopped) return;
    while (active < config.concurrency) {
      const job = db
        .prepare(
          "SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1",
        )
        .get();
      const task =
        !job &&
        db
          .prepare(
            "SELECT * FROM practice_tasks WHERE status='queued' ORDER BY updated_at LIMIT 1",
          )
          .get();
      if (!job && !task) break;
      if (job)
        db.prepare(
          "UPDATE jobs SET status='processing',updated_at=? WHERE id=?",
        ).run(now(), job.id);
      else {
        task.updated_at = now();
        db.prepare(
          "UPDATE practice_tasks SET status='processing',updated_at=? WHERE question_id=?",
        ).run(task.updated_at, task.question_id);
      }
      active++;
      (job ? processJob(job) : processPractice(task)).finally(() => {
        active--;
        tick();
      });
    }
  };
  const timer = setInterval(tick, 1000);
  tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
