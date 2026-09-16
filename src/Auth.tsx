import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Check, Camera, Sparkles, ShieldCheck } from "lucide-react";
import { api, post } from "./api";
import { Logo, Spinner } from "./ui";
export default function Auth({ onLogin }: { onLogin: () => void }) {
  const join = location.pathname.startsWith("/join/")
    ? location.pathname.split("/")[2]
    : null;
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [demo, setDemo] = useState(false),
    [invite, setInvite] = useState("");
  useEffect(() => {
    api("/config")
      .then((c) => {
        setDemo(c.demo);
        setInvite(c.localInvite || "");
      })
      .catch(() => setError("服务暂时无法连接，请稍后刷新"));
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await post(
        join ? "/auth/join" : register ? "/auth/register" : "/auth/login",
        { ...data, ...(join ? { token: join } : {}) },
      );
      if (join) history.replaceState(null, "", "/");
      onLogin();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function enterDemo() {
    setBusy(true);
    setError("");
    try {
      await post("/auth/demo");
      onLogin();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-story">
        <Logo />
        <div className="auth-story-content">
          <span className="eyebrow">拍照 · 确认 · 整理 · 分享</span>
          <h1>
            作业收齐。
            <br />
            错题理清。
          </h1>
          <p>
            少一些重复整理，
            <br />
            多一些陪孩子弄懂的时间。
          </p>
          <div className="paper-illustration">
            <div className="paper-top">
              <span>今天，也进步了一点</span>
              <Check size={20} />
            </div>
            <div className="paper-lines">
              <i />
              <i />
              <i />
            </div>
            <div className="paper-equation">
              24 × 3 ={" "}
              <span>
                72
                <svg viewBox="0 0 80 45">
                  <ellipse cx="40" cy="22" rx="36" ry="19" />
                </svg>
              </span>
            </div>
            <div className="paper-sticker">
              <Sparkles size={17} /> 学会一道，再练三道
            </div>
          </div>
          <div className="auth-features">
            <span>
              <Camera size={18} /> 手机拍照
            </span>
            <span>
              <Check size={18} /> 集中确认
            </span>
            <span>
              <ShieldCheck size={18} /> 机构独立空间
            </span>
          </div>
        </div>
        <small>拾光 SHIGUANG · 每一份认真，都值得被看见</small>
      </div>
      <div className="auth-form-side">
        <div className="auth-mobile-logo">
          <Logo />
          <div className="auth-mobile-intro"><span>老师的作业工作台</span><h1>作业收齐。<br /><em>错题理清。</em></h1></div>
        </div>
        <div className="auth-form">
          <span className="mini-label">老师工作台</span>
          <h2>
            {join ? "加入你的托管团队" : register ? "开启机构试用" : "欢迎回来"}
          </h2>
          <p>
            {join
              ? "使用管理员发来的邀请，创建老师账号。"
              : register
                ? "建立自己的空间，邀请老师一起工作。"
                : "今天的作业，一起轻松理清。"}
          </p>
          <form onSubmit={submit}>
            {(register || join) && (
              <label>
                老师称呼
                <input
                  name="name"
                  autoComplete="name"
                  placeholder="例如：林老师"
                  required
                  maxLength={40}
                />
              </label>
            )}
            {register && !join && (
              <label>
                机构名称
                <input
                  name="orgName"
                  placeholder="例如：向阳托管"
                  required
                  maxLength={40}
                />
              </label>
            )}
            <label>
              手机号
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="username"
                placeholder="请输入手机号"
                required
                pattern="1[3-9][0-9]{9}"
              />
            </label>
            <label>
              密码
              <input
                name="password"
                type="password"
                minLength={register || join ? 8 : 1}
                maxLength={72}
                autoComplete={
                  register || join ? "new-password" : "current-password"
                }
                placeholder={
                  register || join ? "设置至少 8 位密码" : "请输入密码"
                }
                required
              />
            </label>
            {register && !join && (
              <label>
                试用邀请码
                <input
                  name="inviteCode"
                  value={invite}
                  onChange={(e) => setInvite(e.target.value)}
                  placeholder="请输入机构试用邀请码"
                  required
                />
              </label>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy ? (
                <Spinner />
              ) : (
                <>
                  {join ? "加入团队" : register ? "创建机构" : "进入工作台"}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
          {!join && (
            <p className="auth-switch">
              {register ? "已有账号？" : "受邀机构首次使用？"}
              <button
                onClick={() => {
                  setRegister(!register);
                  setError("");
                }}
              >
                {register ? "去登录" : "开通试用"}
              </button>
            </p>
          )}
          {demo && !join && (
            <>
              <div className="or-divider">
                <span>想先看看使用体验</span>
              </div>
              <button
                className="button secondary full"
                onClick={enterDemo}
                disabled={busy}
              >
                体验老师工作台 <ArrowRight size={17} />
              </button>
              <p className="fine-print">
                独立体验空间 · 内含虚构学生和示例作业
              </p>
            </>
          )}
          <p className="auth-privacy">
            作业照片会发送至 MiniMax
            进行识别。请在取得相应授权后上传，尽量避开姓名和其他个人信息。
          </p>
        </div>
      </div>
    </div>
  );
}
