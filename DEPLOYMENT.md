# 公网部署记录

部署日期：2026-09-15。唯一目标 ECS：`i-0jlexqnwipw5e4vl4lhi`，公网 IP `8.130.50.140`。通过 Workbench CLI 显式指定该实例完成操作。

## 使用入口

- 地址：**https://8.130.50.140**，HTTP 自动跳转 HTTPS。
- 机构管理员在登录页选择「开通试用」，使用本机 `deploy/ACCESS.local.txt` 中的邀请码注册自己的机构，再邀请老师。
- 生产没有体验入口或预设用户账号。验收使用独立临时机构与合成题图，不导入旧系统账号、学生、作业或代码。
- 公网链接可以分享给家长，需同时提供报告的 6 位访问码。尚未使用实体手机/微信内置浏览器完成验收。

## 运行位置

| 项目 | 值 |
| --- | --- |
| 发布目录 | `/opt/shiguang/releases/studio-20260915` |
| Compose | 发布目录下 `deploy/compose.production.yaml`，项目名 `shiguang` |
| 容器 / 镜像 | `shiguang-app` / `shiguang:studio-20260915` |
| 应用端口 | 仅监听宿主机 `127.0.0.1:8787`，由 nginx 代理 |
| 持久数据 | `/opt/shiguang/shared/data`（SQLite 与上传照片） |
| 私密配置 | `/opt/shiguang/shared/production.env`，权限 600；父目录权限 700 |
| nginx | `/etc/nginx/conf.d/shiguang.conf` |
| 本机配置副本 | `.env.production`，不得提交、展示或打入镜像 |

前端在本机编译，仅将 dist、server、三科大纲和运行依赖清单上传封装镜像。Node 24 使用原生 SQLite 与 TypeScript 类型剥离导入大纲。容器以非 root 用户运行、限制 512 MB 内存和 1 CPU、并发模型任务 2 个、日志轮转 10 MB × 3、自动重启和健康检查。

原有服务和域名路由保留；新增 IP 精确匹配路由指向新项目。没有读取旧项目源代码或复用旧数据。

## HTTPS

使用可信的 Let's Encrypt IP 证书，证书路径 `/etc/letsencrypt/live/shiguang-ip/`。IP 证书为短期证书，首张到期日期 2026-09-21。

已安装隔离的 Certbot 5.8.0：`/opt/shiguang-tools/certbot/bin/certbot`。`shiguang-cert-renew.timer` 每天 03:00 和 15:00 加随机延迟检查续期；成功后验证 nginx 配置并重载。ACME webroot 位于 `/var/www/shiguang-acme`，nginx 的 HTTP challenge 路径必须保留。已通过 `renew --dry-run --run-deploy-hooks --no-random-sleep-on-renew` 演练。

## 运维

下列 Linux 命令只能通过 Workbench 对该服务器执行，例如：

```powershell
workbench exec -i i-0jlexqnwipw5e4vl4lhi -c 'docker ps --filter name=shiguang-app'
workbench exec -i i-0jlexqnwipw5e4vl4lhi -c 'docker logs --tail 50 shiguang-app'
workbench exec -i i-0jlexqnwipw5e4vl4lhi -c 'systemctl list-timers shiguang-cert-renew.timer --no-pager'
```

数据备份：`docker exec shiguang-app node scripts/backup.js` 可生成一致数据库快照并复制照片至数据目录的 `backups/`。完整停写快照应在维护窗口停止 app 后，用同一 Compose 的一次性容器运行该脚本再启动。备份应另存到独立存储；目前未配置异地备份或备份计划。

更新时在新 release 目录上传 `deploy/package-release.js` 生成的白名单文件包，构建新镜像；复用 shared 数据，保留上一镜像供回退。不要将生产 env 或数据库包含在包中。

本次路由回退：把 `/opt/shiguang/nginx-acme.conf` 安装回 `/etc/nginx/conf.d/shiguang.conf` 后执行 `nginx -t && systemctl reload nginx`，恢复原 IP HTTP 应用代理；保留新项目数据和证书。现有域名配置在 `/etc/nginx/conf.d/starmodel.conf`，无需更改。

## 验收数据清理

`scripts/production-check.js` 将临时机构的精确 ID 和名称保存在本机 `test-results/production/fixtures.json`。`deploy/cleanup-smoke.js` 仅清理清单中名称以「部署验收-」开头且 ID、名称同时匹配的机构；若后台任务未结束则拒绝清理。将脚本放到容器 `/app/scripts/cleanup-smoke.js`、清单放到 `/tmp/shiguang-fixtures.json` 后执行：

```sh
docker exec shiguang-app node scripts/cleanup-smoke.js /tmp/shiguang-fixtures.json
```

脚本只清理该应用上传目录内的合成照片，最后运行数据库完整性检查。不要使用清空数据库或删除 shared 目录的方式清理测试数据。

本次已清理 6 个临时验收机构和 3 张合成照片，完整性检查为 `ok`。首份备份位于 `/opt/shiguang/shared/data/backups/2026-09-15T08-13-13-959Z`。公网完整流程、18 份候选列表及手机页面检查已通过，详情见 `VERIFICATION.md`。

2026-09-15 视觉改版：上线墨蓝 / 白 / 橙色主题，重新设计登录页、作业进度、移动导航和报告封面；复用现有持久数据。更新前备份为 `backups/2026-09-15T08-24-59-452Z`。前一版本镜像 `shiguang:curriculum-20260915` 和对应 release 目录保留，可用前一份 Compose 回退应用。

## 规模边界

当前是具备多机构隔离的单实例试用部署。扩大机构量时需迁移 PostgreSQL、对象存储及有任务租约的队列，并完善配额、计费和运营监控；不能启动多个 worker 副本共享当前队列。模型和手机操作的真实整班耗时仍需实际机构作业评测。
