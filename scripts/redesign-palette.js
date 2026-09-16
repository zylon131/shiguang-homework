import fs from 'node:fs/promises';
// Migrate the original green/olive palette in both existing style layers.
for(const file of ['src/styles.css','src/refinements.css']) {
  let css=await fs.readFile(file,'utf8');
  css=css.replace(/--green-dark/g,'--brand-dark').replace(/--green/g,'--brand');
  css=css.replace(/#[0-9a-f]{6}(?:[0-9a-f]{2})?\b/gi,hex=>{
    const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
    const max=Math.max(...rgb),min=Math.min(...rgb),delta=max-min,l=(max+min)/2;
    let h=delta===0?0:max===rgb[0]?((rgb[1]-rgb[2])/delta)%6:max===rgb[1]?(rgb[2]-rgb[0])/delta+2:(rgb[0]-rgb[1])/delta+4;
    h=(h*60+360)%360;
    if(h<45||h>190||delta<0.012)return hex;
    const replacement=l<.25?'#192944':l<.4?'#304566':l<.73?'#65738b':l<.87?'#bdc7d7':l<.94?'#e1e6ee':'#f3f5f8';
    return replacement+hex.slice(7);
  });
  await fs.writeFile(file,css);
}
for(const file of ['index.html','public/favicon.svg']) {
  const text=await fs.readFile(file,'utf8');
  await fs.writeFile(file,text.replaceAll('#245c4f','#192944'));
}
