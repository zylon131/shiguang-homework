import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const files=['dist','server','tag-data/math.ts','tag-data/english.ts','tag-data/chinese.ts','package.json','package-lock.json','deploy/Dockerfile.runtime','deploy/compose.production.yaml','deploy/nginx-production.conf','deploy/shiguang-cert-renew.service','deploy/shiguang-cert-renew.timer','scripts/backup.js'];
for(const file of files) await fs.access(file);
const result=spawnSync('tar',['-czf','deploy/release.tar.gz',...files],{stdio:'inherit'});
if(result.status!==0) process.exit(result.status||1);
console.log('Packaged explicit runtime files only; environment, local data and credentials excluded.');
