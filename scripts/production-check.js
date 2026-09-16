import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomBytes, randomInt } from 'node:crypto';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { getKnowledgeCandidates } from '../server/curriculum.js';
const settings=dotenv.parse(await fs.readFile('.env.production'));
const origin=settings.APP_ORIGIN;
assert.equal(origin,'https://8.130.50.140');
const directory='test-results/production';
await fs.mkdir(directory,{recursive:true});
const fixtures=await fs.readFile(directory+'/fixtures.json','utf8').then(JSON.parse).catch(()=>[]);
async function req(route,{cookie,method='GET',body,form}={}) {
  const response=await fetch(origin+'/api'+route,{method,headers:{Origin:origin,'X-Requested-With':'shiguang',...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:form|| (body?JSON.stringify(body):undefined),signal:AbortSignal.timeout(20000)});
  return {status:response.status,data:response.headers.get('content-type')?.includes('application/json')?await response.json():null,cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};
}
async function register() {
  const orgName='部署验收-'+randomBytes(5).toString('hex');
  const response=await req('/auth/register',{method:'POST',body:{orgName,name:'验收老师',phone:'139'+String(randomInt(10000000,99999999)),password:randomBytes(18).toString('hex'),inviteCode:settings.PILOT_INVITE_CODE}});
  assert.equal(response.status,200);
  assert.match(response.headers.get('set-cookie'),/HttpOnly/);
  assert.match(response.headers.get('set-cookie'),/Secure/);
  const user=(await req('/me',{cookie:response.cookie})).data;
  fixtures.push({id:user.orgId,name:orgName});
  await fs.writeFile(directory+'/fixtures.json',JSON.stringify(fixtures));
  return response.cookie;
}
async function until(fn,label) {
  const start=Date.now();
  while(Date.now()-start<210000) {
    const value=await fn();if(value)return value;
    await new Promise(resolve=>setTimeout(resolve,1800));
  }
  throw Error('Timed out: '+label);
}
assert.deepEqual((await req('/health')).data,{ok:true});
assert.deepEqual((await req('/config')).data,{demo:false});
assert.equal((await req('/auth/demo',{method:'POST'})).status,404);
assert.equal((await req('/dashboard')).status,401);
const redirect=await fetch('http://8.130.50.140',{redirect:'manual'});
assert.equal(redirect.status,308);
assert.equal(redirect.headers.get('location'),'https://8.130.50.140/');
const a=await register(),b=await register();
for(const subject of ['数学','英语','语文']) for(let grade=1;grade<=6;grade++) {
  const catalog=(await req(`/curriculum?subject=${encodeURIComponent(subject)}&grade=${grade}`,{cookie:a})).data;
  assert.deepEqual(catalog.candidates,getKnowledgeCandidates(subject,grade));
}
const added=await req('/students',{cookie:a,method:'POST',body:{names:['合成作业验收'],grade:3,className:'验收班'}});
assert.equal(added.status,201);const studentId=added.data.ids[0];
assert.equal((await req(`/questions?studentId=${studentId}`,{cookie:b})).status,404);
const form=new FormData();form.append('studentId',studentId);form.append('subject','数学');form.append('idempotencyKey',randomBytes(16).toString('hex'));
form.append('photos',new Blob([await fs.readFile('test-results/curriculum-live/0.jpg')],{type:'image/jpeg'}),'synthetic-math.jpg');
const start=Date.now();
const upload=await req('/jobs',{cookie:a,method:'POST',form});assert.equal(upload.status,202);
const jobId=upload.data.ids[0];
assert.equal((await req(`/jobs/${jobId}/image`,{cookie:b})).status,404);
const questions=await until(async()=>{const r=await req(`/questions?status=all&studentId=${studentId}`,{cookie:a});return r.data.length===2?r.data:null;},'grade');
assert.ok(questions.every(q=>getKnowledgeCandidates('数学',3).includes(q.knowledge)));
const wrong=questions.find(q=>q.ai_verdict==='wrong');assert.ok(wrong);assert.equal(wrong.status,'pending');
assert.equal((await req(`/questions/${wrong.id}/review`,{cookie:a,method:'POST',body:{verdict:'wrong',knowledge:'随意命名'}})).status,400);
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.addCookies([{name:'sg_session',value:a.slice('sg_session='.length),url:origin,httpOnly:true,secure:true,sameSite:'Lax'}]);
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await page.getByRole('heading',{name:/今天辛苦了/}).waitFor();
  await page.screenshot({path:directory+'/mobile-dashboard.png',fullPage:true});
  await page.getByRole('button',{name:'去确认',exact:true}).click();
  await page.locator('.question-card').first().getByRole('button',{name:'修改识别'}).click();
  const select=page.getByRole('dialog').locator('select');await select.waitFor();
  await page.waitForFunction(()=>document.querySelector('select') && !document.querySelector('select').disabled);
  const options=await select.locator('option').allTextContents();
  assert.deepEqual(options,['待归类',...getKnowledgeCandidates('数学',3)]);
  await page.screenshot({path:directory+'/mobile-standard-knowledge.png',fullPage:true});
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.locator('.question-card').first().getByRole('button',{name:'确认错题',exact:true}).click();
  const practice=await until(async()=>{const r=await req(`/questions?status=wrong&studentId=${studentId}`,{cookie:a});if(r.data[0]?.practice_status==='failed')throw Error(r.data[0].practice_error);return r.data[0]?.practice.length===3?r.data[0]:null;},'practice');
  const week=(await req('/dashboard',{cookie:a})).data.week.start;
  const report=await req('/reports',{cookie:a,method:'POST',body:{studentId,weekStart:week}});
  assert.equal(report.data.content.wrong,1);assert.equal(report.data.content.total,2);
  assert.equal(report.data.content.unclassified,0);
  assert.deepEqual(report.data.content.knowledge,[{name:wrong.knowledge,count:1}]);
  assert.equal(report.data.content.exercises[0].items.length,3);
  const share=await req(`/reports/${report.data.id}/share`,{cookie:a,method:'POST'});
  const parent=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const parentPage=await parent.newPage();parentPage.on('pageerror',e=>errors.push(e.message));
  await parentPage.goto(origin+share.data.path);
  await parentPage.getByLabel('6 位访问码').fill(share.data.pin);
  await parentPage.getByRole('button',{name:'查看学习周报'}).click();
  await parentPage.getByRole('heading',{name:/的学习周报/}).waitFor();
  await parentPage.screenshot({path:directory+'/mobile-parent-report.png',fullPage:true});
  for(const width of [390,360]) {
    await parentPage.setViewportSize({width,height:844});
    assert.ok(await parentPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  assert.deepEqual(errors,[]);
  await req(`/reports/${report.data.id}/share`,{cookie:a,method:'DELETE'});
  assert.equal((await req('/public/reports/'+share.data.path.split('/').pop(),{method:'POST',body:{pin:share.data.pin}})).status,404);
  const result={passed:true,origin,createdAt:new Date().toISOString(),catalogs:18,tenantIsolation:true,secureCookies:true,realModel:true,questions:questions.length,knowledge:questions.map(q=>q.knowledge),practice:practice.practice.length,sharePinAndRevocation:true,mobileWidths:[390,360],browserErrors:errors,seconds:(Date.now()-start)/1000};
  await fs.writeFile(directory+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
} finally {await browser.close();}
