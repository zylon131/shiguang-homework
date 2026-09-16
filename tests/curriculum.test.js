import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { MATH_CURRICULUM } from "../tag-data/math.ts";
import { ENGLISH_CURRICULUM } from "../tag-data/english.ts";
import { CHINESE_CURRICULUM } from "../tag-data/chinese.ts";
import { getKnowledgeCandidates, canonicalKnowledge, isAllowedKnowledge, isStandardKnowledge, buildKnowledgePrompt, UNCLASSIFIED } from "../server/curriculum.js";
import { enforceKnowledgeCatalog, gradePhoto } from "../server/model.js";
import { config } from "../server/config.js";

test("all eighteen primary grade/subject catalogs exactly match the provided leaf tags", () => {
  const names=["一年级","二年级","三年级","四年级","五年级","六年级"];
  names.forEach((name,index) => {
    const expectedMath=[...new Set(MATH_CURRICULUM[name].flatMap(c=>c.sections.flatMap(s=>s.tags)))];
    const expectedEnglish=[...new Set(ENGLISH_CURRICULUM[name].flatMap(c=>c.tags))];
    assert.deepEqual(getKnowledgeCandidates("数学",index+1),expectedMath);
    assert.deepEqual(getKnowledgeCandidates("英语",index+1),expectedEnglish);
    assert.deepEqual(getKnowledgeCandidates("语文",index+1),[...new Set(CHINESE_CURRICULUM[name].flatMap(c=>c.tags))]);
    assert.ok(expectedMath.length && expectedEnglish.length);
  });
});
test("do not mix grade levels, chapter headings or secondary curriculum", () => {
  assert.ok(getKnowledgeCandidates("数学",2).includes("表内乘法"));
  assert.ok(!getKnowledgeCandidates("数学",3).includes("表内乘法"));
  assert.ok(!getKnowledgeCandidates("数学",3).includes("大数认知"));
  assert.ok(getKnowledgeCandidates("英语",1).includes("Be动词"));
  assert.ok(!getKnowledgeCandidates("英语",1).includes("状语从句"));
  assert.deepEqual(getKnowledgeCandidates("数学",7),[]);
  assert.deepEqual(getKnowledgeCandidates("数学","三年级"),[]);
  assert.ok(getKnowledgeCandidates("语文",1).includes("声母认读与书写"));
  assert.deepEqual(getKnowledgeCandidates("语文",7),[]);
  assert.match(buildKnowledgePrompt("未提供科目",3),/固定为「待归类」/);
});
test("no fuzzy remapping or free labels; valid historical primary tags stay recognizable", () => {
  assert.equal(canonicalKnowledge("数学",3," 三位数加减法 "),"三位数加减法");
  assert.equal(canonicalKnowledge("数学",3,"三位数加减法与运算粗心"),UNCLASSIFIED);
  assert.equal(canonicalKnowledge("数学",3,"表内乘法"),UNCLASSIFIED);
  assert.equal(isAllowedKnowledge("数学",3,"自定义标签"),false);
  assert.equal(isStandardKnowledge("数学","表内乘法"),true);
  assert.equal(isStandardKnowledge("英语",UNCLASSIFIED),false);
  const result=enforceKnowledgeCatalog({questions:[{knowledge:"多位数乘一位数",verdict:"wrong"},{knowledge:"乘法口诀：七八五十六",verdict:"correct"}]},"数学",3);
  assert.equal(result.questions[0].knowledge,"多位数乘一位数");
  assert.equal(result.questions[1].knowledge,UNCLASSIFIED);
  assert.equal(result.questions[1].verdict,"correct","taxonomy uncertainty must not mark a correct answer wrong");
});
test("actual gradePhoto injects the selected list and blocks fabricated model labels", async () => {
  const original=globalThis.fetch;
  const originalKey=config.apiKey;
  config.apiKey="mocked-test-key";
  const file=path.resolve(`test-results/curriculum-${randomUUID()}.jpg`);
  await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,Buffer.from('synthetic-image-for-mocked-request'));
  const requests=[];
  globalThis.fetch=async (url,options)=>{
    requests.push(JSON.parse(options.body));
    return new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:JSON.stringify({questions:[{number:"1",text:"题目",studentAnswer:"答案",correctAnswer:"答案",explanation:"解析",knowledge:requests.length===1?"Be动词":"自由创造的知识点",verdict:"correct",confidence:0.99}]})}}]}),{status:200,headers:{"Content-Type":"application/json"}});
  };
  try {
    const valid=await gradePhoto(file,"英语",1);
    const invalid=await gradePhoto(file,"数学",3);
    assert.equal(valid.questions[0].knowledge,"Be动词");
    assert.equal(invalid.questions[0].knowledge,UNCLASSIFIED);
    assert.ok(requests[0].messages[0].content.includes(JSON.stringify(getKnowledgeCandidates("英语",1))));
    assert.ok(requests[1].messages[0].content.includes(JSON.stringify(getKnowledgeCandidates("数学",3))));
    assert.ok(!requests[0].messages[0].content.includes('"一般过去时was/were"'));
  } finally { globalThis.fetch=original;config.apiKey=originalKey;await fs.unlink(file); }
});
