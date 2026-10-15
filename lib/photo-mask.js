import {deflateSync} from 'node:zlib';
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
