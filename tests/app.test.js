import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
process.env.TEST_MODE = "true";
process.env.DATA_DIR = `test-results/api-${randomUUID()}`;
process.env.ENABLE_DEMO = "false";
process.env.MINIMAX_API_KEY = "test-key-not-real";
process.env.PILOT_INVITE_CODE = "integration-test-invite";
let server, base, db, workerStop, modelServer;
let a, b, teacher, studentId, jobId, wrongId, reportId, share;
const image = await sharp({
  create: { width: 300, height: 200, channels: 3, background: "white" },
})
  .jpeg()
  .toBuffer();
async function request(
  url,
  { cookie, method = "GET", body, form, headers = {} } = {},
) {
  const res = await fetch(base + url, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      "X-Requested-With": "shiguang",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  const content = res.headers.get("content-type") || "";
  const data = content.includes("application/json")
    ? await res.json()
    : await res.arrayBuffer();
  return {
    status: res.status,
    data,
    cookie: res.headers.get("set-cookie")?.split(";")[0],
    headers: res.headers,
  };
}
async function waitFor(fn, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await fn();
    if (result) return result;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Timed out waiting for asynchronous work");
}
before(async () => {
  modelServer = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    const system = body.messages[0].content;
    const result = system.includes("生成3道")
      ? {
          exercises: ["基础", "巩固", "提升"].map((difficulty, i) => ({
            text: `${i + 2} × 8 = ?`,
            answer: String((i + 2) * 8),
            explanation: "根据乘法口诀计算。",
            difficulty,
          })),
        }
      : {
          questions: [
            {
              number: "1",
              text: "24 + 18 = ?",
              studentAnswer: "42",
              correctAnswer: "42",
              explanation: "24+18=42。",
              knowledge: "三位数加减法",
              verdict: "correct",
              confidence: 0.98,
            },
            {
              number: "2",
              text: "7 × 8 = ?",
              studentAnswer: "54",
              correctAnswer: "56",
              explanation: "七八五十六。",
              knowledge: "多位数乘一位数",
              verdict: "wrong",
              confidence: 0.97,
            },
            {
              number: "3",
              text: "阅读并说一说自己的看法。",
              studentAnswer: "看不清",
              correctAnswer: "需结合原文评价",
              explanation: "手写文字无法确认。",
              knowledge: "阅读理解",
              verdict: "uncertain",
              confidence: 0.4,
            },
          ],
        };
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        choices: [
          {
            message: { content: JSON.stringify(result) },
            finish_reason: "stop",
          },
        ],
      }),
    );
  });
  await new Promise((r) => modelServer.listen(0, "127.0.0.1", r));
  process.env.MINIMAX_BASE_URL = `http://127.0.0.1:${modelServer.address().port}/v1`;
  const mod = await import("../server/index.js");
  ({ db } = await import("../server/db.js"));
  server = mod.app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  workerStop = (await import("../server/worker.js")).startWorker();
});
after(async () => {
  workerStop?.();
  if (server) await new Promise((r) => server.close(r));
  if (modelServer) await new Promise((r) => modelServer.close(r));
  db?.close();
});

