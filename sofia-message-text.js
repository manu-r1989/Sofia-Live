(() => {
 'use strict';
 function readable(value) {
  const original=String(value??''),s=original.trim(),match=/^(?:```(?:json)?\s*)?\{\s*"reply"\s*:\s*"/i.exec(s);
  try {const obj=JSON.parse(s.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));if(typeof obj.reply==='string')return {text:obj.reply,incomplete:false};}catch{}
  if(!match)return {text:original,incomplete:false};
  let token='';
  for(let i=match[0].length;i<s.length;i++){
   const c=s[i];if(c==='"')break;
   if(c==='\\'){
    const next=s[i+1];if(!next)break;
    if(next==='u'){const digits=s.slice(i+2,i+6);if(!/^[\da-f]{4}$/i.test(digits))break;token+='\\u'+digits;i+=5;}
    else if(/["\\/bfnrt]/.test(next)){token+=c+next;i++;}else break;
   }else if(c.charCodeAt(0)<32)break;else token+=c;
  }
  try{return {text:JSON.parse('"'+token+'"'),incomplete:true};}catch{return {text:'Die damalige Antwort konnte nicht vollständig gelesen werden.',incomplete:true};}
 }
 function safeLink(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u:null;}catch{return null;}}
 function render(node,value){
  const result=readable(value),body=document.createElement('span');body.className='message-body';
  const pattern=/\[([^\]\n]{1,200})\]\((https?:\/\/[^\s<>]+?)\)|\*\*([^*\n]+)\*\*|(https?:\/\/[^\s<>]+)/g;
  let start=0;
  for(const m of result.text.matchAll(pattern)){
   body.append(document.createTextNode(result.text.slice(start,m.index)));
   if(m[3]){const strong=document.createElement('strong');strong.textContent=m[3];body.append(strong);}
   else{let url=m[2]||m[4],tail='';if(m[4]){const end=/[.,;:!?)\]}]+$/.exec(url);if(end){tail=end[0];url=url.slice(0,-tail.length);}}
    const parsed=safeLink(url);if(parsed){const a=document.createElement('a');a.href=parsed.href;a.textContent=m[1]||parsed.hostname.replace(/^www\./,'');a.target='_blank';a.rel='noopener noreferrer';a.title=parsed.href;body.append(a,document.createTextNode(tail));}else body.append(document.createTextNode(m[0]));}
   start=m.index+m[0].length;
  }
  body.append(document.createTextNode(result.text.slice(start)));node.replaceChildren(body);
  if(result.incomplete){const hint=document.createElement('span');hint.className='message-integrity-note';hint.textContent='Diese frühere Antwort ist unvollständig. Der fehlende Schluss ist nicht gespeichert.';node.append(hint);}
 }
 window.SofiaMessageText={readable,render};
})();
