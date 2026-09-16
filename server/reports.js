import { db, weekRange } from "./db.js";
import { isStandardKnowledge } from "./curriculum.js";
export function buildReport(student, weekStart) {
  const range = weekRange(new Date(`${weekStart}T12:00:00+08:00`));
  const from = `${range.start}T00:00:00+08:00`,
    to = `${range.end}T00:00:00+08:00`;
  const questions = db
    .prepare(
      "SELECT * FROM questions WHERE org_id=? AND student_id=? AND status IN ('correct','wrong','pending') AND created_at>=? AND created_at<? ORDER BY created_at",
    )
    .all(
      student.org_id,
      student.id,
      new Date(from).toISOString(),
      new Date(to).toISOString(),
    );
  const wrong = questions.filter((q) => q.status === "wrong"),
    pending = questions.filter((q) => q.status === "pending"),
    correct = questions.filter((q) => q.status === "correct");
  const days = new Set(
    questions.map((q) =>
      new Date(new Date(q.created_at).getTime() + 8 * 3600000)
        .toISOString()
        .slice(0, 10),
    ),
  ).size;
  const subjects = ["语文", "数学", "英语"].map((subject) => {
    const qs = questions.filter((q) => q.subject === subject),
      c = qs.filter((q) => q.status === "correct").length,
      w = qs.filter((q) => q.status === "wrong").length;
    return {
      subject,
      total: qs.length,
      correct: c,
      wrong: w,
      pending: qs.length - c - w,
      accuracy: c + w ? Math.round((c / (c + w)) * 100) : null,
    };
  });
  const knowledge = Object.entries(
    wrong.filter(q => isStandardKnowledge(q.subject, q.knowledge)).reduce((a, q) => {
      a[q.knowledge] = (a[q.knowledge] || 0) + 1;
      return a;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
  let practicePending = 0;
  const availableExercises = wrong.flatMap((q) => {
    if (!isStandardKnowledge(q.subject, q.knowledge)) { practicePending++; return []; }
    const practice = db
      .prepare("SELECT content FROM practices WHERE question_id=? AND org_id=?")
      .get(q.id, student.org_id);
    if (!practice) practicePending++;
    return practice
      ? [
          {
            knowledge: q.knowledge,
            subject: q.subject,
            items: JSON.parse(practice.content),
          },
        ]
      : [];
  });
  const exercises = availableExercises.slice(0, 10);
  return {
    studentName: student.name,
    grade: student.grade,
    className: student.class_name,
    weekStart: range.start,
    weekEnd: range.end,
    days,
    total: questions.length,
    correct: correct.length,
    wrong: wrong.length,
    pending: pending.length,
    accuracy:
      correct.length + wrong.length
        ? Math.round((correct.length / (correct.length + wrong.length)) * 100)
        : null,
    subjects,
    knowledge,
    unclassified: wrong.filter(q => !isStandardKnowledge(q.subject, q.knowledge)).length,
    exercises,
    practicePending,
    practiceOmitted: Math.max(0, availableExercises.length - exercises.length),
    mastered: wrong.filter((q) => q.mastered).length,
    summary: questions.length
      ? `本周记录了 ${days} 天、${questions.length} 道题的作业。已确认 ${correct.length} 道正确、${wrong.length} 道错题${pending.length ? `，另有 ${pending.length} 道待老师确认，未计入正确率` : ""}。${knowledge.length ? `建议重点巩固「${knowledge[0].name}」，先说清解题思路，再完成对应练习。` : "继续保持认真完成作业的习惯。"}`
      : "本周尚未记录作业，暂不评价学习表现。",
    teacherNote: "",
    generatedAt: new Date().toISOString(),
  };
}
