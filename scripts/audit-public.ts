import { readFileSync,readdirSync,statSync,existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join,relative } from 'node:path';
const git=(args:string[],input?:string):Buffer=>execFileSync('git',args,{input:input===undefined?undefined:Buffer.from(input,'utf8'),maxBuffer:32*1024*1024});
const ignored=new Set(['.git','node_modules','.cache','dist','test-results','playwright-report','coverage']);
function walk(dir:string):string[]{return readdirSync(dir,{withFileTypes:true}).flatMap(e=>ignored.has(e.name)?[]:e.isSymbolicLink()?(()=>{throw new Error('Symlink not allowed in public source');})():e.isDirectory()?walk(join(dir,e.name)):[relative('.',join(dir,e.name)).replaceAll('\\','/')]);}
const forbiddenPath=/(?:^|\/)(?:generated|sources|imports|backups)(?:\/|$)|(?:^|\/)masterdata\.lock\.json$|\.(?:zip|har|png|jpe?g|webp|mp4|wasm|exe|dll)$/i;
const token=/\bgh[pousr]_[A-Za-z0-9]{20,}\b/;
const legacy='/atsudori-'+'band-rating/';
function inspect(path:string,bytes:Buffer):void{
  if(forbiddenPath.test(path))throw new Error('Excluded path in public files: '+path);
  if(bytes.includes(0))throw new Error('Unexpected binary file: '+path);
  const text=bytes.toString('utf8');
  if(token.test(text))throw new Error('Credential pattern in '+path);
  if(text.includes(legacy))throw new Error('Old site path in '+path);
  if(path.startsWith('src/')&&/\b(?:fetch|WebSocket|XMLHttpRequest|atob)\s*\(/.test(text))throw new Error('Unexpected network/encoded-data API in '+path);
}
const working=walk('.');
for(const p of working)inspect(p,readFileSync(p));
if(!existsSync('.git'))throw new Error('Full Git checkout required for public history audit');
if(git(['rev-parse','--is-shallow-repository']).toString().trim()!=='false')throw new Error('Full Git history required; shallow checkout cannot be audited');
const commits=git(['rev-list','--all']).toString().trim().split('\n').filter(Boolean);
if(!commits.length)throw new Error('No Git commits available for public history audit');
let historical=0;
if(commits.length){
  const roots=git(['rev-list','--all','--max-parents=0']).toString().trim().split('\n').filter(Boolean);
  if(roots.length!==1)throw new Error('Expected one independent root history');
  const identities=git(['log','--all','--format=%ae%x00%cn%x00%ce']).toString().trim().split('\n');
  const userNoreply=(email:string)=>/^[0-9]+\+[A-Za-z0-9-]+@users\.noreply\.github\.com$/.test(email);
  if(identities.some(line=>{
    const [author,committerName,committer]=line.split('\0');
    // GitHub creates PR validation merges with its own official noreply committer.
    return !userNoreply(author!)||!(userNoreply(committer!)||(committerName==='GitHub'&&committer==='noreply@github.com'));
  }))throw new Error('Non-noreply commit identity');
  const entries=git(['rev-list','--objects','--all']).toString().trim().split('\n').map(l=>{const i=l.indexOf(' ');return {sha:i<0?l:l.slice(0,i),path:i<0?'':l.slice(i+1)};}).filter(e=>e.path);
  const batch=git(['cat-file','--batch'],entries.map(e=>e.sha).join('\n')+'\n');
  let offset=0;
  for(const entry of entries){
    const end=batch.indexOf(10,offset),header=batch.subarray(offset,end).toString().split(' '),size=Number(header[2]);
    const data=batch.subarray(end+1,end+1+size);offset=end+2+size;
    if(header[1]==='blob'){inspect(entry.path,data);historical++;}
  }
}
if(!existsSync('dist/index.html'))throw new Error('Run the static build before auditing');
function distFiles(dir:string):string[]{return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?distFiles(join(dir,e.name)):[join(dir,e.name)]);}
const dist=distFiles('dist');
for(const p of dist){
  if(statSync(p).size>2*1024*1024)throw new Error('Unexpectedly large static file');
  inspect(p,readFileSync(p));
  const text=readFileSync(p,'utf8');
  if(text.includes('テスト専用の紙飛行機')||text.includes('架空バンド・カッパ')||text.includes(legacy))throw new Error('Fixture or legacy content in static output');
}
console.log('Public audit passed: '+working.length+' working files, '+commits.length+' commits, '+historical+' historical blobs, '+dist.length+' static files. No external data was fetched. This guard supplements human content review.');
