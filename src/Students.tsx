import { useEffect, useState, type FormEvent } from "react";
import {
  Plus,
  Search,
  Users,
  UserPlus,
  Copy,
  ShieldCheck,
  LogOut,
  Camera,
  ArrowRight,
  PenLine,
  RefreshCw,
} from "lucide-react";
import type { Student, TeamMember, User } from "./types";
import { api, post, copy } from "./api";
import { Avatar, Empty, Modal, PageTitle, Spinner, Subject } from "./ui";
import { statuses } from "./Dashboard";
export function StudentForm({
  student,
  user,
  team,
  onClose,
  onSaved,
  notify,
}: {
  student?: Student;
  user: User;
  team: TeamMember[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError("");
    try {
      if (student)
        await api(`/students/${student.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ...data, grade: Number(data.grade) }),
        });
      else
        await post("/students", {
          ...data,
          names: String(data.names)
            .split(/[\n,，、]+/)
            .map((x) => x.trim())
            .filter(Boolean),
          grade: Number(data.grade),
        });
      await onSaved();
      notify(student ? "学生信息已更新" : "学生已添加，可以开始拍作业了");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={student ? "编辑学生" : "把孩子们加进来"}
      subtitle={
        student
          ? "更新信息，或为学生分配负责老师。"
          : "支持一次添加多个姓名，不用逐个填写。"
      }
      onClose={onClose}
      locked={busy}
    >
      <form className="form-stack" onSubmit={submit}>
        {student ? (
          <label>
            学生姓名
            <input
              name="name"
              defaultValue={student.name}
              maxLength={40}
              required
            />
          </label>
        ) : (
          <label>
            学生姓名
            <textarea
              name="names"
              rows={4}
              placeholder={"陈一诺\n林子轩\n王沐辰"}
              required
            />
            <small>每行一位，也可以用逗号分隔；每次最多 60 位。</small>
          </label>
        )}
        <div className="two-fields">
          <label>
            年级
            <select name="grade" defaultValue={student?.grade || 3}>
              {[1, 2, 3, 4, 5, 6].map((g) => (
                <option key={g} value={g}>
                  {g} 年级
                </option>
              ))}
            </select>
          </label>
          <label>
            班级
            <input
              name="className"
              defaultValue={student?.class_name || "晚托一班"}
              required
              maxLength={40}
            />
          </label>
        </div>
        <label>
          负责老师
          <select
            name="teacherId"
            defaultValue={student?.teacher_id || user.id}
          >
            {(user.role === "admin" && team.length
              ? team
              : [{ id: user.id, name: user.name }]
            ).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy ? <Spinner /> : <Plus size={17} />}{" "}
          {student ? "保存修改" : "添加学生"}
        </button>
      </form>
    </Modal>
  );
}
export function Students({
  students,
  onAdd,
  onSelect,
}: {
  students: Student[];
  onAdd: () => void;
  onSelect: (s: Student) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = students.filter((s) =>
    `${s.name}${s.class_name}${s.teacher_name}`.includes(search),
  );
  return (
    <>
      <PageTitle
        eyebrow="MY STUDENTS · 认真照顾每一个"
        title="每个孩子，都有自己的成长页"
        description="按学生记录作业、跟进错题，让每天的陪伴更有方向。"
        action={
          <button className="button primary" onClick={onAdd}>
            <Plus size={18} />
            添加学生
          </button>
        }
      />
      <label className="search-field student-page-search">
        <Search size={18} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索学生、班级或负责老师"
        />
      </label>
      <div className="students-grid">
        {filtered.map((s, i) => (
          <button
            className="panel student-card"
            key={s.id}
            onClick={() => onSelect(s)}
          >
            <div className="question-head">
              <Avatar name={s.name} index={i} />
              <ArrowRight size={18} />
            </div>
            <h3>{s.name}</h3>
            <p>
              {s.grade} 年级 · {s.class_name}
            </p>
            <div className="student-card-stats">
              <span>
                <b>{s.wrong}</b> 道错题
              </span>
              <span>
                <b>{s.pending}</b> 道待确认
              </span>
            </div>
            <footer>
              {s.teacher_name}
              <span className={`status ${statuses[s.status].className}`}>
                {statuses[s.status].label}
              </span>
            </footer>
          </button>
        ))}
      </div>
      {!filtered.length && (
        <div className="panel">
          <Empty
            title="还没有学生"
            description="粘贴学生名单，几步就能建好你的班级。"
            action={
              <button className="button primary" onClick={onAdd}>
                添加学生
              </button>
            }
          />
        </div>
      )}
    </>
  );
}
export function StudentDetail({
  student: s,
  onClose,
  onEdit,
  onUpload,
  onReview,
  onAll,
  onMistakes,
  notify,
  onRefresh,
}: {
  student: Student;
  onClose: () => void;
  onEdit: () => void;
  onUpload: () => void;
  onReview: () => void;
  onAll: () => void;
  onMistakes: () => void;
  notify: (s: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState("");
  return (
    <Modal
      title={s.name}
      subtitle={`${s.grade} 年级 · ${s.class_name} · ${s.teacher_name}负责`}
      onClose={onClose}
    >
      <div className="student-detail">
        <div className="detail-actions">
          <button onClick={onReview}>
            <strong>{s.pending}</strong>
            <span>
              待确认题目
              <ArrowRight size={14} />
            </span>
          </button>
          <button onClick={onMistakes}>
            <strong>{s.wrong}</strong>
            <span>
              已归档错题
              <ArrowRight size={14} />
            </span>
          </button>
        </div>
        <h3>今天的作业</h3>
        {s.jobs.length ? (
          s.jobs.map((j) => (
            <div className="job-row" key={j.id}>
              <Subject value={j.subject} />
              <div>
                <strong>
                  {j.status === "done"
                    ? "识别完成"
                    : j.status === "failed"
                      ? "批改未完成"
                      : j.status === "processing"
                        ? "正在识别…"
                        : "排队中…"}
                </strong>
                <small>
                  {j.error ||
                    new Date(j.created_at).toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                </small>
              </div>
              {j.status === "failed" && (
                <button
                  className="icon-button"
                  aria-label="重试批改"
                  disabled={busy === j.id}
                  onClick={async () => {
                    setBusy(j.id);
                    try {
                      await post(`/jobs/${j.id}/retry`);
                      await onRefresh();
                      notify("已重新加入批改队列");
                    } catch (e) {
                      notify((e as Error).message);
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  <RefreshCw size={17} />
                </button>
              )}
            </div>
          ))
        ) : (
          <p className="muted-label">今天还没有上传作业。</p>
        )}
        <button className="button primary full" onClick={onUpload}>
          <Camera size={18} />
          继续拍作业
        </button>
        <button
          className="button secondary full"
          style={{ marginTop: 10 }}
          onClick={onAll}
        >
          查看逐题批改记录
          <ArrowRight size={16} />
        </button>
        <button className="button text full" onClick={onEdit}>
          <PenLine size={15} />
          编辑学生信息
        </button>
      </div>
    </Modal>
  );
}
export function Settings({
  user,
  team,
  configured,
  onLogout,
  notify,
}: {
  user: User;
  team: TeamMember[];
  configured: boolean;
  onLogout: () => void;
  notify: (s: string) => void;
}) {
  const [link, setLink] = useState(""),
    [busy, setBusy] = useState(false);
  async function invite() {
    setBusy(true);
    try {
      const r = await post("/team/invite");
      setLink(`${location.origin}${r.path}`);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="OUR SPACE · 机构空间"
        title={user.orgName}
        description="老师协作有分工，每一份学生记录都有自己的归属。"
      />
      <div className="settings-grid">
        <section className="panel settings-panel">
          <h2>
            <ShieldCheck size={21} />
            机构与账号
          </h2>
          <dl>
            <div>
              <dt>我的称呼</dt>
              <dd>{user.name}</dd>
            </div>
            <div>
              <dt>账号角色</dt>
              <dd>{user.role === "admin" ? "机构管理员" : "老师"}</dd>
            </div>
            <div>
              <dt>空间类型</dt>
              <dd>{user.demo ? "独立体验空间" : "机构试用空间"}</dd>
            </div>
            <div>
              <dt>智能批改</dt>
              <dd>
                <span className={`status ${configured ? "green" : "amber"}`}>
                  {configured ? "MiniMax 已配置" : "等待配置 MiniMax"}
                </span>
              </dd>
            </div>
          </dl>
          <p className="notice">
            本机构的数据独立保存。普通老师仅可查看分配给自己的学生，管理员可统筹本机构全部学生。
          </p>
          <button className="button secondary" onClick={onLogout}>
            <LogOut size={16} />
            退出登录
          </button>
        </section>
        {user.role === "admin" && (
          <section className="panel settings-panel">
            <div className="section-inline">
              <h2>
                <Users size={21} />
                老师团队
              </h2>
              <button className="small-button" onClick={invite} disabled={busy}>
                {busy ? <Spinner /> : <UserPlus size={16} />}邀请老师
              </button>
            </div>
            {team.map((t, i) => (
              <div className="team-row" key={t.id}>
                <Avatar name={t.name} index={i} />
                <div>
                  <strong>{t.name}</strong>
                  <small>
                    {t.role === "admin" ? "机构管理员" : "老师"} · 负责{" "}
                    {t.student_count} 位学生
                  </small>
                </div>
              </div>
            ))}
            {link && (
              <div className="share-result">
                <strong>一次性邀请，3 天内有效</strong>
                <div className="share-url">{link}</div>
                <button
                  className="button primary full"
                  onClick={() =>
                    copy(link)
                      .then(() => notify("邀请链接已复制，发给老师即可加入"))
                      .catch((e) => notify(e.message))
                  }
                >
                  <Copy size={16} />
                  复制邀请链接
                </button>
              </div>
            )}
            <p className="fine-print">
              老师加入后，可在「学生 → 编辑学生信息」中分配学生。
            </p>
          </section>
        )}
      </div>
    </>
  );
}
