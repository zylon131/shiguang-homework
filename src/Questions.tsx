import { useEffect, useState } from "react";
import {
  Check,
  X,
  ChevronRight,
  ArrowLeft,
  BookOpen,
  Image,
  PenLine,
  CheckCheck,
  RefreshCw,
  Printer,
  Search,
} from "lucide-react";
import type { Question, Student, Exercise } from "./types";
import { api, post, dateLabel } from "./api";
import { Avatar, Empty, Modal, PageTitle, Spinner, Subject } from "./ui";
export default function Questions({
  mode,
  questions,
  students,
  studentId,
  onStudentChange,
  onRefresh,
  notify,
  onBack,
}: {
  mode: "review" | "mistakes" | "audit";
  questions: Question[];
  students: Student[];
  studentId: string;
  onStudentChange: (v: string) => void;
  onRefresh: () => Promise<void>;
  notify: (s: string) => void;
  onBack: () => void;
}) {
  const [subject, setSubject] = useState("全部科目"),
    [search, setSearch] = useState(""),
    [mastery, setMastery] = useState("all"),
    [busy, setBusy] = useState(""),
    [editing, setEditing] = useState<Question | null>(null),
    [viewing, setViewing] = useState<Question | null>(null),
    [image, setImage] = useState<string | null>(null);
  const filtered = questions.filter(
    (q) =>
      (!studentId || q.student_id === studentId) &&
      (subject === "全部科目" || q.subject === subject) &&
      (!search ||
        `${q.text}${q.knowledge}${q.student_name}`.includes(search)) &&
      (mode !== "mistakes" ||
        mastery === "all" ||
        (mastery === "done" ? q.mastered : !q.mastered)),
  );
  async function act(q: Question, verdict: string, extra = {}) {
    setBusy(q.id);
    try {
      await post(`/questions/${q.id}/review`, { verdict, ...extra });
      await onRefresh();
      notify(
        verdict === "wrong"
          ? "已收录错题，正在生成 3 道巩固练习"
          : verdict === "correct"
            ? "已确认为正确"
            : "已排除，未计入学情统计",
      );
      setEditing(null);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function mastered(q: Question) {
    setBusy(q.id);
    try {
      await post(`/questions/${q.id}/mastery`, { mastered: !q.mastered });
      await onRefresh();
      notify(q.mastered ? "已改为继续巩固" : "已标记掌握，保留成长记录");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <PageTitle
        eyebrow={
          mode !== "mistakes"
            ? "QUICK REVIEW · 集中确认"
            : "MISTAKE NOTEBOOK · 一题一进步"
        }
        title={
          mode === "audit"
            ? "逐题批改记录"
            : mode === "review"
              ? "只看需要你确认的题"
              : "把错题，变成下一次的进步"
        }
        description={
          mode === "audit"
            ? "查看该学生最近 500 道题的判定；发现问题时，可修改识别并更正结果。"
            : mode === "review"
              ? "先看学生答案和原图，确认后自动整理。低置信度与主观题都留给你。"
              : "错题按学生和知识点归档，每道错题都有对应的巩固方向。"
        }
        action={
          <button
            className="button secondary"
            onClick={mode !== "mistakes" ? onBack : () => window.print()}
          >
            {mode !== "mistakes" ? (
              <ArrowLeft size={17} />
            ) : (
              <Printer size={17} />
            )}{" "}
            {mode !== "mistakes" ? "返回工作台" : "打印当前错题"}
          </button>
        }
      />
      <div className="collection-tools">
        <select
          aria-label="选择学生"
          value={studentId}
          onChange={(e) => onStudentChange(e.target.value)}
        >
          {mode !== "audit" && <option value="">全部学生</option>}
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          aria-label="筛选科目"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        >
          <option>全部科目</option>
          {["语文", "数学", "英语"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        {mode === "mistakes" && (
          <select
            aria-label="掌握状态"
            value={mastery}
            onChange={(e) => setMastery(e.target.value)}
          >
            <option value="all">全部状态</option>
            <option value="todo">待巩固</option>
            <option value="done">已掌握</option>
          </select>
        )}
        <label className="search-field">
          <Search size={17} />
          <input
            placeholder="搜索题目、知识点"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="collection-count">
        {mode === "audit"
          ? "批改记录"
          : mode === "review"
            ? "需要确认"
            : "已归档"}{" "}
        <strong>{filtered.length}</strong> 道题
        {mode !== "mistakes" && (
          <span> · 不确定时可以编辑，或排除不完整题目</span>
        )}
      </div>
      {!filtered.length ? (
        <div className="panel">
          <Empty
            title={
              mode !== "mistakes"
                ? "当前没有待确认的题目"
                : "这里记录每一次进步"
            }
            description={
              mode !== "mistakes"
                ? "可以继续上传作业；需要复核的题目会自动出现在这里。"
                : "确认错题后，就会自动归档在这里。也可以调整筛选条件。"
            }
          />
        </div>
      ) : (
        <div className="question-grid">
          {filtered.map((q, i) => (
            <article
              className={`panel question-card ${q.mastered ? "mastered" : ""}`}
              key={q.id}
            >
              <div className="question-head">
                <div className="question-student">
                  <Avatar name={q.student_name} index={i} />
                  <div>
                    <strong>{q.student_name}</strong>
                    <small>
                      {q.grade} 年级 · {dateLabel(q.created_at)}
                    </small>
                  </div>
                </div>
                <Subject value={q.subject} />
              </div>
              <div className="question-label">
                <span>第 {q.number} 题</span>
                {mode !== "mistakes" ? (
                  <span
                    className={`status ${mode === "audit" && q.status === "correct" ? "green" : q.ai_verdict === "uncertain" || q.confidence < 0.92 ? "blue" : "amber"}`}
                  >
                    {mode === "audit" && q.status === "correct"
                      ? "已判正确"
                      : mode === "audit" && q.status === "wrong"
                        ? "已确认错题"
                        : mode === "audit" && q.status === "excluded"
                          ? "已排除"
                          : q.ai_verdict === "uncertain" || q.confidence < 0.92
                            ? "需要人工判断"
                            : "疑似错题"}
                  </span>
                ) : (
                  <span className={`status ${q.mastered ? "green" : "amber"}`}>
                    {q.mastered ? "已掌握" : "待巩固"}
                  </span>
                )}
              </div>
              <p className="question-text">{q.text}</p>
              <div className="answer-comparison">
                <div>
                  <span>学生答案</span>
                  <p>{q.student_answer || "未作答"}</p>
                </div>
                <div>
                  <span>参考答案</span>
                  <p>{q.correct_answer || "需老师补充"}</p>
                </div>
              </div>
              <div className="explanation">
                <BookOpen size={16} />
                <div>
                  <span>{q.knowledge}</span>
                  <p>{q.explanation}</p>
                </div>
              </div>
              <div className="question-utilities">
                {q.imageUrl ? (
                  <button onClick={() => setImage(q.imageUrl)}>
                    <Image size={15} />
                    查看原图
                  </button>
                ) : (
                  <span className="muted-label">示例题目 · 无原图</span>
                )}
                <button onClick={() => setEditing(q)}>
                  <PenLine size={14} />
                  修改识别
                </button>
              </div>
              {mode !== "mistakes" ? (
                <div className="review-actions">
                  <button
                    className="button secondary"
                    onClick={() => act(q, "correct")}
                    disabled={busy === q.id}
                  >
                    <Check size={17} />
                    其实是对的
                  </button>
                  <button
                    className="button primary"
                    onClick={() => act(q, "wrong")}
                    disabled={busy === q.id}
                  >
                    {busy === q.id ? <Spinner /> : <BookOpen size={17} />}
                    确认错题
                  </button>
                </div>
              ) : (
                <div className="mistake-actions">
                  <button
                    className="button secondary"
                    onClick={() => setViewing(q)}
                  >
                    <BookOpen size={16} />
                    {q.practice.length
                      ? "巩固练习 · 3 道"
                      : q.practice_status === "failed"
                        ? "练习生成失败"
                        : "查看巩固练习"}
                    <ChevronRight size={15} />
                  </button>
                  <button
                    className={`icon-button ${q.mastered ? "is-mastered" : ""}`}
                    title={q.mastered ? "改为待巩固" : "标记已掌握"}
                    aria-label={q.mastered ? "改为待巩固" : "标记已掌握"}
                    disabled={busy === q.id}
                    onClick={() => mastered(q)}
                  >
                    <CheckCheck size={22} />
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {editing && (
        <EditQuestion
          question={editing}
          busy={busy === editing.id}
          onClose={() => setEditing(null)}
          onSave={(v, extra) => act(editing, v, extra)}
        />
      )}
      {image && (
        <Modal
          title="作业原图"
          subtitle="可以放大核对题干和孩子的书写答案。"
          wide
          onClose={() => setImage(null)}
        >
          <div className="source-image">
            <img src={image} alt="作业原始照片" />
          </div>
        </Modal>
      )}
      {viewing && (
        <PracticeModal
          question={questions.find((q) => q.id === viewing.id) || viewing}
          onClose={() => setViewing(null)}
          onRefresh={onRefresh}
          notify={notify}
        />
      )}
    </>
  );
}
function EditQuestion({
  question: q,
  busy,
  onClose,
  onSave,
}: {
  question: Question;
  busy: boolean;
  onClose: () => void;
  onSave: (v: string, e: Record<string, string>) => void;
}) {
  const [text, setText] = useState(q.text),
    [studentAnswer, setStudent] = useState(q.student_answer),
    [correctAnswer, setCorrect] = useState(q.correct_answer),
    [knowledge, setKnowledge] = useState(q.knowledge),
    [explanation, setExplanation] = useState(q.explanation);
  const extra = { text, studentAnswer, correctAnswer, knowledge, explanation };
  const [catalog, setCatalog] = useState<string[] | null>(null);
  const [catalogError, setCatalogError] = useState("");
  useEffect(() => {
    let active = true;
    api<{candidates:string[]}>(`/curriculum?subject=${encodeURIComponent(q.subject)}&grade=${q.grade}`)
      .then(result => { if(active) { setCatalog(result.candidates); setKnowledge(value => result.candidates.includes(value) ? value : "待归类"); } })
      .catch(error => { if(active) setCatalogError(error.message); });
    return () => { active = false; };
  }, [q.subject, q.grade]);
  return (
    <Modal title="核对并修改题目" onClose={onClose} locked={busy}>
      <div className="form-stack">
        <label>
          题干
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
          />
        </label>
        <label>
          学生答案
          <input
            value={studentAnswer}
            onChange={(e) => setStudent(e.target.value)}
          />
        </label>
        <label>
          参考答案
          <input
            value={correctAnswer}
            onChange={(e) => setCorrect(e.target.value)}
          />
        </label>
        <label>
          知识点
          <select
            value={knowledge}
            onChange={(e) => setKnowledge(e.target.value)}
            disabled={catalog === null}
          ><option value="待归类">待归类</option>{catalog?.map(tag => <option key={tag} value={tag}>{tag}</option>)}</select>
          <small>{catalogError || (catalog === null ? "正在加载标准大纲…" : catalog.length ? "仅可选择当前年级标准标签；复习题或未覆盖内容可保留待归类。" : "提供的大纲尚无该年级科目条目。仍可确认对错，知识点暂待归类。")}</small>
        </label>
        <label>
          解析
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            rows={2}
          />
        </label>
        <div className="review-actions">
          <button
            className="button secondary"
            disabled={busy || catalog === null || !text.trim() || !knowledge.trim()}
            onClick={() => onSave("correct", extra)}
          >
            保存为正确
          </button>
          <button
            className="button primary"
            disabled={
              busy || catalog === null || !text.trim() || !knowledge.trim() || !correctAnswer.trim()
            }
            onClick={() => onSave("wrong", extra)}
          >
            {busy ? <Spinner /> : "保存为错题"}
          </button>
        </div>
        <button
          className="button text"
          disabled={busy}
          onClick={() => onSave("excluded", {})}
        >
          题目不完整，排除本题
        </button>
      </div>
    </Modal>
  );
}
function PracticeModal({
  question: q,
  onClose,
  onRefresh,
  notify,
}: {
  question: Question;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [answers, setAnswers] = useState(false),
    [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Exercise[] | null>(null);
  function edit(index: number, field: keyof Exercise, value: string) {
    setDraft((items) =>
      items!.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    );
  }
  async function save() {
    setBusy(true);
    try {
      await api(`/questions/${q.id}/practice`, {
        method: "PATCH",
        body: JSON.stringify({ exercises: draft }),
      });
      await onRefresh();
      setDraft(null);
      setAnswers(true);
      notify("练习已保存；已有周报请更新后再分享");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function retry() {
    setBusy(true);
    try {
      await post(`/questions/${q.id}/practice`);
      await onRefresh();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`${q.student_name}的巩固练习`}
      subtitle={`${q.subject} · ${q.knowledge} · 从基础到提升`}
      onClose={onClose}
      locked={busy}
      wide
    >
      <div className="practice-body">
        {q.practice.length ? (
          <>
            <div className="notice">
              根据原题知识点生成的新题，请老师核对后交给孩子练习。
            </div>
            {(draft || q.practice).map((p, i) => (
              <div className="exercise" key={i}>
                <span className="exercise-number">{i + 1}</span>
                <div>
                  <span className="exercise-level">{p.difficulty}</span>
                  {draft ? (
                    <div className="practice-edit-fields">
                      <label>
                        第 {i + 1} 题题干
                        <textarea
                          value={p.text}
                          rows={2}
                          onChange={(e) => edit(i, "text", e.target.value)}
                        />
                      </label>
                      <label>
                        第 {i + 1} 题答案
                        <input
                          value={p.answer}
                          onChange={(e) => edit(i, "answer", e.target.value)}
                        />
                      </label>
                      <label>
                        第 {i + 1} 题解析
                        <textarea
                          value={p.explanation}
                          rows={2}
                          onChange={(e) =>
                            edit(i, "explanation", e.target.value)
                          }
                        />
                      </label>
                    </div>
                  ) : (
                    <>
                      <p>{p.text}</p>
                      {answers && (
                        <div className="exercise-answer">
                          <strong>答案：{p.answer}</strong>
                          <p>{p.explanation}</p>
                        </div>
                      )}
                      <div className="writing-space" />
                    </>
                  )}
                </div>
              </div>
            ))}
            {draft ? (
              <div className="review-actions">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setDraft(null)}
                >
                  取消修改
                </button>
                <button
                  className="button primary"
                  disabled={
                    busy ||
                    draft.some(
                      (p) =>
                        !p.text.trim() ||
                        !p.answer.trim() ||
                        !p.explanation.trim(),
                    )
                  }
                  onClick={save}
                >
                  {busy ? <Spinner /> : "保存练习"}
                </button>
              </div>
            ) : (
              <>
                <div className="review-actions">
                  <button
                    className="button secondary"
                    onClick={() => setAnswers(!answers)}
                  >
                    {answers ? "隐藏答案" : "查看答案与解析"}
                  </button>
                  <button
                    className="button primary"
                    onClick={() => window.print()}
                  >
                    <Printer size={17} />
                    打印练习
                  </button>
                </div>
                <button
                  className="button text full"
                  onClick={() => setDraft(q.practice.map((p) => ({ ...p })))}
                >
                  <PenLine size={16} />
                  修改题目、答案或解析
                </button>
              </>
            )}
          </>
        ) : (
          <Empty
            title={
              q.practice_status === "failed"
                ? "这次练习生成没有完成"
                : q.knowledge === "待归类" ? "先确定知识点，再准备巩固练习"
                : "正在准备 3 道巩固练习"
            }
            description={
              q.knowledge === "待归类" ? "该题尚未匹配标准大纲，请返回题目修改知识点；大纲未覆盖时暂不生成练习。" : q.practice_error ||
              "你可以先处理其他作业，生成后会自动保存在这里。"
            }
            action={
              q.knowledge === "待归类" ? undefined : q.practice_status === "failed" || !q.practice_status ? (
                <button
                  className="button primary"
                  onClick={retry}
                  disabled={busy}
                >
                  {busy ? <Spinner /> : <RefreshCw size={16} />}重新生成
                </button>
              ) : (
                <Spinner />
              )
            }
          />
        )}
      </div>
    </Modal>
  );
}
