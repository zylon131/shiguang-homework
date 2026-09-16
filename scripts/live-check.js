import sharp from "sharp";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
const origin = "http://localhost:8787";
const base = origin + "/api";
const demo = await fetch(base + "/auth/demo", {
  method: "POST",
  headers: { "X-Requested-With": "shiguang" },
});
const cookie = demo.headers.get("set-cookie").split(";")[0];
async function call(url, body) {
  const r = await fetch(base + url, {
    method: body ? "POST" : "GET",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-Requested-With": "shiguang",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error);
  return data;
}
const sid = (
  await call("/students", {
    names: ["合成作业验证"],
    grade: 3,
    className: "接口验证",
  })
).ids[0];
const fixtures = [
  {
    subject: "数学",
    lines: ["三年级数学练习", "1. 305 + 217 = 522", "2. 24 × 3 = 62"],
  },
  {
    subject: "语文",
    lines: [
      "三年级语文练习",
      "1. 填写《静夜思》：床前明月光，疑是____。",
      "学生答案：天上霜",
      "2. 填写《静夜思》：举头望明月，低头____。",
      "学生答案：思故乡",
    ],
  },
  {
    subject: "英语",
    lines: [
      "Grade 3 English",
      "1. She ____ books every day. (read / reads)",
      "Student answer: read",
      "2. They ____ football every day. (play / plays)",
      "Student answer: play",
    ],
  },
];
fs.mkdirSync("test-results/live", { recursive: true });
const started = Date.now();
for (const [i, f] of fixtures.entries()) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${170 + f.lines.length * 85}"><rect width="100%" height="100%" fill="white"/>${f.lines.map((line, n) => `<text x="55" y="${80 + n * 85}" font-family="Microsoft YaHei,Arial" font-size="36" fill="#202020">${line}</text>`).join("")}</svg>`;
  const buffer = await sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toBuffer();
  fs.writeFileSync(`test-results/live/subject-${i}.jpg`, buffer);
  const form = new FormData();
  form.append("studentId", sid);
  form.append("subject", f.subject);
  form.append("idempotencyKey", randomUUID());
  form.append(
    "photos",
    new Blob([buffer], { type: "image/jpeg" }),
    `subject-${i}.jpg`,
  );
  const r = await fetch(base + "/jobs", {
    method: "POST",
    headers: { Cookie: cookie, "X-Requested-With": "shiguang" },
    body: form,
  });
  if (!r.ok) throw Error(JSON.stringify(await r.json()));
}
let student;
for (let i = 0; i < 180; i++) {
  student = (await call("/dashboard")).students.find((s) => s.id === sid);
  if (student.jobs.every((j) => ["done", "failed"].includes(j.status))) break;
  await new Promise((r) => setTimeout(r, 1000));
}
console.log(
  "Photo grading:",
  JSON.stringify({
    seconds: Math.round((Date.now() - started) / 100) / 10,
    jobs: student.jobs.map((j) => ({
      subject: j.subject,
      status: j.status,
      error: j.error,
    })),
  }),
);
if (student.jobs.some((j) => j.status !== "done")) process.exitCode = 1;
let questions = await call(`/questions?status=all&studentId=${sid}`);
console.log(
  "Recognized questions:",
  JSON.stringify(
    questions.map((q) => ({
      subject: q.subject,
      text: q.text,
      studentAnswer: q.student_answer,
      correctAnswer: q.correct_answer,
      verdict: q.ai_verdict,
      status: q.status,
      confidence: q.confidence,
    })),
  ),
);
const wrong = questions.filter((q) => q.ai_verdict === "wrong");
if (
  questions.length !== 6 ||
  wrong.length !== 3 ||
  questions.filter((q) => q.status === "correct").length !== 3
)
  process.exitCode = 1;
for (const q of wrong)
  await call(`/questions/${q.id}/review`, { verdict: "wrong" });
for (let i = 0; i < 180; i++) {
  questions = await call(`/questions?status=wrong&studentId=${sid}`);
  if (
    questions.length === wrong.length &&
    questions.every(
      (q) => q.practice.length === 3 || q.practice_status === "failed",
    )
  )
    break;
  await new Promise((r) => setTimeout(r, 1000));
}
console.log(
  "Practice generation:",
  JSON.stringify(
    questions.map((q) => ({
      subject: q.subject,
      knowledge: q.knowledge,
      count: q.practice.length,
      status: q.practice_status,
      error: q.practice_error,
      exercises: q.practice,
    })),
  ),
);
if (questions.some((q) => q.practice.length !== 3)) process.exitCode = 1;
const dashboard = await call("/dashboard");
const report = await call("/reports", {
  studentId: sid,
  weekStart: dashboard.week.start,
});
const shared = await call(`/reports/${report.id}/share`, {});
const evidence = {
  passed: !process.exitCode,
  model: "MiniMax-M3",
  totalSeconds: Math.round((Date.now() - started) / 100) / 10,
  studentId: sid,
  questions: 6,
  wrong: wrong.length,
  practices: questions.reduce((n, q) => n + q.practice.length, 0),
  report: report.content,
};
fs.writeFileSync(
  "test-results/live/result.json",
  JSON.stringify(evidence, null, 2),
);
console.log(
  "End-to-end result:",
  JSON.stringify({
    passed: evidence.passed,
    totalSeconds: evidence.totalSeconds,
    questions: evidence.questions,
    wrong: evidence.wrong,
    practices: evidence.practices,
    reportAccuracy: report.content.accuracy,
    reportShareCreated: !!shared.path,
  }),
);
