import {createHash} from 'node:crypto';

// Identity includes the version shown to the user; never silently edit another row.
export function memoryIdentity(item){return createHash('sha256').update(JSON.stringify([item.text,item.category||'',item.createdAt||null,item.updatedAt||null])).digest('hex').slice(0,24);}
const normalized=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('de-DE').replace(/[.!?]+$/,'').replace(/\s+/g,' ').trim();
export function memoryReview(items=[]){
 const counts=new Map(),homes=new Set();
 for(const item of items){const text=normalized(item.text);counts.set(text,(counts.get(text)||0)+1);const home=text.match(/^(?:ich|du|der nutzer|die nutzerin) (?:wohne|wohnst|wohnt|lebe|lebst|lebt) in (.{2,80})$/);if(home)homes.add(home[1]);}
 return items.map(item=>{const text=normalized(item.text),review=[];if(counts.get(text)>1)review.push('Ähnlicher Eintrag mehrfach gespeichert');if(homes.size>1&&/^(?:ich|du|der nutzer|die nutzerin) (?:wohne|wohnst|wohnt|lebe|lebst|lebt) in .{2,80}$/.test(text))review.push('Möglicher Widerspruch beim Wohnort – bitte prüfen');return {...item,id:memoryIdentity(item),owner:'user',review};});
}
export function selectMemory(items,text,id){
 const matches=items.map((item,index)=>({item,index})).filter(x=>normalized(x.item.text)===normalized(text));
 const selected=id?matches.filter(x=>memoryIdentity(x.item)===id):matches;
 return selected.length===1?selected[0]:null;
}
