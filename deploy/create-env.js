import fs from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { config } from "../server/config.js";
const target = new URL("../.env.production", import.meta.url);
try { await fs.access(target); console.log("Production configuration already exists; retained."); }
catch {
  const invite=randomBytes(24).toString("hex");
  const values={NODE_ENV:"production",PORT:"8787",HOST:"0.0.0.0",APP_ORIGIN:"https://8.130.50.140",MINIMAX_API_KEY:config.apiKey,MINIMAX_BASE_URL:config.baseUrl,MINIMAX_MODEL:config.model,PILOT_INVITE_CODE:invite,ENABLE_DEMO:"false",MODEL_CONCURRENCY:"2",TRUST_PROXY:"1"};
  if(!config.apiKey) throw new Error("MiniMax configuration is missing");
  await fs.writeFile(target,Object.entries(values).map(([key,value])=>`${key}=${JSON.stringify(value)}`).join('\n')+'\n',{mode:0o600,flag:'wx'});
  await fs.writeFile(new URL("./ACCESS.local.txt",import.meta.url),`拾光机构试用入口：https://8.130.50.140\n机构开通邀请码：${invite}\n在登录页选择“开通试用”，填写自己的手机号、密码和机构信息。\n本文件不包含模型密钥，请只将邀请码提供给受邀机构。\n`,{mode:0o600,flag:'wx'});
  console.log("Created private production configuration and deploy/ACCESS.local.txt; no credentials printed.");
}
