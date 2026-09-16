export async function api<T = any>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${url}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "shiguang",
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !url.startsWith("/auth") && url !== "/me")
      window.dispatchEvent(new Event("session-expired"));
    throw new Error(data.error || "网络请求失败");
  }
  return data;
}
export const post = <T = any>(url: string, body: unknown = {}) =>
  api<T>(url, { method: "POST", body: JSON.stringify(body) });
export function uploadPhotos(
  body: FormData,
  onProgress: (n: number) => void,
): Promise<{ ids: string[] }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/jobs");
    xhr.setRequestHeader("X-Requested-With", "shiguang");
    xhr.timeout = 120000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        xhr.status >= 200 && xhr.status < 300
          ? resolve(data)
          : reject(new Error(data.error || "上传失败"));
      } catch {
        reject(new Error("上传响应异常，请重试"));
      }
    };
    xhr.onerror = () => reject(new Error("网络中断，照片已保留，请重试"));
    xhr.ontimeout = () => reject(new Error("上传超时，照片已保留，请重试"));
    xhr.send(body);
  });
}
export const dateLabel = (date: string) =>
  new Date(date).toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Shanghai",
  });
export async function copy(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      /* HTTP LAN fallback */
    }
  }
  const el = document.createElement("textarea");
  el.value = text;
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.select();
  const ok = document.execCommand("copy");
  el.remove();
  if (!ok) throw new Error("请长按下方链接手动复制");
}
