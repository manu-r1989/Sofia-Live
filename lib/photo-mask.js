import {deflateSync,inflateSync} from 'node:zlib';
function crc32(buf){let crc=0xffffffff;for(const byte of buf){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(name,body){const type=Buffer.from(name),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(body.length);crc.writeUInt32BE(crc32(Buffer.concat([type,body])));return Buffer.concat([size,type,body,crc]);}
export function pngDimensions(bytes){
 if(bytes.length<33||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.toString('ascii',12,16)!=='IHDR')throw Error('PNG-Ausgangsbild benötigt.');
 const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);if(!width||!height||width>1600||height>1600)throw Error('Bildmaße nicht unterstützt.');return {width,height};
}
export function regionMask(width,height,region){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>1600||height>1600)throw Error('Maskenmaße ungültig.');
 if(!region||['x','y','w','h'].some(k=>!Number.isFinite(region[k]))||region.x<0||region.y<0||region.w<=0||region.h<=0||region.x+region.w>1.000001||region.y+region.h>1.000001)throw Error('Bitte einen Bereich innerhalb des Fotos markieren.');
 const x=Math.floor(region.x*width),y=Math.floor(region.y*height),w=Math.ceil(region.w*width),h=Math.ceil(region.h*height);if(w<2||h<2)throw Error('Bereich ist zu klein.');
 const stride=width*4+1,raw=Buffer.alloc(stride*height);for(let row=0;row<height;row++)for(let col=0;col<width;col++){const offset=row*stride+1+col*4;raw[offset+3]=col>=x&&col<x+w&&row>=y&&row<y+h?0:255;}
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 return 'data:image/png;base64,'+Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]).toString('base64');
}
export function validateSelection(v){
 if(!v||!['natural','protect'].includes(v.mode)||!Array.isArray(v.regions)||!v.regions.length||v.regions.length>12||!Array.isArray(v.protect)||v.protect.length>12)throw Error('Bitte 1 bis 12 Änderungsbereiche und höchstens 12 Schutzbereiche wählen.');
 const rect=r=>{if(!r||['x','y','w','h'].some(k=>!Number.isFinite(r[k]))||r.x<0||r.y<0||r.w<=0||r.h<=0||r.x+r.w>1.000001||r.y+r.h>1.000001)throw Error('Bereich liegt außerhalb des Fotos.');return {x:r.x,y:r.y,w:r.w,h:r.h};};return {mode:v.mode,regions:v.regions.map(rect),protect:v.protect.map(rect)};
}
export function selectedPixel(x,y,width,height,v){
 const hit=r=>x>=Math.floor(r.x*width)&&x<Math.ceil((r.x+r.w)*width)&&y>=Math.floor(r.y*height)&&y<Math.ceil((r.y+r.h)*height);
 return v.regions.some(hit)&&!v.protect.some(hit);
}
export function encodePNG(width,height,pixels){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>1600||height>1600||pixels.length!==width*height*4)throw Error('PNG-Maße ungültig.');const stride=width*4+1,raw=Buffer.alloc(stride*height),buffer=Buffer.from(pixels);for(let y=0;y<height;y++)buffer.copy(raw,y*stride+1,y*width*4,(y+1)*width*4);
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
export function decodePNG(bytes){
 const {width,height}=pngDimensions(bytes);if(bytes[24]!==8||![2,6].includes(bytes[25])||bytes[28]!==0)throw Error('Bitte nicht verschachteltes RGB/RGBA-PNG mit 8 Bit verwenden.');const channels=bytes[25]===6?4:3,stride=width*channels,parts=[];let ended=false;
 for(let off=8;off+12<=bytes.length;){const n=bytes.readUInt32BE(off);if(n>bytes.length-off-12)throw Error('PNG beschädigt.');const type=bytes.toString('ascii',off+4,off+8),body=bytes.subarray(off+8,off+8+n);if(crc32(bytes.subarray(off+4,off+8+n))!==bytes.readUInt32BE(off+8+n))throw Error('PNG-Prüfsumme ungültig.');if(type==='IDAT')parts.push(body);if(type==='IEND'){ended=true;break;}off+=n+12;}
 if(!ended||!parts.length)throw Error('PNG unvollständig.');const raw=inflateSync(Buffer.concat(parts),{maxOutputLength:(stride+1)*height});if(raw.length!==(stride+1)*height)throw Error('PNG-Inhalt ungültig.');const unpacked=Buffer.alloc(stride*height),pixels=Buffer.alloc(width*height*4);
 const paeth=(a,b,c)=>{const p=a+b-c,aa=Math.abs(p-a),bb=Math.abs(p-b),cc=Math.abs(p-c);return aa<=bb&&aa<=cc?a:bb<=cc?b:c;};
 for(let y=0;y<height;y++){const filter=raw[y*(stride+1)];if(filter>4)throw Error('PNG-Filter ungültig.');for(let x=0;x<stride;x++){const i=y*stride+x,a=x>=channels?unpacked[i-channels]:0,b=y?unpacked[i-stride]:0,c=y&&x>=channels?unpacked[i-stride-channels]:0;unpacked[i]=(raw[y*(stride+1)+x+1]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255;}for(let x=0;x<width;x++){const from=y*stride+x*channels,to=(y*width+x)*4;unpacked.copy(pixels,to,from,from+3);pixels[to+3]=channels===4?unpacked[from+3]:255;}}
 return {width,height,pixels};
}
export function multiMask(width,height,input){
 const v=validateSelection(input);if(width>1600||height>1600||width<1||height<1)throw Error('Bildmaße ungültig.');const pixels=Buffer.alloc(width*height*4);let selected=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const hit=selectedPixel(x,y,width,height,v);if(hit)selected++;pixels[(y*width+x)*4+3]=hit?0:255;}if(selected<4)throw Error('Kein bearbeitbarer Bereich übrig.');return 'data:image/png;base64,'+encodePNG(width,height,pixels).toString('base64');
}
export function compositePNG(source,result,input){
 const v=validateSelection(input),a=decodePNG(source),b=decodePNG(result),out=Buffer.from(a.pixels);
 for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++)if(selectedPixel(x,y,a.width,a.height,v)){const bx=Math.min(b.width-1,Math.floor(x*b.width/a.width)),by=Math.min(b.height-1,Math.floor(y*b.height/a.height));b.pixels.copy(out,(y*a.width+x)*4,(by*b.width+bx)*4,(by*b.width+bx)*4+4);}
 return encodePNG(a.width,a.height,out);
}
