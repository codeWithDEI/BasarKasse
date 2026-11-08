import './bootstrap.mjs';
import next from 'next';
import {createServer} from 'node:http';
const host=process.env.HOSTNAME||'127.0.0.1';const port=Number(process.env.PORT||3000);
const app=next({dev:false,hostname:host,port});const handler=app.getRequestHandler();await app.prepare();
createServer((request,response)=>handler(request,response)).listen(port,host,()=>console.log(`Basarkasse startet auf http://${host}:${port} (Übungsbetrieb)`));
