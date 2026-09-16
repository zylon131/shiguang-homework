import { db, id, now } from "./db.js";
export function createDemo() {
  const orgId = id(),
    uid = id();
  db.transaction(() => {
    db.prepare("INSERT INTO organizations VALUES (?,?,1,?)").run(
      orgId,
      "向阳托管 · 体验空间",
      now(),
    );
    db.prepare("INSERT INTO users VALUES (?,?,?,?,?,?)").run(
      uid,
      orgId,
      "林老师",
      `demo-${uid}`,
      "!",
      "admin",
    );
    const names = [
      "陈一诺",
      "林子轩",
      "王沐辰",
      "张可欣",
      "李浩然",
      "周语桐",
      "许星禾",
      "赵梓涵",
      "吴思远",
      "郑安然",
      "孙亦航",
      "何嘉宁",
      "刘书言",
      "宋乐彤",
      "杨知夏",
    ];
    const templates = [
      {
        subject: "数学",
        text: "一盒彩笔有 24 支，3 盒彩笔一共有多少支？",
        student: "24 + 3 = 27（支）",
        answer: "24 × 3 = 72（支）",
        knowledge: "乘法的意义",
        explanation: "求 3 个 24 相加的和，用乘法计算：24 × 3 = 72。",
        practice: [
          {
            text: "每袋有 12 个苹果，4 袋一共有多少个？",
            answer: "48 个",
            explanation: "12 × 4 = 48。",
            difficulty: "基础",
          },
          {
            text: "一排摆了 16 盆花，5 排一共有多少盆？",
            answer: "80 盆",
            explanation: "16 × 5 = 80。",
            difficulty: "巩固",
          },
          {
            text: "3 盒彩笔，每盒 18 支，送给同学 8 支后还剩多少支？",
            answer: "46 支",
            explanation: "18 × 3 − 8 = 46。",
            difficulty: "提升",
          },
        ],
      },
      {
        subject: "语文",
        text: "选择正确的字填空：一（座 / 坐）小桥。",
        student: "坐",
        answer: "座",
        knowledge: "同音字辨析",
        explanation: "“座”是量词，可以修饰桥；“坐”表示动作。",
        practice: [
          {
            text: "选字填空：一（座 / 坐）高山。",
            answer: "座",
            explanation: "“座”是修饰山的量词。",
            difficulty: "基础",
          },
          {
            text: "选字填空：请（座 / 坐）下休息。",
            answer: "坐",
            explanation: "这里表示坐下的动作。",
            difficulty: "巩固",
          },
          {
            text: "选字填空：他（坐 / 座）在一（坐 / 座）小亭里。",
            answer: "坐；座",
            explanation: "第一空是动作，第二空是量词。",
            difficulty: "提升",
          },
        ],
      },
      {
        subject: "英语",
        text: "选择正确的单词：She ____ a student. (am / is / are)",
        student: "are",
        answer: "is",
        knowledge: "be 动词的用法",
        explanation: "主语 She 是第三人称单数，be 动词用 is。",
        practice: [
          {
            text: "I ____ happy. (am / is / are)",
            answer: "am",
            explanation: "I 与 am 搭配。",
            difficulty: "基础",
          },
          {
            text: "They ____ my friends. (am / is / are)",
            answer: "are",
            explanation: "They 是复数，用 are。",
            difficulty: "巩固",
          },
          {
            text: "My brother ____ tall. (am / is / are)",
            answer: "is",
            explanation: "My brother 是第三人称单数，用 is。",
            difficulty: "提升",
          },
        ],
      },
    ];
    names.forEach((name, i) => {
      const sid = id();
      db.prepare("INSERT INTO students VALUES (?,?,?,?,?,?,?)").run(
        sid,
        orgId,
        uid,
        name,
        3 + (i % 3),
        "晚托一班",
        new Date(Date.now() + i).toISOString(),
      );
      if (i > 10) return;
      const t = templates[i % 3],
        jid = id();
      db.prepare(
        "INSERT INTO jobs (id,org_id,student_id,teacher_id,subject,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
      ).run(jid, orgId, sid, uid, t.subject, "done", now(), now());
      for (let n = 1; n <= 8; n++) {
        const isIssue = n === 3,
          qid = id(),
          pending = isIssue && i < 5;
        const text = isIssue
          ? t.text
          : t.subject === "数学"
            ? `${12 + n} + ${n} = ?`
            : t.subject === "语文"
              ? "给“山”字注音。"
              : "Translate into Chinese: apple";
        const answer = isIssue
          ? t.answer
          : t.subject === "数学"
            ? String(12 + 2 * n)
            : t.subject === "语文"
              ? "shān"
              : "苹果";
        db.prepare(
          "INSERT INTO questions (id,org_id,student_id,job_id,subject,number,text,student_answer,correct_answer,explanation,knowledge,ai_verdict,confidence,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ).run(
          qid,
          orgId,
          sid,
          jid,
          t.subject,
          String(n),
          text,
          isIssue ? t.student : answer,
          answer,
          isIssue ? t.explanation : "答案正确。",
          isIssue
            ? t.knowledge
            : t.subject === "数学"
              ? "整数加法"
              : t.subject === "语文"
                ? "汉语拼音"
                : "基础词汇",
          isIssue ? (i === 1 ? "uncertain" : "wrong") : "correct",
          i === 1 && isIssue ? 0.64 : 0.97,
          isIssue ? (pending ? "pending" : "wrong") : "correct",
          now(),
        );
        if (isIssue && !pending)
          db.prepare("INSERT INTO practices VALUES (?,?,?,?,?)").run(
            id(),
            orgId,
            qid,
            JSON.stringify(t.practice),
            now(),
          );
      }
    });
  })();
  return db.prepare("SELECT * FROM users WHERE id=?").get(uid);
}