test("register isolated organizations and enforce sessions and request origin", async () => {
  assert.equal((await request("/dashboard")).status, 401);
  a = (
    await request("/auth/register", {
      method: "POST",
      body: {
        name: "甲老师",
        orgName: "甲机构",
        phone: "13800000001",
        password: "TestPass2026",
        inviteCode: "integration-test-invite",
      },
    })
  ).cookie;
  b = (
    await request("/auth/register", {
      method: "POST",
      body: {
        name: "乙老师",
        orgName: "乙机构",
        phone: "13800000002",
        password: "TestPass2026",
        inviteCode: "integration-test-invite",
      },
    })
  ).cookie;
  assert.ok(a && b);
  assert.equal(
    (
      await request("/auth/login", {
        method: "POST",
        body: { phone: "13800000001", password: "wrong" },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request("/students", {
        method: "POST",
        cookie: a,
        headers: { Origin: "https://evil.example" },
        body: { names: ["测试学生"], grade: 3, className: "三年级" },
      })
    ).status,
    403,
  );
  const added = await request("/students", {
    method: "POST",
    cookie: a,
    body: { names: ["测试学生"], grade: 3, className: "三年级" },
  });
  assert.equal(added.status, 201);
  studentId = added.data.ids[0];
  assert.equal(
    (await request("/dashboard", { cookie: b })).data.students.length,
    0,
  );
  assert.equal(
    (await request(`/questions?studentId=${studentId}`, { cookie: b })).status,
    404,
  );
});
test("photo batch is durable and idempotent; worker grades and tenant cannot read original", async () => {
  function form() {
    const f = new FormData();
    f.append("studentId", studentId);
    f.append("subject", "数学");
    f.append("idempotencyKey", "integration-upload-1");
    f.append("photos", new Blob([image], { type: "image/jpeg" }), "test.jpg");
    return f;
  }
  const upload = await request("/jobs", {
    method: "POST",
    cookie: a,
    form: form(),
  });
  assert.equal(upload.status, 202);
  jobId = upload.data.ids[0];
  const retry = await request("/jobs", {
    method: "POST",
    cookie: a,
    form: form(),
  });
  assert.deepEqual(retry.data.ids, [jobId]);
  assert.equal(
    (await request(`/jobs/${jobId}/image`, { cookie: b })).status,
    404,
  );
  assert.equal((await request(`/jobs/${jobId}/image`)).status, 401);
  assert.equal(
    (await request(`/jobs/${jobId}/image`, { cookie: a })).status,
    200,
  );
  const questions = await waitFor(async () => {
    const r = await request("/questions?status=all", { cookie: a });
    return r.data.length === 3 ? r.data : null;
  });
  assert.equal(questions.filter((q) => q.status === "correct").length, 1);
  assert.equal(questions.filter((q) => q.status === "pending").length, 2);
  wrongId = questions.find((q) => q.ai_verdict === "wrong").id;
  assert.equal(
    (
      await request(`/questions/${wrongId}/review`, {
        cookie: b,
        method: "POST",
        body: { verdict: "wrong" },
      })
    ).status,
    404,
  );
});
test("review triggers three exercises and excludes unresolved items from report accuracy", async () => {
  assert.equal((await request('/curriculum?subject=数学&grade=3')).status,401);
  const catalog=await request('/curriculum?subject=数学&grade=3',{cookie:a});
  assert.ok(catalog.data.candidates.includes('多位数乘一位数'));
  for (const knowledge of ['自创知识点','表内乘法']) {
    assert.equal((await request(`/questions/${wrongId}/review`,{cookie:a,method:'POST',body:{verdict:'wrong',knowledge}})).status,400);
  }
  assert.equal(
    (
      await request(`/questions/${wrongId}/review`, {
        cookie: a,
        method: "POST",
        body: { verdict: "wrong" },
      })
    ).status,
    200,
  );
  const q = await waitFor(async () => {
    const r = await request("/questions?status=wrong", { cookie: a });
    return r.data[0]?.practice.length === 3 ? r.data[0] : null;
  });
  assert.equal(q.practice[0].answer, "16");
  const day = (await request("/dashboard", { cookie: a })).data.week.start;
  const generated = await request("/reports", {
    cookie: a,
    method: "POST",
    body: { studentId, weekStart: day },
  });
  assert.equal(generated.status, 200);
  reportId = generated.data.id;
  assert.equal(generated.data.content.total, 3);
  assert.equal(generated.data.content.pending, 1);
  assert.equal(generated.data.content.accuracy, 50);
  assert.equal(generated.data.content.exercises.length, 1);
  const pending = (await request("/questions", { cookie: a })).data[0];
  assert.equal(pending.knowledge,'待归类');
  await request(`/questions/${pending.id}/review`,{cookie:a,method:'POST',body:{verdict:'wrong'}});
  const unclassified=await request('/reports',{cookie:a,method:'POST',body:{studentId,weekStart:day}});
  assert.equal(unclassified.data.content.wrong,2);
  assert.equal(unclassified.data.content.unclassified,1);
  assert.deepEqual(unclassified.data.content.knowledge,[{name:'多位数乘一位数',count:1}]);
  assert.equal((await request(`/questions/${pending.id}/practice`,{cookie:a,method:'POST'})).status,400);
  await request(`/questions/${pending.id}/review`, {
    cookie: a,
    method: "POST",
    body: { verdict: "excluded" },
  });
  const updated = await request("/reports", {
    cookie: a,
    method: "POST",
    body: { studentId, weekStart: day },
  });
  assert.equal(updated.data.content.total, 2);
  assert.equal(updated.data.content.pending, 0);
});
test("report sharing requires PIN, freezes content, rotates and revokes access", async () => {
  await request(`/reports/${reportId}`, {
    cookie: a,
    method: "PATCH",
    body: { teacherNote: "本周认真完成了订正。" },
  });
  share = (
    await request(`/reports/${reportId}/share`, { cookie: a, method: "POST" })
  ).data;
  const raw = share.path.split("/").pop();
  assert.equal(
    (
      await request(`/public/reports/${raw}`, {
        method: "POST",
        body: { pin: "000000" },
      })
    ).status,
    404,
  );
  const publicReport = await request(`/public/reports/${raw}`, {
    method: "POST",
    body: { pin: share.pin },
  });
  assert.equal(publicReport.status, 200);
  assert.equal(publicReport.data.content.teacherNote, "本周认真完成了订正。");
  assert.equal(
    (
      await request(`/reports/${reportId}`, {
        cookie: a,
        method: "PATCH",
        body: { teacherNote: "修改" },
      })
    ).status,
    409,
  );
  assert.equal(
    (await request(`/reports/${reportId}/share`, { cookie: b, method: "POST" }))
      .status,
    404,
  );
  const rotated = (
    await request(`/reports/${reportId}/share`, { cookie: a, method: "POST" })
  ).data;
  assert.equal(
    (
      await request(`/public/reports/${raw}`, {
        method: "POST",
        body: { pin: share.pin },
      })
    ).status,
    404,
  );
  await request(`/reports/${reportId}/share`, { cookie: a, method: "DELETE" });
  assert.equal(
    (
      await request(`/public/reports/${rotated.path.split("/").pop()}`, {
        method: "POST",
        body: { pin: rotated.pin },
      })
    ).status,
    404,
  );
});
test("teacher invitations are single use and student assignment controls access", async () => {
  const inv = (
    await request("/team/invite", { cookie: a, method: "POST" })
  ).data.path
    .split("/")
    .pop();
  const joined = await request("/auth/join", {
    method: "POST",
    body: {
      name: "丙老师",
      phone: "13800000003",
      password: "Teacher2026",
      token: inv,
    },
  });
  assert.equal(joined.status, 200);
  teacher = joined.cookie;
  assert.equal(
    (
      await request("/auth/join", {
        method: "POST",
        body: {
          name: "丁老师",
          phone: "13800000004",
          password: "Teacher2026",
          token: inv,
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (await request("/dashboard", { cookie: teacher })).data.students.length,
    0,
  );
  assert.equal(
    (await request(`/jobs/${jobId}/image`, { cookie: teacher })).status,
    404,
  );
  assert.equal(
    (await request("/team/invite", { cookie: teacher, method: "POST" })).status,
    403,
  );
  const tid = (await request("/me", { cookie: teacher })).data.id;
  await request(`/students/${studentId}`, {
    cookie: a,
    method: "PATCH",
    body: { name: "测试学生", grade: 3, className: "三年级", teacherId: tid },
  });
  assert.equal(
    (await request("/dashboard", { cookie: teacher })).data.students.length,
    1,
  );
  assert.equal(
    (await request(`/jobs/${jobId}/image`, { cookie: teacher })).status,
    200,
  );
  const aid = (await request("/me", { cookie: a })).data.id;
  assert.equal(
    (
      await request(`/students/${studentId}`, {
        cookie: teacher,
        method: "PATCH",
        body: {
          name: "测试学生",
          grade: 3,
          className: "三年级",
          teacherId: aid,
        },
      })
    ).status,
    403,
  );
});
test("model parsing and conservative confidence threshold", async () => {
  const {
    parseModelJson,
    initialStatus,
    gradingSchema,
    normalizeGrading,
    normalizePractice,
    practiceSchema,
  } = await import("../server/model.js");
  assert.deepEqual(
    parseModelJson('<think>private reasoning</think>```json\n{"ok":true}\n```'),
    { ok: true },
  );
  assert.equal(
    initialStatus({ verdict: "correct", confidence: 0.91 }),
    "pending",
  );
  assert.equal(initialStatus({ verdict: "wrong", confidence: 1 }), "pending");
  assert.equal(
    initialStatus({ verdict: "correct", confidence: 0.99 }),
    "correct",
  );
  assert.throws(() => gradingSchema.parse({ questions: [] }));
  const exercises = ["基础题", "巩固题", "提升题"].map((difficulty) => ({
    question: "2 × 8 = ?",
    correctAnswer: 16,
    analysis: "2 个 8 相加得到 16。",
    difficulty,
  }));
  const practice = practiceSchema.parse(normalizePractice({ exercises }));
  assert.equal(practice.exercises[0].answer, "16");
  assert.equal(practice.exercises[0].difficulty, "基础");
  assert.throws(() =>
    practiceSchema.parse(normalizePractice({ exercises: [null] })),
  );
  const editable = (await request("/questions?status=wrong", { cookie: a }))
    .data[0];
  const updatedExercises = editable.practice.map((p) => ({
    ...p,
    explanation: p.explanation + "（老师已核对）",
  }));
  assert.equal(
    (
      await request(`/questions/${wrongId}/practice`, {
        cookie: b,
        method: "PATCH",
        body: { exercises: updatedExercises },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(`/questions/${wrongId}/practice`, {
        cookie: a,
        method: "PATCH",
        body: { exercises: updatedExercises },
      })
    ).status,
    200,
  );
  assert.match(
    (await request("/questions?status=wrong", { cookie: a })).data[0]
      .practice[0].explanation,
    /老师已核对/,
  );
  const normalized = normalizeGrading({
    questions: [
      {
        student_answer: 54,
        correct_answer: 56,
        verdict: "incorrect",
        confidence: "0.98",
      },
    ],
  }).questions[0];
  assert.equal(normalized.studentAnswer, "54");
  assert.equal(normalized.correctAnswer, "56");
  assert.equal(normalized.verdict, "wrong");
  assert.equal(initialStatus(normalized), "pending");
  assert.equal(
    normalizeGrading({
      questions: [{ verdict: "unrecognized-label", confidence: 1 }],
    }).questions[0].verdict,
    "uncertain",
  );
  const week = (await request("/dashboard", { cookie: teacher })).data.week
    .start;
  const batch = await request("/reports/batch", {
    cookie: teacher,
    method: "POST",
    body: { weekStart: week },
  });
  assert.equal(batch.data.generated, 1);
  assert.equal(batch.data.empty, 0);
  await request("/auth/logout", { cookie: a, method: "POST" });
  assert.equal((await request("/dashboard", { cookie: a })).status, 401);
});
