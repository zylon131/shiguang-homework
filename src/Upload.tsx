import { useRef, useState, useEffect } from "react";
import {
  Camera,
  Images,
  Plus,
  X,
  Check,
  ArrowRight,
  CloudUpload,
} from "lucide-react";
import type { Student } from "./types";
import { Modal, Spinner } from "./ui";
import { uploadPhotos } from "./api";
type Photo = { file: File; url: string };
function uuid() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}
async function compress(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2200 / bitmap.width, 3000 / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, "image/jpeg", 0.88),
    );
    return blob
      ? new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
          type: "image/jpeg",
        })
      : file;
  } catch {
    return file;
  }
}
export default function Upload({
  students,
  initial,
  onClose,
  onComplete,
}: {
  students: Student[];
  initial?: Student;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [sid, setSid] = useState(
      initial?.id ||
        students.find((s) => s.status === "waiting")?.id ||
        students[0]?.id ||
        "",
    ),
    [subject, setSubject] = useState("数学"),
    [photos, setPhotos] = useState<Photo[]>([]),
    [busy, setBusy] = useState(false),
    [preparing, setPreparing] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    [success, setSuccess] = useState<{ name: string; count: number } | null>(
      null,
    );
  const camera = useRef<HTMLInputElement>(null),
    gallery = useRef<HTMLInputElement>(null),
    key = useRef(uuid()),
    photosRef = useRef<Photo[]>([]);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(
    () => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)),
    [],
  );
  async function add(files: FileList | null) {
    if (!files) return;
    setPreparing(true);
    setError("");
    const list = Array.from(files);
    if (list.length + photos.length > 12) {
      setError("一次最多 12 张照片，请分批上传");
      setPreparing(false);
      return;
    }
    if (list.some((f) => f.size > 12 * 1024 * 1024)) {
      setError("单张照片不能超过 12 MB");
      setPreparing(false);
      return;
    }
    try {
      const result = await Promise.all(
        list.map(async (f) => {
          const file = await compress(f);
          return { file, url: URL.createObjectURL(file) };
        }),
      );
      setPhotos((p) => [...p, ...result]);
      key.current = uuid();
    } catch {
      setError("照片读取失败，请重试");
    } finally {
      setPreparing(false);
      if (camera.current) camera.current.value = "";
      if (gallery.current) gallery.current.value = "";
    }
  }
  async function submit() {
    if (!photos.length || !sid) return;
    setBusy(true);
    setError("");
    setProgress(0);
    try {
      const form = new FormData();
      form.append("studentId", sid);
      form.append("subject", subject);
      form.append("idempotencyKey", key.current);
      photos.forEach((p) => form.append("photos", p.file));
      await uploadPhotos(form, setProgress);
      setSuccess({
        name: students.find((s) => s.id === sid)!.name,
        count: photos.length,
      });
      photos.forEach((p) => URL.revokeObjectURL(p.url));
      setPhotos([]);
      key.current = uuid();
      onComplete();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function next() {
    const i = students.findIndex((s) => s.id === sid);
    setSid(students[(i + 1) % students.length]?.id || "");
    setSuccess(null);
    setProgress(0);
  }
  return (
    <Modal
      title="拍下作业，继续陪伴"
      subtitle="一次选好学生和科目，就能连续添加多页作业。"
      onClose={onClose}
      locked={busy || preparing}
    >
      {success ? (
        <div className="upload-success">
          <span>
            <Check size={34} />
          </span>
          <h3>
            {success.name}的 {success.count} 页作业已收到
          </h3>
          <p>
            后台正在批改，你可以继续上传下一位。
            <br />
            需要确认的题目会自动汇总到工作台。
          </p>
          <button className="button primary full" onClick={next}>
            继续下一位 <ArrowRight size={18} />
          </button>
          <button
            className="button secondary full"
            style={{ marginTop: 10 }}
            onClick={() => {
              setSuccess(null);
              setSubject(
                ["语文", "数学", "英语"][
                  (["语文", "数学", "英语"].indexOf(subject) + 1) % 3
                ],
              );
            }}
          >
            继续上传这位学生的其他科目
          </button>
          <button className="button text full" onClick={onClose}>
            回到工作台
          </button>
        </div>
      ) : (
        <>
          <div className="upload-fields">
            <label>
              这是谁的作业？
              <select
                value={sid}
                onChange={(e) => {
                  setSid(e.target.value);
                  key.current = uuid();
                }}
                disabled={busy}
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.grade} 年级 · {s.class_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              作业科目
              <div className="subject-selector">
                {["语文", "数学", "英语"].map((s) => (
                  <button
                    disabled={busy}
                    className={subject === s ? "active" : ""}
                    key={s}
                    onClick={() => {
                      setSubject(s);
                      key.current = uuid();
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </label>
          </div>
          <input
            hidden
            ref={camera}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => add(e.target.files)}
          />
          <input
            hidden
            ref={gallery}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => add(e.target.files)}
          />
          {photos.length ? (
            <div className="photo-grid">
              {photos.map((p, i) => (
                <div className="photo-preview" key={p.url}>
                  <img src={p.url} alt={`第 ${i + 1} 页作业`} />
                  <span>第 {i + 1} 页</span>
                  <button
                    aria-label={`移除第 ${i + 1} 页`}
                    disabled={busy}
                    onClick={() => {
                      URL.revokeObjectURL(p.url);
                      setPhotos((ps) => ps.filter((x) => x !== p));
                      key.current = uuid();
                    }}
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
              {photos.length < 12 && (
                <button
                  className="add-photo"
                  onClick={() => camera.current?.click()}
                  disabled={busy || preparing}
                >
                  <Plus size={24} />
                  <span>继续拍照</span>
                </button>
              )}
            </div>
          ) : (
            <div className="upload-target">
              <span className="camera-circle">
                <Camera size={32} />
              </span>
              <h3>拍清整页，题目不要切掉</h3>
              <p>铺平作业，光线明亮，避开手指和阴影。</p>
              <button
                className="button primary"
                onClick={() => camera.current?.click()}
                disabled={preparing}
              >
                <Camera size={18} />
                打开相机
              </button>
            </div>
          )}
          <button
            className="button secondary full"
            onClick={() => gallery.current?.click()}
            disabled={busy || preparing}
          >
            {preparing ? <Spinner /> : <Images size={18} />}从相册批量选择
            {photos.length ? ` · 已选 ${photos.length} 张` : ""}
          </button>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {busy && (
            <div className="upload-progress">
              <div>
                <i style={{ width: `${progress}%` }} />
              </div>
              <span>
                {progress === 100
                  ? "上传完成，正在保存…"
                  : `正在上传 ${progress}%`}
              </span>
            </div>
          )}
          <div className="modal-footer">
            <p className="fine-print">
              照片安全保存到本机构，并发送至 MiniMax 识别。
            </p>
            <button
              className="button primary full"
              disabled={!sid || !photos.length || busy || preparing}
              onClick={submit}
            >
              {busy ? <Spinner /> : <CloudUpload size={19} />}{" "}
              {busy
                ? "请保持页面打开"
                : photos.length
                  ? `提交 ${photos.length} 页，开始批改`
                  : "添加照片后开始批改"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
