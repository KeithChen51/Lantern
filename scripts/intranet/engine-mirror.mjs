import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root='/app/deploy/offline/engines';
http.createServer((req,res)=>{
  if(req.url==='/health'){res.end('ready');return;}
  const p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
  if(!p.startsWith(root+'/')||!fs.existsSync(p)||!fs.statSync(p).isFile()){res.writeHead(404);res.end('Offline engine not bundled');return;}
  res.setHeader('Content-Length',fs.statSync(p).size);
  if(req.method==='HEAD'){res.end();return;}
  fs.createReadStream(p).pipe(res);
}).listen(18766,'127.0.0.1',()=>console.log('Offline Prisma mirror ready'));
