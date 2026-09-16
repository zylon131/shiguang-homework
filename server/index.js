import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import sharp from "sharp";
import bcrypt from "bcryptjs";
import path from "node:path";
import fs from "node:fs";
import { z } from "zod";
import { randomInt } from "node:crypto";
import { config, production, root } from "./config.js";
import {
  db,
  id,
  now,
  token,
  hash,
  audit,
  studentFor,
  scopedStudents,
  weekRange,
} from "./db.js";
import { createDemo } from "./demo.js";
import { startWorker, enqueuePractice } from "./worker.js";
import { buildReport } from "./reports.js";
import { practiceSchema } from "./model.js";
import { getKnowledgeCandidates, canonicalKnowledge, isAllowedKnowledge, isStandardKnowledge, UNCLASSIFIED } from "./curriculum.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "1" ? 1 : false);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        upgradeInsecureRequests: production ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.get("origin");
    if (
      req.get("x-requested-with") !== "shiguang" ||
      (origin &&
        origin !== config.origin &&
        !(
          !production &&
          /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(
            origin,
          )
        ))
    )
      return res
        .status(403)
        .json({ error: "请求来源校验失败，请从应用页面操作" });
  }
  next();
});
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 400,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "操作太频繁，请稍后再试" },
  }),
);
const authLimit = rateLimit({
  windowMs: 15 * 60000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "尝试过于频繁，请稍后再试" },
});
const fail = (status, message) => {
  const e = new Error(message);
  e.status = status;
  throw e;
};
const userView = (u) => ({
  id: u.id,
  name: u.name,
  role: u.role,
  orgId: u.org_id,
  orgName: u.org_name,
  demo: !!u.demo,
});
function newSession(res, user) {
  const raw = token();
  db.prepare("DELETE FROM sessions WHERE expires_at<?").run(now());
  db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(
    hash(raw),
    user.id,
    new Date(Date.now() + 7 * 86400000).toISOString(),
  );
  res.cookie("sg_session", raw, {
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    maxAge: 7 * 86400000,
    path: "/",
  });
}
function auth(req, res, next) {
  const u =
    req.cookies.sg_session &&
    db
      .prepare(
        "SELECT u.*,o.name org_name,o.demo FROM sessions s JOIN users u ON u.id=s.user_id JOIN organizations o ON o.id=u.org_id WHERE s.token_hash=? AND s.expires_at>?",
      )
      .get(hash(req.cookies.sg_session), now());
  if (!u) return res.status(401).json({ error: "请先登录" });
  req.user = u;
  next();
}
const admin = (req, res, next) =>
  req.user.role === "admin"
    ? next()
    : res.status(403).json({ error: "此操作需要机构管理员权限" });
