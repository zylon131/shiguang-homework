import { MATH_CURRICULUM } from "../tag-data/math.ts";
import { ENGLISH_CURRICULUM } from "../tag-data/english.ts";
import { CHINESE_CURRICULUM } from "../tag-data/chinese.ts";

export const UNCLASSIFIED = "待归类";
const grades = ["一年级", "二年级", "三年级", "四年级", "五年级", "六年级"];
const subjects = { 数学: MATH_CURRICULUM, 英语: ENGLISH_CURRICULUM, 语文: CHINESE_CURRICULUM };

export function getKnowledgeCandidates(subject, grade) {
  if (!Number.isInteger(grade) || grade < 1 || grade > 6) return [];
  const chapters = subjects[subject]?.[grades[grade - 1]] || [];
  const tags = chapters.flatMap(chapter => [
    ...(chapter.tags || []),
    ...(chapter.sections || []).flatMap(section => section.tags || []),
  ]);
  return [...new Set(tags.map(tag => tag.trim()).filter(Boolean))];
}

export function isAllowedKnowledge(subject, grade, knowledge) {
  return knowledge === UNCLASSIFIED || getKnowledgeCandidates(subject, grade).includes(knowledge);
}

export function canonicalKnowledge(subject, grade, knowledge) {
  const trimmed = typeof knowledge === "string" ? knowledge.trim() : "";
  return getKnowledgeCandidates(subject, grade).includes(trimmed) ? trimmed : UNCLASSIFIED;
}

// Historical reports retain valid primary-school labels even after a student advances a grade.
export function isStandardKnowledge(subject, knowledge) {
  return grades.some((_, index) => getKnowledgeCandidates(subject, index + 1).includes(knowledge));
}

export function buildKnowledgePrompt(subject, grade) {
  const candidates = getKnowledgeCandidates(subject, grade);
  const rules = `\n知识点归类必须遵循本项目提供的标准大纲，不能自行发明、改写、拼接标签，也不能把答案、错因或章节名作为knowledge。只允许返回一个候选标签的原文。候选列表严格限定为${grade}年级${subject}，不包含其他年级或初高中内容。遇到复习低年级内容、超纲、看不清或没有贴切候选时，knowledge必须为「${UNCLASSIFIED}」，不要强行归到相近但不准确的标签。归类不确定不等于答案错误，verdict仍需独立核对。`;
  return rules + (candidates.length
    ? `\n可用knowledge候选列表（原样选择一项）：${JSON.stringify(candidates)}\n保留状态：${UNCLASSIFIED}（不属于知识点，不参与薄弱点统计）。`
    : `\n当前提供的大纲没有${grade}年级${subject}知识点条目。所有题目的knowledge固定为「${UNCLASSIFIED}」，禁止生成自由标签。仍需正常识别、核对答案并输出批改结果。`);
}
