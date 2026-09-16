import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { db } from '../server/db.js';
import { config } from '../server/config.js';
const fixtures=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
const files=[];
db.transaction(()=>{
  for(const fixture of fixtures) {
    assert.ok(fixture.name.startsWith('部署验收-'));
    const org=db.prepare('SELECT * FROM organizations WHERE id=?').get(fixture.id);
    if(!org)continue;
    assert.equal(org.name,fixture.name);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM jobs WHERE org_id=? AND status IN ('queued','processing')").get(org.id).n,0,'Wait for grading to finish before cleanup');
    assert.equal(db.prepare("SELECT COUNT(*) n FROM practice_tasks t JOIN questions q ON q.id=t.question_id WHERE q.org_id=? AND t.status IN ('queued','processing')").get(org.id).n,0,'Wait for practice generation to finish');
    files.push(...db.prepare('SELECT image_path FROM jobs WHERE org_id=?').all(org.id).map(j=>j.image_path).filter(Boolean));
    db.prepare('DELETE FROM practice_tasks WHERE question_id IN (SELECT id FROM questions WHERE org_id=?)').run(org.id);
    for(const table of ['practices','questions','jobs','reports','students','invitations','audit_events'])db.prepare(`DELETE FROM ${table} WHERE org_id=?`).run(org.id);
    db.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE org_id=?)').run(org.id);
    db.prepare('DELETE FROM users WHERE org_id=?').run(org.id);
    db.prepare('DELETE FROM organizations WHERE id=?').run(org.id);
  }
})();
for(const file of files) {
  const resolved=path.resolve(config.dataDir,'uploads',file),allowed=path.resolve(config.dataDir,'uploads')+path.sep;
  assert.ok(resolved.startsWith(allowed),'Only synthetic upload files inside this application may be removed');
  await fs.unlink(resolved).catch(error=>{if(error.code!=='ENOENT')throw error;});
}
console.log(JSON.stringify({removedTestOrganizations:fixtures.length,removedSyntheticPhotos:files.length,integrity:db.prepare('PRAGMA integrity_check').get().integrity_check}));
db.close();