function getStudent(req, sid) {
  const student = studentFor(req.user, sid);
  if (!student) fail(404, "未找到该学生");
  return student;
}
function getQuestion(req, qid) {
  const q = db
    .prepare("SELECT * FROM questions WHERE id=? AND org_id=?")
    .get(qid, req.user.org_id);
  if (!q) fail(404, "未找到题目");
  const student = getStudent(req, q.student_id);
  q.grade = student.grade;
  return q;
}
function getReport(req, rid) {
  const r = db
    .prepare("SELECT * FROM reports WHERE id=? AND org_id=?")
    .get(rid, req.user.org_id);
  if (!r) fail(404, "未找到报告");
  getStudent(req, r.student_id);
  return r;
}
const phone = z.string().regex(/^1[3-9]\d{9}$/, "请输入有效的手机号");
const password = z.string().min(8, "密码至少 8 位").max(72, "密码最多 72 位");
const name = z.string().trim().min(1).max(40);
const subject = z.enum(["语文", "数学", "英语"]);

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.get("/api/curriculum", auth, (req, res) => {
  const input = z.object({ subject, grade:z.coerce.number().int().min(1).max(6) }).parse(req.query);
  const candidates = getKnowledgeCandidates(input.subject, input.grade);
  res.json({ ...input, candidates, unclassified:UNCLASSIFIED, available:candidates.length > 0 });
});
app.get("/api/config", (req, res) =>
  res.json({
    demo: config.demo,
    localInvite: !production ? "LOCAL-PILOT-2026" : undefined,
  }),
);
app.post("/api/auth/login", authLimit, async (req, res) => {
  const body = z
    .object({ phone, password: z.string().max(72) })
    .parse(req.body);
  const user = db.prepare("SELECT * FROM users WHERE phone=?").get(body.phone);
  if (!user || !(await bcrypt.compare(body.password, user.password)))
    fail(401, "手机号或密码不正确");
  newSession(res, user);
  res.json({ ok: true });
});
app.post("/api/auth/register", authLimit, async (req, res) => {
  const b = z
    .object({ name, orgName: name, phone, password, inviteCode: z.string() })
    .parse(req.body);
  if (!config.inviteCode || b.inviteCode !== config.inviteCode)
    fail(403, "试用邀请码不正确");
  if (db.prepare("SELECT id FROM users WHERE phone=?").get(b.phone))
    fail(409, "此手机号已注册，请登录");
  const uid = id(),
    oid = id(),
    pass = await bcrypt.hash(b.password, 12);
  db.transaction(() => {
    db.prepare("INSERT INTO organizations VALUES (?,?,0,?)").run(
      oid,
      b.orgName,
      now(),
    );
    db.prepare("INSERT INTO users VALUES (?,?,?,?,?,?)").run(
      uid,
      oid,
      b.name,
      b.phone,
      pass,
      "admin",
    );
  })();
  newSession(res, { id: uid });
  res.json({ ok: true });
});
app.post("/api/auth/join", authLimit, async (req, res) => {
  const b = z
    .object({ name, phone, password, token: z.string().min(20) })
    .parse(req.body);
  const pass = await bcrypt.hash(b.password, 12),
    uid = id();
  db.transaction(() => {
    const inv = db
      .prepare(
        "SELECT * FROM invitations WHERE token_hash=? AND used=0 AND expires_at>?",
      )
      .get(hash(b.token), now());
    if (!inv) fail(400, "邀请已失效，请联系机构管理员重新邀请");
    if (db.prepare("SELECT id FROM users WHERE phone=?").get(b.phone))
      fail(409, "此手机号已注册");
    db.prepare("INSERT INTO users VALUES (?,?,?,?,?,?)").run(
      uid,
      inv.org_id,
      b.name,
      b.phone,
      pass,
      "teacher",
    );
    db.prepare("UPDATE invitations SET used=1 WHERE token_hash=?").run(
      hash(b.token),
    );
  })();
  newSession(res, { id: uid });
  res.json({ ok: true });
});
app.post("/api/auth/demo", authLimit, (req, res) => {
  if (!config.demo) fail(404, "体验入口未开启");
  newSession(res, createDemo());
  res.json({ ok: true });
});
app.post("/api/auth/logout", auth, (req, res) => {
  db.prepare("DELETE FROM sessions WHERE token_hash=?").run(
    hash(req.cookies.sg_session),
  );
  res.clearCookie("sg_session", { path: "/" });
  res.json({ ok: true });
});
app.get("/api/me", auth, (req, res) => res.json(userView(req.user)));
app.get("/api/dashboard", auth, (req, res) => {
  const localDate = new Date(Date.now() + 8 * 3600000)
    .toISOString()
    .slice(0, 10);
  const start = new Date(`${localDate}T00:00:00+08:00`).toISOString();
  const students = scopedStudents(req.user).map((s) => {
    const jobs = db
      .prepare(
        "SELECT id,subject,status,error,created_at FROM jobs WHERE org_id=? AND student_id=? AND created_at>=? ORDER BY created_at DESC",
      )
      .all(req.user.org_id, s.id, start);
    const pending = db
      .prepare(
        "SELECT COUNT(*) n FROM questions WHERE org_id=? AND student_id=? AND status='pending'",
      )
      .get(req.user.org_id, s.id).n;
    const wrong = db
      .prepare(
        "SELECT COUNT(*) n FROM questions WHERE org_id=? AND student_id=? AND status='wrong'",
      )
      .get(req.user.org_id, s.id).n;
    return {
      ...s,
      jobs,
      pending,
      wrong,
      status: jobs.some((j) => j.status === "failed")
        ? "failed"
        : pending
          ? "review"
          : jobs.some((j) => ["queued", "processing"].includes(j.status))
            ? "processing"
            : jobs.length
              ? "done"
              : "waiting",
    };
  });
  const qs = db
    .prepare(
      "SELECT q.status,COUNT(*) n FROM questions q JOIN students s ON s.id=q.student_id WHERE q.org_id=? AND (?='admin' OR s.teacher_id=?) AND q.created_at>=? GROUP BY q.status",
    )
    .all(req.user.org_id, req.user.role, req.user.id, start);
  res.json({
    students,
    date: localDate,
    week: weekRange(),
    stats: {
      total: students.length,
      submitted: students.filter((s) => s.jobs.length).length,
      pending: students.reduce((n, s) => n + s.pending, 0),
      pages: students.reduce((n, s) => n + s.jobs.length, 0),
      questions: qs.reduce((n, q) => n + q.n, 0),
      wrong: qs.find((q) => q.status === "wrong")?.n || 0,
    },
    model: { configured: !!config.apiKey, name: config.model },
  });
});
app.post("/api/students", auth, (req, res) => {
  const b = z
    .object({
      names: z.array(name).min(1).max(60),
      grade: z.number().int().min(1).max(6),
      className: name,
      teacherId: z.string().optional(),
    })
    .parse(req.body);
  const teacher = b.teacherId || req.user.id;
  if (teacher !== req.user.id && req.user.role !== "admin")
    fail(403, "不能为其他老师添加学生");
  if (
    !db
      .prepare("SELECT id FROM users WHERE id=? AND org_id=?")
      .get(teacher, req.user.org_id)
  )
    fail(400, "无效的老师");
  const added = [];
  db.transaction(() => {
    for (const n of b.names) {
      const sid = id();
      db.prepare("INSERT INTO students VALUES (?,?,?,?,?,?,?)").run(
        sid,
        req.user.org_id,
        teacher,
        n,
        b.grade,
        b.className,
        now(),
      );
      added.push(sid);
    }
  })();
  audit(req.user, "student.create", added.join(","));
  res.status(201).json({ ids: added });
});
app.patch("/api/students/:id", auth, (req, res) => {
  const s = getStudent(req, req.params.id),
    b = z
      .object({
        name,
        grade: z.number().int().min(1).max(6),
        className: name,
        teacherId: z.string(),
      })
      .parse(req.body);
  if (b.teacherId !== s.teacher_id && req.user.role !== "admin")
    fail(403, "只有管理员可以分配老师");
  if (
    !db
      .prepare("SELECT id FROM users WHERE id=? AND org_id=?")
      .get(b.teacherId, req.user.org_id)
  )
    fail(400, "无效的老师");
  db.prepare(
    "UPDATE students SET name=?,grade=?,class_name=?,teacher_id=? WHERE id=? AND org_id=?",
  ).run(b.name, b.grade, b.className, b.teacherId, s.id, req.user.org_id);
  audit(req.user, "student.update", s.id);
  res.json({ ok: true });
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 12, fields: 4 },
  fileFilter: (req, file, cb) =>
    cb(
      null,
      [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
      ].includes(file.mimetype),
    ),
});
app.post("/api/jobs", auth, upload.array("photos", 12), async (req, res) => {
  const b = z
    .object({
      studentId: z.string(),
      subject,
      idempotencyKey: z.string().regex(/^[A-Za-z0-9-]{8,100}$/),
    })
    .parse(req.body);
  getStudent(req, b.studentId);
  const prior = db
    .prepare("SELECT id FROM jobs WHERE org_id=? AND idempotency_key LIKE ?")
    .all(req.user.org_id, `${b.idempotencyKey}:%`);
  if (prior.length) return res.json({ ids: prior.map((j) => j.id) });
  if (!req.files?.length) fail(400, "请选择 JPG、PNG 或 WebP 作业照片");
  const outstanding = db
    .prepare(
      "SELECT COUNT(*) n FROM jobs WHERE org_id=? AND status IN ('queued','processing')",
    )
    .get(req.user.org_id).n;
  if (outstanding + req.files.length > 120)
    fail(429, "机构待处理照片较多，请稍后继续上传");
  const prepared = [];
  try {
    for (const [i, file] of req.files.entries()) {
      const jid = id(),
        filename = `${jid}.jpg`;
      await sharp(file.buffer, { limitInputPixels: 40000000 })
        .rotate()
        .resize({
          width: 2200,
          height: 3000,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 88 })
        .toFile(path.join(config.dataDir, "uploads", filename));
      prepared.push({ id: jid, filename, key: `${b.idempotencyKey}:${i}` });
    }
    db.transaction(() => {
      for (const p of prepared)
        db.prepare(
          "INSERT INTO jobs (id,org_id,student_id,teacher_id,subject,image_path,status,idempotency_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        ).run(
          p.id,
          req.user.org_id,
          b.studentId,
          req.user.id,
          b.subject,
          p.filename,
          "queued",
          p.key,
          now(),
          now(),
        );
    })();
  } catch (e) {
    for (const p of prepared)
      fs.rmSync(path.join(config.dataDir, "uploads", p.filename), {
        force: true,
      });
    if (e.code?.includes("SQLITE")) {
      const existing = db
        .prepare(
          "SELECT id FROM jobs WHERE org_id=? AND idempotency_key LIKE ?",
        )
        .all(req.user.org_id, `${b.idempotencyKey}:%`);
      if (existing.length) return res.json({ ids: existing.map((j) => j.id) });
      throw e;
    }
    fail(400, "照片无法读取，请转为 JPG 或重新拍照后上传");
  }
  audit(req.user, "job.upload", prepared.map((p) => p.id).join(","));
  res.status(202).json({ ids: prepared.map((p) => p.id) });
});
app.get("/api/jobs/:id/image", auth, (req, res) => {
  const j = db
    .prepare("SELECT * FROM jobs WHERE id=? AND org_id=?")
    .get(req.params.id, req.user.org_id);
  if (!j) fail(404, "未找到照片");
  getStudent(req, j.student_id);
  if (!j.image_path) fail(404, "体验题目没有原始照片");
  res.sendFile(path.join(config.dataDir, "uploads", j.image_path));
});
app.post("/api/jobs/:id/retry", auth, (req, res) => {
  const j = db
    .prepare("SELECT * FROM jobs WHERE id=? AND org_id=?")
    .get(req.params.id, req.user.org_id);
  if (!j) fail(404, "未找到任务");
  getStudent(req, j.student_id);
  if (j.status !== "failed") fail(409, "任务无需重试");
  db.prepare(
    "UPDATE jobs SET status='queued',error=NULL,updated_at=? WHERE id=?",
  ).run(now(), j.id);
  res.json({ ok: true });
});
app.get("/api/questions", auth, (req, res) => {
  const status = z
    .enum(["pending", "wrong", "all"])
    .parse(req.query.status || "pending");
  const params = [req.user.org_id, req.user.role, req.user.id];
  let filter = "";
  if (status !== "all") {
    filter += " AND q.status=?";
    params.push(status);
  }
  if (req.query.studentId) {
    getStudent(req, String(req.query.studentId));
    filter += " AND q.student_id=?";
    params.push(String(req.query.studentId));
  }
  const rows = db
    .prepare(
      `SELECT q.*,s.name student_name,s.grade,j.image_path,p.content practice,t.status practice_status,t.error practice_error FROM questions q JOIN students s ON q.student_id=s.id JOIN jobs j ON j.id=q.job_id LEFT JOIN practices p ON p.question_id=q.id LEFT JOIN practice_tasks t ON t.question_id=q.id WHERE q.org_id=? AND (?='admin' OR s.teacher_id=?) ${filter} ORDER BY q.created_at DESC,q.number LIMIT 500`,
    )
    .all(...params);
  res.json(
    rows.map((q) => ({
      ...q,
      image_path: undefined,
      imageUrl: q.image_path ? `/api/jobs/${q.job_id}/image` : null,
      practice: q.practice ? JSON.parse(q.practice) : [],
    })),
  );
});
app.post("/api/questions/:id/review", auth, (req, res) => {
  const q = getQuestion(req, req.params.id),
    b = z
      .object({
        verdict: z.enum(["correct", "wrong", "excluded"]),
        text: z.string().trim().min(1).max(6000).optional(),
        studentAnswer: z.string().max(6000).optional(),
        correctAnswer: z.string().max(6000).optional(),
        explanation: z.string().max(6000).optional(),
        knowledge: z.string().trim().min(1).max(100).optional(),
      })
      .parse(req.body);
  if (b.verdict === "wrong" && !(b.correctAnswer ?? q.correct_answer).trim())
    fail(400, "请补充参考答案再收录错题");
  if (b.knowledge !== undefined && !isAllowedKnowledge(q.subject, q.grade, b.knowledge)) {
    fail(400, "请从该年级的标准大纲中选择知识点，无法匹配时选择待归类");
  }
  const knowledge = canonicalKnowledge(q.subject, q.grade, b.knowledge ?? q.knowledge);
  db.transaction(() => {
    db.prepare(
      "UPDATE questions SET status=?,text=?,student_answer=?,correct_answer=?,explanation=?,knowledge=?,reviewed_by=?,reviewed_at=? WHERE id=? AND org_id=?",
    ).run(
      b.verdict,
      b.text ?? q.text,
      b.studentAnswer ?? q.student_answer,
      b.correctAnswer ?? q.correct_answer,
      b.explanation ?? q.explanation,
      knowledge,
      req.user.id,
      now(),
      q.id,
      req.user.org_id,
    );
    if (b.verdict === "wrong") {
      if (b.text || b.correctAnswer || b.knowledge || knowledge !== q.knowledge) {
        db.prepare("DELETE FROM practices WHERE question_id=?").run(q.id);
        db.prepare("DELETE FROM practice_tasks WHERE question_id=?").run(q.id);
      }
      if (knowledge !== UNCLASSIFIED) enqueuePractice(q.id);
    }
    audit(req.user, "question.review", q.id);
  })();
  res.json({ ok: true });
});
app.post("/api/questions/:id/mastery", auth, (req, res) => {
  const q = getQuestion(req, req.params.id);
  const b = z.object({ mastered: z.boolean() }).parse(req.body);
  if (q.status !== "wrong") fail(400, "只有错题可标记掌握");
  db.prepare("UPDATE questions SET mastered=? WHERE id=?").run(
    b.mastered ? 1 : 0,
    q.id,
  );
  audit(req.user, "question.mastery", q.id);
  res.json({ ok: true });
});
app.post("/api/questions/:id/practice", auth, (req, res) => {
  const q = getQuestion(req, req.params.id);
  if (q.status !== "wrong") fail(400, "请先确认错题");
  if (!isStandardKnowledge(q.subject, q.knowledge)) fail(400, "请先确认标准知识点，再生成巩固练习");
  enqueuePractice(q.id);
  res.status(202).json({ ok: true });
});
app.patch("/api/questions/:id/practice", auth, (req, res) => {
  const q = getQuestion(req, req.params.id);
  if (q.status !== "wrong") fail(400, "只能修改已确认错题的巩固练习");
  const result = practiceSchema.parse(req.body);
  const existing = db
    .prepare("SELECT id FROM practices WHERE question_id=? AND org_id=?")
    .get(q.id, req.user.org_id);
  if (!existing) fail(409, "练习尚未生成，请稍后再试");
  db.transaction(() => {
    db.prepare(
      "UPDATE practices SET content=?,created_at=? WHERE question_id=? AND org_id=?",
    ).run(JSON.stringify(result.exercises), now(), q.id, req.user.org_id);
    audit(req.user, "practice.edit", q.id);
  })();
  res.json({ ok: true });
});
app.get("/api/reports", auth, (req, res) => {
  const rows = db
    .prepare(
      "SELECT r.id,r.student_id,r.week_start,r.week_end,r.expires_at,r.created_at,r.token_hash,s.name student_name,r.content FROM reports r JOIN students s ON s.id=r.student_id WHERE r.org_id=? AND (?='admin' OR s.teacher_id=?) ORDER BY r.created_at DESC LIMIT 200",
    )
    .all(req.user.org_id, req.user.role, req.user.id);
  res.json(
    rows.map((r) => ({
      ...r,
      shared: !!r.token_hash,
      token_hash: undefined,
      content: JSON.parse(r.content),
    })),
  );
});
app.post("/api/reports/batch", auth, (req, res) => {
  const b = z
    .object({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
    .parse(req.body);
  if (!Number.isFinite(new Date(`${b.weekStart}T00:00:00Z`).getTime()))
    fail(400, "日期无效");
  let generated = 0,
    shared = 0,
    empty = 0;
  db.transaction(() => {
    for (const student of scopedStudents(req.user)) {
      const content = buildReport(student, b.weekStart);
      if (!content.total) {
        empty++;
        continue;
      }
      const old = db
        .prepare(
          "SELECT * FROM reports WHERE org_id=? AND student_id=? AND week_start=?",
        )
        .get(req.user.org_id, student.id, content.weekStart);
      if (old?.token_hash) {
        shared++;
        continue;
      }
      if (old) content.teacherNote = JSON.parse(old.content).teacherNote || "";
      db.prepare(
        "INSERT INTO reports (id,org_id,student_id,week_start,week_end,content,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(org_id,student_id,week_start) DO UPDATE SET content=excluded.content,created_at=excluded.created_at",
      ).run(
        old?.id || id(),
        req.user.org_id,
        student.id,
        content.weekStart,
        content.weekEnd,
        JSON.stringify(content),
        now(),
      );
      generated++;
    }
    audit(req.user, "report.batch", b.weekStart);
  })();
  res.json({ generated, shared, empty });
});
app.post("/api/reports", auth, (req, res) => {
  const b = z
      .object({
        studentId: z.string(),
        weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(req.body),
    s = getStudent(req, b.studentId);
  if (!Number.isFinite(new Date(`${b.weekStart}T00:00:00Z`).getTime()))
    fail(400, "日期无效");
  const content = buildReport(s, b.weekStart);
  if (!content.total) fail(400, "该学生本周暂无作业，暂时无法生成报告");
  const old = db
    .prepare(
      "SELECT * FROM reports WHERE org_id=? AND student_id=? AND week_start=?",
    )
    .get(req.user.org_id, s.id, content.weekStart);
  if (old?.token_hash) fail(409, "这份报告已分享；请先撤销旧链接，再更新报告");
  if (old) content.teacherNote = JSON.parse(old.content).teacherNote || "";
  const rid = old?.id || id();
  db.prepare(
    "INSERT INTO reports (id,org_id,student_id,week_start,week_end,content,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(org_id,student_id,week_start) DO UPDATE SET content=excluded.content,created_at=excluded.created_at",
  ).run(
    rid,
    req.user.org_id,
    s.id,
    content.weekStart,
    content.weekEnd,
    JSON.stringify(content),
    now(),
  );
  audit(req.user, "report.generate", rid);
  res.json({ id: rid, content });
});
app.patch("/api/reports/:id", auth, (req, res) => {
  const r = getReport(req, req.params.id),
    b = z.object({ teacherNote: z.string().max(1500) }).parse(req.body);
  if (r.token_hash) fail(409, "请先撤销分享，再修改报告");
  const content = { ...JSON.parse(r.content), teacherNote: b.teacherNote };
  db.prepare("UPDATE reports SET content=? WHERE id=?").run(
    JSON.stringify(content),
    r.id,
  );
  res.json({ ok: true });
});
app.post("/api/reports/:id/share", auth, (req, res) => {
  const r = getReport(req, req.params.id),
    raw = token(),
    pin = String(randomInt(100000, 1000000));
  const expires = new Date(Date.now() + 14 * 86400000).toISOString();
  db.prepare(
    "UPDATE reports SET token_hash=?,pin_hash=?,expires_at=? WHERE id=?",
  ).run(hash(raw), hash(`${raw}:${pin}`), expires, r.id);
  audit(req.user, "report.share", r.id);
  res.json({ path: `/r/${raw}`, pin, expiresAt: expires });
});
app.delete("/api/reports/:id/share", auth, (req, res) => {
  const r = getReport(req, req.params.id);
  db.prepare(
    "UPDATE reports SET token_hash=NULL,pin_hash=NULL,expires_at=NULL WHERE id=?",
  ).run(r.id);
  audit(req.user, "report.revoke", r.id);
  res.json({ ok: true });
});
app.post("/api/public/reports/:token", authLimit, (req, res) => {
  const b = z.object({ pin: z.string().regex(/^\d{6}$/) }).parse(req.body);
  const r = db
    .prepare(
      "SELECT r.*,o.name org_name,o.demo FROM reports r JOIN organizations o ON o.id=r.org_id WHERE r.token_hash=? AND r.expires_at>?",
    )
    .get(hash(req.params.token), now());
  if (!r || hash(`${req.params.token}:${b.pin}`) !== r.pin_hash)
    fail(404, "访问码不正确，或报告链接已失效");
  res.set("X-Robots-Tag", "noindex, nofollow").json({
    orgName: r.org_name,
    demo: !!r.demo,
    content: JSON.parse(r.content),
  });
});
app.get("/api/team", auth, admin, (req, res) =>
  res.json(
    db
      .prepare(
        "SELECT u.id,u.name,u.role,COUNT(s.id) student_count FROM users u LEFT JOIN students s ON s.teacher_id=u.id WHERE u.org_id=? GROUP BY u.id ORDER BY u.role,u.name",
      )
      .all(req.user.org_id),
  ),
);
app.post("/api/team/invite", auth, admin, (req, res) => {
  const raw = token();
  db.prepare("INSERT INTO invitations VALUES (?,?,?,0)").run(
    hash(raw),
    req.user.org_id,
    new Date(Date.now() + 3 * 86400000).toISOString(),
  );
  audit(req.user, "teacher.invite", "new");
  res.json({ path: `/join/${raw}` });
});
app.use("/api", (req, res) => res.status(404).json({ error: "接口不存在" }));
if (fs.existsSync(path.join(root, "dist"))) {
  app.use(express.static(path.join(root, "dist")));
  app.get("/{*splat}", (req, res) =>
    res.sendFile(path.join(root, "dist", "index.html")),
  );
}
app.use((err, req, res, next) => {
  if (err instanceof z.ZodError)
    return res
      .status(400)
      .json({ error: err.issues.map((x) => x.message).join("；") });
  if (err instanceof multer.MulterError)
    return res.status(400).json({
      error:
        err.code === "LIMIT_FILE_SIZE"
          ? "每张照片不能超过 12 MB"
          : "每次最多上传 12 张照片",
    });
  if (!err.status) console.error("Request failed:", err.code || err.name);
  res
    .status(err.status || 500)
    .json({ error: err.status ? err.message : "操作失败，请稍后再试" });
});
export { app };
if (process.env.TEST_MODE !== "true") {
  const server = app.listen(config.port, config.host, () =>
    console.log(`拾光服务已启动：http://localhost:${config.port}`),
  );
  const stop = startWorker();
  const shutdown = () => {
    stop();
    server.close(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
