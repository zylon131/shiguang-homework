import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Copy,
  FileText,
  Link,
  LockKeyhole,
  Printer,
  RefreshCw,
  Share2,
  X,
} from "lucide-react";
import type { Report, ReportContent, Student } from "./types";
import { api, post, copy, dateLabel } from "./api";
import { Avatar, Empty, Logo, Modal, PageTitle, Spinner, Subject } from "./ui";
export function ReportDocument({
  content: c,
  orgName,
  demo = false,
}: {
  content: ReportContent;
  orgName: string;
  demo?: boolean;
}) {
  const [answers, setAnswers] = useState(false);
  const end = new Date(`${c.weekEnd}T00:00:00+08:00`);
  end.setDate(end.getDate() - 1);
  return (
    <article className="report-document">
      <div className="report-brand">
        <Logo small />
        <span>{orgName}</span>
      </div>
      {demo && <div className="demo-report">体验示例 · 非真实学生学情</div>}
      <div className="report-cover">
        <span className="eyebrow">这一周，成长有迹可循</span>
        <h1>{c.studentName}的学习周报</h1>
        <p>
          {c.grade} 年级 · {dateLabel(c.weekStart)} —{" "}
          {dateLabel(end.toISOString())}
        </p>
        <span className="report-sprout">✳</span>
      </div>
      <div className="report-metrics">
        <div>
          <strong>
            {c.days}
            <small>天</small>
          </strong>
          <span>作业记录</span>
        </div>
        <div>
          <strong>
            {c.total}
            <small>道</small>
          </strong>
          <span>本周题目</span>
        </div>
        <div>
          <strong>
            {c.accuracy === null ? "—" : c.accuracy}
            <small>{c.accuracy !== null ? "%" : ""}</small>
          </strong>
          <span>已判定题正确率</span>
        </div>
      </div>
      <section>
        <h2>这一周的学习足迹</h2>
        <p className="report-summary">{c.summary}</p>
        {c.pending > 0 && (
          <p className="notice">
            还有 {c.pending} 道待确认，未计入正确率；本报告反映生成时的记录。
          </p>
        )}
        <div className="subject-progress">
          {c.subjects.map((s) => (
            <div key={s.subject}>
              <Subject value={s.subject} />
              <div className="subject-bar">
                <i style={{ width: `${s.accuracy || 0}%` }} />
              </div>
              <strong>{s.accuracy === null ? "暂无" : `${s.accuracy}%`}</strong>
              <small>{s.total} 道</small>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2>接下来，重点练一练</h2>
        {c.knowledge.length ? (
          <div className="knowledge-tags">
            {c.knowledge.map((k) => (
              <span key={k.name}>
                {k.name}
                <b>{k.count} 道错题</b>
              </span>
            ))}
          </div>
        ) : (
          <p className="muted-label">{c.wrong ? "已记录错题，标准知识点暂待归类。" : "本周暂无已确认错题，继续保持。"}</p>
        )}
      </section>
      {c.teacherNote && (
        <section className="teacher-note">
          <h2>老师想对你说</h2>
          <p>{c.teacherNote}</p>
        </section>
      )}
      {!!c.practicePending && (
        <section>
          <p className="notice">
            另有 {c.practicePending}{" "}
            道错题的巩固练习尚待补充，本报告已列出当前完成的练习。
          </p>
        </section>
      )}
      {!!c.unclassified && <section><p className="notice">有 {c.unclassified} 道错题的知识点暂待归类，已计入错题数，但不计入具体薄弱知识点统计。</p></section>}
      {!!c.practiceOmitted && (
        <section>
          <p className="notice">
            本报告精选前 10 组练习，其余 {c.practiceOmitted}{" "}
            组可联系老师从错题本获取。
          </p>
        </section>
      )}
      {c.exercises.length > 0 && (
        <section>
          <div className="section-inline">
            <h2>专属巩固练习</h2>
            <button
              className="text-link no-print"
              onClick={() => setAnswers(!answers)}
            >
              {answers ? "收起答案" : "家长查看答案"}
            </button>
          </div>
          <p className="muted-label">
            根据本周错题知识点生成，每组 3 道，先独立作答再核对。
          </p>
          {c.exercises.map((g, i) => (
            <div className="report-exercise-group" key={i}>
              <h3>
                <Subject value={g.subject} />
                {g.knowledge}
              </h3>
              {g.items.map((e, j) => (
                <div className="exercise" key={j}>
                  <span className="exercise-number">{j + 1}</span>
                  <div>
                    <span className="exercise-level">{e.difficulty}</span>
                    <p>{e.text}</p>
                    {answers && (
                      <div className="exercise-answer">
                        <strong>{e.answer}</strong>
                        <p>{e.explanation}</p>
                      </div>
                    )}
                    <div className="writing-space" />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}
      <footer className="report-footer">
        每一次订正，都是一点点成长。
        <br />
        <small>
          {orgName} · 拾光记录于 {dateLabel(c.generatedAt)}
        </small>
      </footer>
    </article>
  );
}
export default function Reports({
  students,
  reports,
  week,
  orgName,
  demo,
  onRefresh,
  notify,
}: {
  students: Student[];
  reports: Report[];
  week: { start: string; end: string };
  orgName: string;
  demo: boolean;
  onRefresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [weekDate, setWeekDate] = useState(week.start),
    [busy, setBusy] = useState(""),
    [selected, setSelected] = useState<Report | null>(null),
    [note, setNote] = useState(""),
    [share, setShare] = useState<{
      url: string;
      pin: string;
      expiresAt: string;
    } | null>(null);
  const localWeekStart = (() => {
    const d = new Date(`${weekDate}T12:00:00`);
    if (!Number.isFinite(d.getTime())) return week.start;
    d.setDate(d.getDate() - ((d.getDay() || 7) - 1));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  async function batch() {
    setBusy("batch");
    try {
      const r = await post("/reports/batch", { weekStart: localWeekStart });
      await onRefresh();
      notify(
        `已准备 ${r.generated} 份报告${r.shared ? `，${r.shared} 份已分享报告保持原样` : ""}${r.empty ? `，${r.empty} 位学生本周暂无作业` : ""}`,
      );
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function generate(s: Student) {
    setBusy(s.id);
    try {
      const result = await post("/reports", {
        studentId: s.id,
        weekStart: localWeekStart,
      });
      await onRefresh();
      setSelected({
        id: result.id,
        student_id: s.id,
        student_name: s.name,
        week_start: result.content.weekStart,
        week_end: result.content.weekEnd,
        shared: false,
        expires_at: null,
        content: result.content,
      });
      setNote(result.content.teacherNote || "");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  function open(r: Report) {
    setSelected(r);
    setNote(r.content.teacherNote || "");
    setShare(null);
  }
  async function sharing() {
    if (!selected) return;
    setBusy(selected.id);
    try {
      if (!selected.shared)
        await api(`/reports/${selected.id}`, {
          method: "PATCH",
          body: JSON.stringify({ teacherNote: note }),
        });
      const r = await post(`/reports/${selected.id}/share`);
      setShare({
        url: `${location.origin}${r.path}`,
        pin: r.pin,
        expiresAt: r.expiresAt,
      });
      setSelected({
        ...selected,
        shared: true,
        expires_at: r.expiresAt,
        content: { ...selected.content, teacherNote: note },
      });
      await onRefresh();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function revoke() {
    if (!selected) return;
    setBusy(selected.id);
    try {
      await api(`/reports/${selected.id}/share`, { method: "DELETE" });
      setSelected({ ...selected, shared: false });
      setShare(null);
      await onRefresh();
      notify("旧链接已失效，现在可以修改或更新报告");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="WEEKLY REPORT · 把成长分享出去"
        title="这一周，进步看得见"
        description="真实作业记录、薄弱知识点、专属练习，整理成家长读得懂的一份周报。"
        action={
          <div className="report-page-actions">
            <label className="week-picker">
              <CalendarDays size={18} />
              <input
                type="date"
                aria-label="选择报告周内日期"
                value={weekDate}
                onChange={(e) => setWeekDate(e.target.value || week.start)}
              />
            </label>
            <button
              className="button primary"
              disabled={!!busy}
              onClick={batch}
            >
              {busy === "batch" ? <Spinner /> : <FileText size={17} />}
              一键准备全班周报
            </button>
          </div>
        }
      />
      <div className="report-info">
        <FileText size={21} />
        <div>
          <strong>先预览，再分享</strong>
          <p>
            选择周内任一天即可生成该周报告。链接有效 14 天，使用 6
            位访问码查看，随时可以撤销。
          </p>
        </div>
      </div>
      <div className="report-grid">
        {students.map((s, i) => {
          const r = reports.find(
            (r) => r.student_id === s.id && r.week_start === localWeekStart,
          );
          return (
            <section className="panel report-card" key={s.id}>
              <div className="question-head">
                <div className="question-student">
                  <Avatar name={s.name} index={i} />
                  <div>
                    <strong>{s.name}</strong>
                    <small>
                      {s.grade} 年级 · {s.class_name}
                    </small>
                  </div>
                </div>
                {r && (
                  <span className={`status ${r.shared ? "green" : "blue"}`}>
                    {r.shared ? "已生成链接" : "待分享"}
                  </span>
                )}
              </div>
              <div className="report-card-content">
                <FileText size={30} />
                <div>
                  <h3>{dateLabel(localWeekStart)} 起 · 学习周报</h3>
                  <p>
                    {r
                      ? `${r.content.total} 道题 · ${r.content.wrong} 道错题 · ${r.content.exercises.length} 组练习`
                      : "汇总本周作业与已确认的错题"}
                  </p>
                </div>
              </div>
              <button
                className={`button ${r ? "secondary" : "primary"} full`}
                disabled={busy === s.id}
                onClick={() => (r ? open(r) : generate(s))}
              >
                {busy === s.id ? <Spinner /> : r ? "查看报告" : "生成并预览"}
                <ArrowRight size={16} />
              </button>
            </section>
          );
        })}
      </div>
      {!students.length && (
        <div className="panel">
          <Empty
            title="从第一份作业开始"
            description="添加学生并上传作业后，就可以生成学习周报。"
          />
        </div>
      )}
      {selected && (
        <Modal
          title="家长报告预览"
          subtitle="请核对报告和练习，再生成分享链接。"
          wide
          onClose={() => {
            setSelected(null);
            setShare(null);
          }}
          locked={!!busy}
        >
          <div className="report-preview">
            <ReportDocument
              content={{ ...selected.content, teacherNote: note }}
              orgName={orgName}
              demo={demo}
            />
          </div>
          <div className="report-controls">
            {!!selected.content.practicePending && (
              <p className="notice" style={{ marginBottom: 16 }}>
                还有 {selected.content.practicePending}{" "}
                道错题的练习尚未生成。建议完成后使用最新记录更新报告，再分享给家长。
              </p>
            )}
            {!selected.shared && (
              <label>
                给家长的一句话（选填）
                <textarea
                  rows={2}
                  maxLength={1500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="写下你观察到的进步，或下周的小目标…"
                />
              </label>
            )}
            {share && (
              <div className="share-result">
                <strong>
                  <Check size={17} /> 分享链接已准备好
                </strong>
                <div className="share-url">{share.url}</div>
                <div>
                  访问码 <b className="pin">{share.pin}</b>
                  <span>有效至 {dateLabel(share.expiresAt)}</span>
                </div>
                <button
                  className="button primary full"
                  onClick={() =>
                    copy(
                      `${selected.student_name}的学习周报\n${share.url}\n访问码：${share.pin}\n有效至 ${dateLabel(share.expiresAt)}`,
                    )
                      .then(() => notify("已复制链接和访问码，可粘贴到微信"))
                      .catch((e) => notify(e.message))
                  }
                >
                  <Copy size={17} />
                  复制链接和访问码
                </button>
              </div>
            )}
            <div className="review-actions">
              <button
                className="button secondary"
                onClick={() => window.print()}
              >
                <Printer size={17} />
                打印
              </button>
              <button
                className="button primary"
                disabled={!!busy}
                onClick={sharing}
              >
                {busy ? <Spinner /> : <Share2 size={17} />}{" "}
                {selected.shared ? "重新生成链接" : "确认内容并生成链接"}
              </button>
            </div>
            {selected.shared ? (
              <button
                className="button text danger-text full"
                disabled={!!busy}
                onClick={revoke}
              >
                撤销分享链接
              </button>
            ) : (
              <button
                className="button text full"
                disabled={!!busy}
                onClick={() => {
                  const s = students.find((s) => s.id === selected.student_id);
                  if (s) generate(s);
                }}
              >
                <RefreshCw size={15} />
                用最新作业记录更新报告
              </button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
export function PublicReport({ token }: { token: string }) {
  const [pin, setPin] = useState(""),
    [data, setData] = useState<{
      orgName: string;
      demo: boolean;
      content: ReportContent;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="public-report-page">
      {data ? (
        <>
          <div className="public-toolbar no-print">
            <span>只属于这个孩子的成长记录</span>
            <button className="button secondary" onClick={() => window.print()}>
              <Printer size={16} />
              打印
            </button>
          </div>
          <ReportDocument
            content={data.content}
            orgName={data.orgName}
            demo={data.demo}
          />
        </>
      ) : (
        <div className="public-unlock">
          <Logo />
          <span className="unlock-icon">
            <LockKeyhole size={30} />
          </span>
          <h1>一份成长，等你查收</h1>
          <p>
            输入老师发来的 6 位访问码，
            <br />
            查看孩子本周的学习记录与巩固练习。
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                setData(await post(`/public/reports/${token}`, { pin }));
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <input
              className="pin-input"
              aria-label="6 位访问码"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoComplete="off"
              placeholder="6 位访问码"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            />
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="button primary full"
              disabled={busy || pin.length !== 6}
            >
              {busy ? (
                <Spinner />
              ) : (
                <>
                  查看学习周报
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
          <small>专属链接 · 无需注册 · 请勿公开转发</small>
        </div>
      )}
    </div>
  );
}
