import { useCallback, useEffect, useState, useRef } from "react";
import {
  LayoutDashboard,
  BookOpen,
  FileBarChart,
  Users,
  Settings as SettingsIcon,
  Camera,
  ChevronRight,
  ChevronDown,
  Check,
  WifiOff,
  X,
  LogOut,
  ClipboardCheck,
} from "lucide-react";
import { api, post } from "./api";
import type {
  Dashboard as DashboardData,
  Question,
  Report,
  Student,
  TeamMember,
  User,
} from "./types";
import { Avatar, Logo, Spinner } from "./ui";
import Auth from "./Auth";
import Dashboard from "./Dashboard";
import Upload from "./Upload";
import Questions from "./Questions";
import Reports, { PublicReport } from "./Reports";
import { Settings, Students, StudentForm, StudentDetail } from "./Students";
type Page =
  | "dashboard"
  | "audit"
  | "review"
  | "mistakes"
  | "reports"
  | "students"
  | "settings";
const nav = [
  { id: "dashboard" as Page, label: "工作台", icon: LayoutDashboard },
  { id: "mistakes" as Page, label: "错题本", icon: BookOpen },
  { id: "reports" as Page, label: "学情周报", icon: FileBarChart },
  { id: "students" as Page, label: "我的学生", icon: Users },
];
export default function App() {
  const publicToken = location.pathname.startsWith("/r/")
    ? location.pathname.split("/")[2]
    : null;
  const [user, setUser] = useState<User | null>(null),
    [initializing, setInitializing] = useState(true),
    [data, setData] = useState<DashboardData | null>(null),
    [questions, setQuestions] = useState<Question[]>([]),
    [reports, setReports] = useState<Report[]>([]),
    [team, setTeam] = useState<TeamMember[]>([]),
    [page, setPage] = useState<Page>("dashboard"),
    [studentFilter, setStudentFilter] = useState(""),
    [upload, setUpload] = useState<{ student?: Student } | null>(null),
    [form, setForm] = useState<{ student?: Student } | null>(null),
    [detail, setDetail] = useState<Student | null>(null),
    [toast, setToast] = useState(""),
    [online, setOnline] = useState(navigator.onLine),
    [loadError, setLoadError] = useState("");
  const requestVersion = useRef(0);
  const notify = useCallback((s: string) => setToast(s), []);
  const login = useCallback(async () => {
    requestVersion.current++;
    setData(null);
    try {
      setUser(await api<User>("/me"));
      setPage("dashboard");
    } catch {
      setUser(null);
    } finally {
      setInitializing(false);
    }
  }, []);
  useEffect(() => {
    if (!publicToken) login();
    else setInitializing(false);
  }, [login, publicToken]);
  useEffect(() => {
    const expired = () => {
      requestVersion.current++;
      setUser(null);
      setData(null);
      setUpload(null);
      setDetail(null);
      setForm(null);
      setQuestions([]);
      setReports([]);
      setTeam([]);
      setToast("登录已过期，请重新登录");
    };
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  const refresh = useCallback(async () => {
    if (!user) return;
    const version = ++requestVersion.current;
    const [d, q, r, t] = await Promise.all([
      api<DashboardData>("/dashboard"),
      page === "audit" && studentFilter
        ? api<Question[]>(`/questions?status=all&studentId=${studentFilter}`)
        : Promise.all([
            api<Question[]>("/questions?status=pending"),
            api<Question[]>("/questions?status=wrong"),
          ]).then(([pending, wrong]) => [...pending, ...wrong]),
      api<Report[]>("/reports"),
      user.role === "admin" ? api<TeamMember[]>("/team") : Promise.resolve([]),
    ]);
    if (version !== requestVersion.current) return;
    setData(d);
    setQuestions(q);
    setReports(r);
    setTeam(t);
    setLoadError("");
  }, [user, page, studentFilter]);
  useEffect(() => {
    if (!user) return;
    refresh().catch((e) => setLoadError(e.message));
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        refresh().catch((e) => setLoadError(e.message));
    }, 5000);
    return () => clearInterval(timer);
  }, [user, refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const up = () => setOnline(true),
      down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  function navigate(p: Page) {
    setPage(p);
    setStudentFilter("");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function onUpload(student?: Student) {
    if (!data?.students.length) {
      setForm({});
      notify("先添加学生，就可以拍作业了");
      return;
    }
    setUpload({ student });
  }
  function review(student?: Student) {
    setStudentFilter(student?.id || "");
    setPage("review");
    setDetail(null);
    window.scrollTo(0, 0);
  }
  async function logout() {
    try {
      await post("/auth/logout");
      requestVersion.current++;
      setUser(null);
      setData(null);
      setQuestions([]);
      setReports([]);
      setTeam([]);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  if (publicToken) return <PublicReport token={publicToken} />;
  if (initializing)
    return (
      <div className="app-loading">
        <Logo />
        <Spinner />
        <p>正在打开你的工作台…</p>
      </div>
    );
  if (!user) return <Auth onLogin={login} />;
  const pageLabel =
    page === "audit"
      ? "逐题批改"
      : page === "review"
        ? "集中确认"
        : page === "settings"
          ? "机构设置"
          : nav.find((n) => n.id === page)?.label;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Logo />
        <button className="org-switch" onClick={() => navigate("settings")}>
          <span className="org-avatar">{user.orgName.slice(0, 1)}</span>
          <span>
            <strong>{user.orgName.split(" · ")[0]}</strong>
            <small>
              {user.role === "admin" ? "机构管理空间" : "老师工作空间"}
            </small>
          </span>
          <ChevronDown size={15} />
        </button>
        <span className="nav-caption">日常工作</span>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={
                page === n.id || (n.id === "dashboard" && page === "review")
                  ? "active"
                  : ""
              }
              onClick={() => navigate(n.id)}
            >
              <n.icon size={20} />
              <span>{n.label}</span>
              {n.id === "dashboard" && !!data?.stats.pending && (
                <b>{data.stats.pending}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <BookOpen size={22} />
            <strong>少一点忙碌，多一点陪伴。</strong>
            <p>
              把琐碎交给工具，
              <br />
              把关注留给孩子。
            </p>
          </div>
          <button
            className={`settings-link ${page === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
          >
            <SettingsIcon size={19} />
            机构设置
          </button>
          <div className="user-profile">
            <Avatar name={user.name} />
            <div>
              <strong>{user.name}</strong>
              <small>{user.role === "admin" ? "机构管理员" : "托管老师"}</small>
            </div>
            <button
              className="icon-button"
              aria-label="退出登录"
              onClick={logout}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>老师工作空间</span>
            <ChevronRight size={14} />
            <strong>{pageLabel}</strong>
          </div>
          <div className="mobile-brand">
            <Logo small />
          </div>
          <div className="topbar-right">
            <span className="autosave">
              <i />
              {online ? "记录自动保存" : "离线中"}
            </span>
            <button
              className="topbar-user"
              onClick={() => navigate("settings")}
            >
              <Avatar name={user.name} />
              <span>{user.name}</span>
            </button>
          </div>
        </header>
        {user.demo && (
          <div className="demo-banner">
            <span>
              <span className="demo-pill">体验空间</span>
              学生和作业为虚构示例；上传照片会调用真实模型。
            </span>
            <button onClick={logout}>
              创建我的机构
              <ChevronRight size={14} />
            </button>
          </div>
        )}
        {(!online || loadError) && (
          <div className="offline-banner">
            <WifiOff size={17} />
            {!online
              ? "网络已断开，请联网后继续；未提交照片会保留在当前页面。"
              : loadError}
            <button onClick={() => refresh().catch((e) => notify(e.message))}>
              重试
            </button>
          </div>
        )}
        <main className={`main-content page-${page}`}>
          {!data ? (
            <div className="app-loading">
              <Spinner />
              <p>{loadError || "正在整理你的工作台…"}</p>
            </div>
          ) : (
            <>
              {page === "dashboard" && (
                <Dashboard
                  data={data}
                  user={user}
                  onUpload={onUpload}
                  onReview={review}
                  onReports={() => navigate("reports")}
                  onStudent={setDetail}
                  onAdd={() => setForm({})}
                />
              )}
              {(page === "review" ||
                page === "mistakes" ||
                page === "audit") && (
                <Questions
                  mode={
                    page === "audit"
                      ? "audit"
                      : page === "review"
                        ? "review"
                        : "mistakes"
                  }
                  questions={
                    page === "audit"
                      ? questions.filter((q) => q.student_id === studentFilter)
                      : questions.filter(
                          (q) =>
                            q.status ===
                            (page === "review" ? "pending" : "wrong"),
                        )
                  }
                  students={data.students}
                  studentId={studentFilter}
                  onStudentChange={setStudentFilter}
                  onRefresh={refresh}
                  notify={notify}
                  onBack={() => navigate("dashboard")}
                />
              )}
              {page === "reports" && (
                <Reports
                  students={data.students}
                  reports={reports}
                  week={data.week}
                  orgName={user.orgName}
                  demo={user.demo}
                  onRefresh={refresh}
                  notify={notify}
                />
              )}
              {page === "students" && (
                <Students
                  students={data.students}
                  onAdd={() => setForm({})}
                  onSelect={setDetail}
                />
              )}
              {page === "settings" && (
                <Settings
                  user={user}
                  team={team}
                  configured={data.model.configured}
                  onLogout={logout}
                  notify={notify}
                />
              )}
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>拾光 · 让每一点进步有迹可循</span>
          <span>为托管老师而设计</span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="手机导航">
        <button
          className={page === "dashboard" || page === "review" ? "active" : ""}
          onClick={() => navigate("dashboard")}
        >
          <LayoutDashboard size={21} />
          <span>工作台</span>
          {!!data?.stats.pending && <i />}
        </button>
        <button
          className={page === "mistakes" ? "active" : ""}
          onClick={() => navigate("mistakes")}
        >
          <BookOpen size={21} />
          <span>错题本</span>
        </button>
        <button className="mobile-capture" onClick={() => onUpload()}>
          <span>
            <Camera size={25} />
          </span>
          <b>拍作业</b>
        </button>
        <button
          className={page === "reports" ? "active" : ""}
          onClick={() => navigate("reports")}
        >
          <FileBarChart size={21} />
          <span>周报</span>
        </button>
        <button
          className={page === "students" ? "active" : ""}
          onClick={() => navigate("students")}
        >
          <Users size={21} />
          <span>学生</span>
        </button>
      </nav>
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            <X size={17} />
          </button>
        </div>
      )}
      {upload && data && (
        <Upload
          students={data.students}
          initial={upload.student}
          onClose={() => setUpload(null)}
          onComplete={() => {
            refresh().catch((e) => notify(e.message));
          }}
        />
      )}
      {form && (
        <StudentForm
          student={form.student}
          user={user}
          team={team}
          onClose={() => setForm(null)}
          onSaved={refresh}
          notify={notify}
        />
      )}
      {detail && data && (
        <StudentDetail
          student={data.students.find((s) => s.id === detail.id) || detail}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setForm({ student: detail });
            setDetail(null);
          }}
          onUpload={() => {
            onUpload(detail);
            setDetail(null);
          }}
          onReview={() => review(detail)}
          onAll={() => {
            setStudentFilter(detail.id);
            setPage("audit");
            setDetail(null);
          }}
          onMistakes={() => {
            setStudentFilter(detail.id);
            setPage("mistakes");
            setDetail(null);
          }}
          notify={notify}
          onRefresh={refresh}
        />
      )}
    </div>
  );
}
