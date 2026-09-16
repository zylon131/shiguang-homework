import sharp from "sharp";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { gradePhoto } from "../server/model.js";
import { getKnowledgeCandidates, UNCLASSIFIED } from "../server/curriculum.js";
await fs.mkdir('test-results/curriculum-live',{recursive:true});
const cases=[
  {subject:"数学",grade:3,lines:["三年级数学作业","1. 305 + 217 = 522","2. 24 × 3 = 62"]},
  {subject:"英语",grade:3,lines:["Grade 3 English: Simple Present","1. She ____ books every day. (read / reads)","Student answer: read","2. They ____ football every day. (play / plays)","Student answer: play"]},
  {subject:"语文",grade:1,lines:["一年级语文作业：写出反义词","1. 大——小","2. 上——左"]},
];
const results=[];
for(const [index,item] of cases.entries()) {
  if(process.env.CHECK_SUBJECT && process.env.CHECK_SUBJECT!==item.subject) continue;
  const file=`test-results/curriculum-live/${index}.jpg`;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="620"><rect width="100%" height="100%" fill="white"/>${item.lines.map((line,i)=>`<text x="45" y="${85+i*95}" fill="black" font-family="Microsoft YaHei,Arial" font-size="35">${line}</text>`).join('')}</svg>`;
  await sharp(Buffer.from(svg)).jpeg().toFile(file);
  const start=Date.now();const result=await gradePhoto(file,item.subject,item.grade);
  const candidates=getKnowledgeCandidates(item.subject,item.grade);
  assert.equal(result.questions.length,2);
  assert.ok(result.questions.every(q=>candidates.includes(q.knowledge)),'in-scope synthetic questions should be classified within the provided list');
  assert.equal(result.questions.filter(q=>q.verdict==='wrong').length,1);
  results.push({subject:item.subject,grade:item.grade,candidates,questions:result.questions,seconds:(Date.now()-start)/1000});
  console.log(JSON.stringify({subject:item.subject,grade:item.grade,knowledge:result.questions.map(q=>q.knowledge),passed:true}));
}
await fs.writeFile(`test-results/curriculum-live/result${process.env.CHECK_SUBJECT?'-'+process.env.CHECK_SUBJECT:''}.json`,JSON.stringify({passed:true,createdAt:new Date().toISOString(),results},null,2));
