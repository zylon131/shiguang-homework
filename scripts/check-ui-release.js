import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin='https://8.130.50.140';
const html=await fs.readFile('dist/index.html','utf8');
const expected=html.match(/\/assets\/index-[^" ]+\.css/)[0];
const live=await fetch(origin).then(r=>r.text());
assert.ok(live.includes(expected),'The public origin must serve this exact release');
assert.deepEqual(await fetch(origin+'/api/health').then(r=>r.json()),{ok:true});
assert.deepEqual(await fetch(origin+'/api/config').then(r=>r.json()),{demo:false});
await fs.mkdir('test-results/studio',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const errors=[];
  for(const width of [1440,390,360]) {
    const page=await browser.newPage({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500});
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin);
    await page.getByRole('heading',{name:'欢迎回来'}).waitFor();
    assert.equal(await page.locator('.brand-mark').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(237, 116, 63)');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.equal(await page.getByRole('button',{name:'体验老师工作台'}).count(),0);
    await page.screenshot({path:`test-results/studio/public-login-${width}.png`,fullPage:true});
    await page.getByRole('button',{name:'开通试用',exact:true}).click();
    await page.getByRole('heading',{name:'开启机构试用'}).waitFor();
    assert.ok(await page.getByRole('button',{name:'创建机构',exact:true}).isEnabled());
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.close();
  }
  assert.deepEqual(errors,[]);
  const result={passed:true,origin,asset:expected,widths:[1440,390,360],productionDemoDisabled:true,registrationForm:true,browserErrors:errors,checkedAt:new Date().toISOString()};
  await fs.writeFile('test-results/studio/result.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
} finally {await browser.close();}
