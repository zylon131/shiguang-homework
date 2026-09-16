import { useEffect, useRef, type ReactNode } from "react";
import {
  BookOpenCheck,
  X,
  LoaderCircle,
  Inbox,
  ArrowUpRight,
} from "lucide-react";
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? "small" : ""}`}>
      <span className="brand-mark">
        <BookOpenCheck size={small ? 21 : 25} />
      </span>
      <span>
        拾光<span className="brand-sub">托管错题本</span>
      </span>
    </div>
  );
}
export function Spinner() {
  return <LoaderCircle className="spin" size={18} />;
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Inbox size={30} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
  locked = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  locked?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose),
    lockedRef = useRef(locked);
  closeRef.current = onClose;
  lockedRef.current = locked;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    document.body.style.overflow = "hidden";
    const timer = setTimeout(
      () => {
        // A fast tap or autofill may already have placed focus inside the dialog.
        if (ref.current?.contains(document.activeElement)) return;
        ref.current
          ?.querySelector<HTMLElement>("button,input,select,textarea")
          ?.focus();
      },
      50,
    );
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !lockedRef.current) closeRef.current();
      if (e.key === "Tab") {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !locked) onClose();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            aria-label="关闭"
            onClick={onClose}
            disabled={locked}
          >
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Subject({ value }: { value: string }) {
  return (
    <span
      className={`subject subject-${value === "语文" ? "chinese" : value === "数学" ? "math" : "english"}`}
    >
      {value}
    </span>
  );
}
export function Avatar({ name, index = 0 }: { name: string; index?: number }) {
  return <span className={`avatar avatar-${index % 5}`}>{name.slice(-2)}</span>;
}
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {action}
    </div>
  );
}
export function TextLink({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="text-link" onClick={onClick}>
      {children}
      <ArrowUpRight size={15} />
    </button>
  );
}
