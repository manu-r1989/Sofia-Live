(() => {
 'use strict';
 function buildPDF(pages){
  if(!Array.isArray(pages)||!pages.length||pages.length>32)throw Error('PDF auf höchstens 32 Seiten begrenzen.');
  const encoder=new TextEncoder(),chunks=[],offsets=[0];let length=0,total=0;
  const push=x=>{const b=typeof x==='string'?encoder.encode(x):x;chunks.push(b);length+=b.length;};
  const object=(id,body)=>{offsets[id]=length;push(id+' 0 obj\n');body();push('\nendobj\n');};
  push('%PDF-1.4\n%Sofia photobook\n');object(1,()=>push('<< /Type /Catalog /Pages 2 0 R >>'));
  object(2,()=>push('<< /Type /Pages /Count '+pages.length+' /Kids ['+pages.map((_,i)=>(3+i*3)+' 0 R').join(' ')+'] >>'));
  for(const [i,page]of pages.entries()){
   if(!(page.bytes instanceof Uint8Array)||page.bytes[0]!==255||page.bytes[1]!==216||!Number.isInteger(page.width)||!Number.isInteger(page.height)||page.width<1||page.width>4000||page.height<1||page.height>4000)throw Error('Ungültige PDF-Bildseite.');
   total+=page.bytes.length;if(total>64*1024*1024)throw Error('PDF-Bilder zu groß.');const id=3+i*3,w=page.width>page.height?841.89:595.276,h=+(w*page.height/page.width).toFixed(3),stream='q\n'+w+' 0 0 '+h+' 0 0 cm\n/Photo Do\nQ\n';
   object(id,()=>push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+w+' '+h+'] /Resources << /XObject << /Photo '+(id+2)+' 0 R >> >> /Contents '+(id+1)+' 0 R >>'));
   object(id+1,()=>push('<< /Length '+encoder.encode(stream).length+' >>\nstream\n'+stream+'endstream'));
   object(id+2,()=>{push('<< /Type /XObject /Subtype /Image /Width '+page.width+' /Height '+page.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+page.bytes.length+' >>\nstream\n');push(page.bytes);push('\nendstream');});
  }
  const xref=length;push('xref\n0 '+offsets.length+'\n0000000000 65535 f \n');for(let i=1;i<offsets.length;i++)push(String(offsets[i]).padStart(10,'0')+' 00000 n \n');push('trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
  const result=new Uint8Array(length);let at=0;for(const chunk of chunks){result.set(chunk,at);at+=chunk.length;}return result;
 }
 function wrap(ctx,value,font,maxWidth){ctx.font=font;const out=[],segments=typeof Intl.Segmenter==='function'?new Intl.Segmenter('de',{granularity:'grapheme'}):null;for(const paragraph of String(value).split('\n')){let line='';for(const word of paragraph.split(/\s+/).filter(Boolean)){if(ctx.measureText(word).width>maxWidth){if(line){out.push(line);line='';}for(const {segment}of segments?segments.segment(word):Array.from(word).map(segment=>({segment}))){if(ctx.measureText(line+segment).width>maxWidth&&line){out.push(line);line='';}line+=segment;}}else if(line&&ctx.measureText(line+' '+word).width>maxWidth){out.push(line);line=word;}else line+=(line?' ':'')+word;}out.push(line);}return out;}
 function layout(book,ctx,options={}){
  if(!book.title?.trim()||!book.chapters?.length||book.chapters.length>8||book.chapters.some(c=>!c.title?.trim()||!c.imageId||c.text.length>1500))throw Error('Titel, Fotos und Kapiteltexte vor der Vorschau prüfen.');
  const [width,height]=options.layout==='landscape'?[1697,1200]:options.layout==='square'?[1200,1200]:[1200,1697],margin=72,bottom=height-100,plans=[];
  const page=(heading='')=>{const p={ops:[],width,height};if(heading)p.ops.push({kind:'text',text:heading,font:'26px system-ui',x:margin,y:64});plans.push(p);return p;};
  const line=(p,text,font,y,x=margin)=>p.ops.push({kind:'text',text,font,x,y});
  let current,y;
  const paragraph=(value,font='30px system-ui',leading=42,continuation='')=>{for(const text of wrap(ctx,value,font,width-margin*2)){if(y>bottom){current=page(continuation||book.title);y=136;}line(current,text,font,y);y+=leading;}};
  if(options.cover!==false){current=page();y=230;paragraph(book.title,'bold 58px system-ui',72,'Titelblatt (Fortsetzung)');y+=48;if(book.intro)paragraph(book.intro,'30px system-ui',42,'Einleitung (Fortsetzung)');}
  const toc=[];if(options.contents!==false){let p=page('Kapitelübersicht'),y=160;for(const [index,c]of book.chapters.entries()){const lines=wrap(ctx,(index+1)+'. '+c.title,'28px system-ui',width-margin*2-110),size=lines.length*40+28;if(y+size>bottom){p=page('Kapitelübersicht (Fortsetzung)');y=140;}toc.push({page:p,y,lines,index});y+=size;}}
  const starts=[];
  for(const [index,c]of book.chapters.entries()){
   current=page('Kapitel '+(index+1));starts.push(plans.length);y=140;paragraph(c.title,'bold 44px system-ui',56,'Kapitel '+(index+1)+' (Fortsetzung)');y+=20;const imageHeight=Math.max(160,Math.min(height*.46,bottom-y-100));current.ops.push({kind:'image',id:c.imageId,x:margin,y,width:width-margin*2,height:imageHeight});y+=imageHeight+56;if(c.text)paragraph(c.text,'30px system-ui',42,'Kapitel '+(index+1)+' (Fortsetzung)');
  }
  for(const item of toc){item.lines.forEach((t,i)=>line(item.page,t,'28px system-ui',item.y+i*40));line(item.page,String(starts[item.index]),'28px system-ui',item.y,width-margin-70);}
  if(plans.length>32)throw Error('Fotobuch ist länger als 32 Seiten. Kapiteltexte kürzen.');
  for(const [i,p]of plans.entries())line(p,(i+1)+' / '+plans.length,'22px system-ui',height-38,width-margin-130);
  return {pages:plans,chapterPages:starts};
 }
 async function open(book){
  const C=window.SofiaCompanion,d=C.panel('Fotobuch und PDF-Export'),p=C.node('p','Titelblatt, Kapitelübersicht und vollständige Bildtexte vor dem Export prüfen.');p.setAttribute('role','status');d.classList.add('features-dialog','workbench-dialog','studio-dialog','continuity-dialog');d.append(p);const checkbox=(label,on)=>{const row=C.node('label'),input=C.node('input');input.type='checkbox';input.checked=on;input.setAttribute('aria-label',label);row.append(input,C.node('span',label));d.append(row);return input;},cover=checkbox('Titelblatt mit Einleitung',true),contents=checkbox('Kapitelübersicht mit Seitenzahlen',true),format=C.field(d,'Format des Fotobuchs',book.layout||'portrait',[['portrait','A4 Hochformat'],['landscape','A4 Querformat'],['square','Quadratisch']]),preview=C.node('div');let generation=0,pages=[],urls=[];
  const clear=()=>{generation++;preview.replaceChildren();for(const url of urls)URL.revokeObjectURL(url);urls=[];pages=[];};for(const el of [cover,contents,format])el.addEventListener('change',clear);d.addEventListener('close',clear,{once:true});
  const button=(label,fn)=>{const b=C.node('button',label);b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){p.textContent=e.message;}finally{if(b.isConnected)b.disabled=false;}};return b;};
  d.append(C.node('p','Verwendet ausschließlich die ausgewählten vorhandenen Fotos. Der PDF-Export erzeugt keine KI-Bilder. Die PDF-Seiten enthalten Bild und Text als gerasterte Seiten; Text ist im PDF nicht auswählbar.'),button('Vollständige Buchvorschau erstellen',async()=>{clear();const v=generation,canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),plan=layout(book,ctx,{cover:cover.checked,contents:contents.checked,layout:format.value});let total=0;
   for(const [index,page]of plan.pages.entries()){
    if(!d.open||v!==generation)return;canvas.width=page.width;canvas.height=page.height;ctx.fillStyle='#10141c';ctx.fillRect(0,0,page.width,page.height);ctx.fillStyle='#f5eee4';
    for(const op of page.ops){if(op.kind==='text'){ctx.font=op.font;ctx.fillText(op.text,op.x,op.y);}else{const img=new Image();img.src='/api/chat?image='+encodeURIComponent(op.id);await img.decode();if(!d.open||v!==generation){img.src='';return;}const scale=Math.min(op.width/img.naturalWidth,op.height/img.naturalHeight),w=img.naturalWidth*scale,h=img.naturalHeight*scale;ctx.drawImage(img,op.x+(op.width-w)/2,op.y+(op.height-h)/2,w,h);img.src='';}}
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.92));if(!blob)throw Error('Eine Buchseite konnte nicht exportiert werden.');const bytes=new Uint8Array(await blob.arrayBuffer());total+=bytes.length;if(total>64*1024*1024)throw Error('Fotobuch ist zu groß.');if(!d.open||v!==generation)return;pages.push({width:page.width,height:page.height,bytes});const url=URL.createObjectURL(blob);urls.push(url);const image=C.node('img');image.src=url;image.alt='Fotobuchseite '+(index+1)+' von '+plan.pages.length;image.loading='lazy';image.className='book-preview-page';preview.append(C.node('h3','Seite '+(index+1)),image);p.textContent='Buchvorschau: Seite '+(index+1)+' von '+plan.pages.length+' erstellt.';
   }
   canvas.width=canvas.height=1;preview.append(button('Diese vollständige Vorschau als PDF vorbereiten',()=>{if(!pages.length)throw Error('Zuerst Buchvorschau erstellen.');const blob=new Blob([buildPDF(pages)],{type:'application/pdf'}),url=URL.createObjectURL(blob);urls.push(url);const a=C.node('a','Fotobuch als PDF herunterladen');a.href=url;a.download='sofia-fotobuch.pdf';a.className='message-source-link';preview.append(a);p.textContent='PDF aus genau diesen '+pages.length+' Vorschauseiten vorbereitet. Zum Speichern den Downloadlink wählen.';}));p.textContent=pages.length+' vollständige Buchseiten. Kapitel beginnen auf Seite '+plan.chapterPages.join(', ')+'. Vor dem Download alle Seiten prüfen.';
  }),preview);return d;
 }
 window.SofiaBook={open,buildPDF,layout};
})();
