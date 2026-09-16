import { useState } from "react";
import {
  Camera,
  ArrowRight,
  ChevronDown,
  Check,
  Clock3,
  Search,
  Plus,
  ClipboardCheck,
  BookOpen,
  ArrowUpRight,
  ScanLine,
  CheckCheck,
  MoreHorizontal,
} from "lucide-react";
import type { Dashboard as Data, Student, User } from "./types";
import { Avatar, Empty, Subject, TextLink } from "./ui";
export const statuses: Record<string, { label: string; className: string }> = {
  waiting: { label: "待上传", className: "muted" },
  processing: { label: "批改中", className: "blue" },
  review: { label: "待确认", className: "amber" },
  done: { label: "已完成", className: "green" },
  failed: { label: "需重试", className: "red" },
};
export default function Dashboard({
  data,
  user,
  onUpload,
  onReview,
  onReports,
  onStudent,
  onAdd,
}: {
  data: Data;
  user: User;
  onUpload: (s?: Student) => void;
  onReview: (s?: Student) => void;
  onReports: () => void;
  onStudent: (s: Student) => void;
  onAdd: () => void;
}) {
  const [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [classFilter, setClassFilter] = useState("全部班级");
  const students = data.students.filter(
    (s) =>
      (filter === "all" || s.status === filter) &&
      (classFilter === "全部班级" || s.class_name === classFilter) &&
      s.name.includes(search),
  );
  const classes = [...new Set(data.students.map((s) => s.class_name))];
  const { stats } = data;
  const date = new Date(`${data.date}T12:00:00+08:00`);
  return (
    <>
      <div className="greeting">
        <div>
          <div className="greeting-date">
            {date.toLocaleDateString("zh-CN", {
              month: "long",
              day: "numeric",
              weekday: "long",
            })}
            <span /> 新的一天，新的进步
          </div>
          <h1>
            {user.name}，今天辛苦了<span className="greeting-dot">。</span>
          </h1>
          <p>作业拍下来，剩下的交给拾光和你。</p>
        </div>
        <button
          className="button primary desktop-upload"
          onClick={() => onUpload()}
        >
          <Camera size={19} />
          拍照批改
        </button>
      </div>
      <div className="dashboard-layout">
        <div className="dashboard-main">
          <section className="work-hero">
            <div className="hero-copy">
              <div className="mini-label">
                <span className="live-dot" /> 今日作业进度
              </div>
              <h2>
                {stats.submitted === stats.total && stats.total
                  ? "今天的作业，收齐了。"
                  : stats.total ? `还有 ${stats.total - stats.submitted} 位，等你收作业。` : "从添加第一位学生开始。"}
              </h2>
              <p>
                <span className="hero-submitted">{stats.submitted} / {stats.total} 位学生已上传作业</span>
                <span className="hero-divider">|</span>
                {stats.pages} 页作业已收到
              </p>
              <div
                className="segmented-progress"
                aria-label={`${stats.submitted} 位已上传，共 ${stats.total} 位`}
              >
                {Array.from({ length: stats.total || 15 }, (_, i) => (
                  <span
                    key={i}
                    className={i < stats.submitted ? "filled" : ""}
                  />
                ))}
              </div>
              <button
                className="hero-link"
                onClick={() => setFilter("waiting")}
              >
                {stats.total - stats.submitted > 0
                  ? `还有 ${stats.total - stats.submitted} 位同学，继续收作业`
                  : "查看学生作业进度"}
                <ArrowRight size={16} />
              </button>
            </div>
            <div className="hero-tally" aria-hidden="true">
              <span>已收作业</span>
              <strong>{String(stats.submitted).padStart(2, "0")}</strong>
              <small>/ {stats.total} 位学生</small>
              <div className="tally-check"><Check size={14} /> 已登记</div>
            </div>
          </section>
          <div className="stat-grid">
            <button className="stat-item" onClick={() => setFilter("all")}>
              <span className="stat-icon pale-blue">
                <ScanLine size={21} />
              </span>
              <div>
                <span>已识别题目</span>
                <strong>
                  {stats.questions}
                  <small>道</small>
                </strong>
              </div>
            </button>
            <button className="stat-item" onClick={() => onReview()}>
              <span className="stat-icon pale-amber">
                <ClipboardCheck size={21} />
              </span>
              <div>
                <span>等你确认</span>
                <strong>
                  {stats.pending}
                  <small>道</small>
                </strong>
              </div>
              {stats.pending > 0 && <span className="stat-dot" />}
            </button>
            <button className="stat-item" onClick={() => setFilter("done")}>
              <span className="stat-icon pale-green">
                <CheckCheck size={22} />
              </span>
              <div>
                <span>已完成学生</span>
                <strong>
                  {data.students.filter((s) => s.status === "done").length}
                  <small>位</small>
                </strong>
              </div>
            </button>
          </div>
          <section className="panel student-panel">
            <div className="panel-title">
              <div>
                <h2>
                  今天的学生 <span className="count-label">{stats.total}</span>
                </h2>
                <p>选中学生，拍照就能开始。</p>
              </div>
              <button
                className="icon-button"
                title="添加学生"
                aria-label="添加学生"
                onClick={onAdd}
              >
                <Plus size={21} />
              </button>
            </div>
            <div className="list-tools">
              <div className="filter-tabs">
                {[
                  ["all", "全部"],
                  ["waiting", "待上传"],
                  ["review", "待确认"],
                  ["done", "已完成"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={filter === value ? "active" : ""}
                    onClick={() => setFilter(value)}
                  >
                    {label}
                    {value === "review" &&
                      data.students.some((s) => s.pending > 0) && <i />}
                  </button>
                ))}
              </div>
              <label className="class-select">
                <select
                  aria-label="筛选班级"
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                >
                  <option>全部班级</option>
                  {classes.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <ChevronDown size={14} />
              </label>
            </div>
            <div className="student-search">
              <Search size={17} />
              <input
                aria-label="搜索学生姓名"
                placeholder="搜索学生姓名"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <span>共 {students.length} 位</span>
            </div>
            <div className="table-head">
              <span>学生</span>
              <span>今日作业</span>
              <span>状态</span>
              <span>操作</span>
            </div>
            <div className="student-list">
              {students.map((s, i) => (
                <div key={s.id} className="student-row">
                  <button
                    className="student-identity"
                    onClick={() => onStudent(s)}
                  >
                    <Avatar name={s.name} index={i} />
                    <div>
                      <strong>{s.name}</strong>
                      <span>
                        {s.grade} 年级 <b>·</b> {s.class_name}
                      </span>
                    </div>
                  </button>
                  <div className="student-subjects">
                    {s.jobs.length ? (
                      [...new Set(s.jobs.map((j) => j.subject))].map((v) => (
                        <Subject key={v} value={v} />
                      ))
                    ) : (
                      <span className="muted-label">等待作业上传</span>
                    )}
                    <small>
                      {s.jobs.length ? `${s.jobs.length} 页作业` : ""}
                    </small>
                  </div>
                  <span className={`status ${statuses[s.status].className}`}>
                    <i />
                    {s.status === "review"
                      ? `${s.pending} 道待确认`
                      : statuses[s.status].label}
                  </span>
                  <div className="student-action">
                    {s.status === "review" ? (
                      <button
                        className="small-button amber-button"
                        onClick={() => onReview(s)}
                      >
                        去确认
                        <ArrowUpRight size={14} />
                      </button>
                    ) : s.status === "waiting" ? (
                      <button
                        className="small-button"
                        onClick={() => onUpload(s)}
                      >
                        <Camera size={15} />
                        拍作业
                      </button>
                    ) : (
                      <button
                        className="small-button quiet"
                        onClick={() => onStudent(s)}
                      >
                        查看
                        <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {!students.length && (
              <Empty
                title={stats.total ? "没有符合条件的学生" : "先把孩子们加进来"}
                description={
                  stats.total
                    ? "换个筛选条件试试。"
                    : "可以一次粘贴多个姓名，快速建立班级。"
                }
                action={
                  !stats.total ? (
                    <button className="button primary" onClick={onAdd}>
                      <Plus size={17} />
                      添加学生
                    </button>
                  ) : undefined
                }
              />
            )}
            <div className="list-footer">
              <span>
                <ShieldDot /> 作业自动保存，随时可以继续
              </span>
              <button onClick={onAdd}>
                <Plus size={14} /> 添加学生
              </button>
            </div>
          </section>
        </div>
        <aside className="dashboard-aside">
          <section className="panel attention-card">
            <div className="aside-heading">
              <span className="icon-tile pale-amber">
                <ClipboardCheck size={20} />
              </span>
              <span className="tiny-tag">优先处理</span>
            </div>
            <h3>
              {stats.pending
                ? `${stats.pending} 道题，等你看一眼`
                : "疑问题目，已经理清"}{" "}
            </h3>
            <p>
              {stats.pending
                ? "只需确认疑似错题和不确定的题目，其余自动整理。"
                : "新的作业批改完成后，需要确认的题目会出现在这里。"}
            </p>
            {data.students
              .filter((s) => s.pending)
              .slice(0, 3)
              .map((s, i) => (
                <button
                  className="attention-student"
                  key={s.id}
                  onClick={() => onReview(s)}
                >
                  <Avatar name={s.name} index={i} />
                  <span>
                    {s.name}
                    <small>{s.pending} 道待确认</small>
                  </span>
                  <ArrowRight size={16} />
                </button>
              ))}
            <button className="button primary full" onClick={() => onReview()}>
              集中确认 <ArrowRight size={17} />
            </button>
          </section>
          <section className="panel week-card">
            <div className="aside-heading">
              <span className="icon-tile pale-blue">
                <BookOpen size={20} />
              </span>
              <span className="mini-label">每周一份成长记录</span>
            </div>
            <h3>让进步，被家长看见</h3>
            <p>本周错题、薄弱知识点和巩固练习，一份报告清楚呈现。</p>
            <div className="week-paper">
              <div>
                <span>本周学情报告</span>
                <span className="paper-dot" />
              </div>
              <div className="mini-bars">
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              <span>语文 · 数学 · 英语</span>
            </div>
            <TextLink onClick={onReports}>查看本周报告</TextLink>
          </section>
          <div className="gentle-note">
            <span>✳</span>
            <p>
              错题不是终点，
              <br />
              是下一次进步的起点。
            </p>
            <small>陪伴的每一天，都算数。</small>
          </div>
        </aside>
      </div>
    </>
  );
}
function ShieldDot() {
  return <Check size={13} />;
}
