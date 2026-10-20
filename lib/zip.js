import {localizedError} from './i18n.js';
const encoder=new TextEncoder();
const table=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1 ? 0xedb88320^(n>>>1) : n>>>1;return n>>>0;});
export function crc32(bytes) {let crc=0xffffffff;for(const b of bytes)crc=table[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function header(size){const bytes=new Uint8Array(size);return {bytes,view:new DataView(bytes.buffer)};}
export async function zip(files) {
  const parts=[],central=[];let offset=0,count=0;
  for await(const file of files) {
    const name=encoder.encode(file.name),data=typeof file.data==='string' ? encoder.encode(file.data):file.data;
    if(data.length>0xffffffff || offset+data.length>0xffffffff || name.length>65535 || count>=65535) throw localizedError('error.zipCapacity');
    const crc=crc32(data),local=header(30),dir=header(46);
    const l=local.view,d=dir.view;
    l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);l.setUint16(12,0x21,true);
    l.setUint32(14,crc,true);l.setUint32(18,data.length,true);l.setUint32(22,data.length,true);l.setUint16(26,name.length,true);
    d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint16(14,0x21,true);
    d.setUint32(16,crc,true);d.setUint32(20,data.length,true);d.setUint32(24,data.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);
    parts.push(local.bytes,name,data);central.push(dir.bytes,name);offset+=30+name.length+data.length;count++;
  }
  const centralSize=central.reduce((n,b)=>n+b.length,0),end=header(22);
  if(offset+centralSize>0xffffffff) throw localizedError('error.zipLarge');
  end.view.setUint32(0,0x06054b50,true);end.view.setUint16(8,count,true);end.view.setUint16(10,count,true);end.view.setUint32(12,centralSize,true);end.view.setUint32(16,offset,true);
  return new Blob([...parts,...central,end.bytes],{type:'application/zip'});
}
