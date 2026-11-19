// Private setup cards contain one-use invitation secrets. Never publish or commit their output.
import {readFileSync,mkdirSync,writeFileSync,statSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {QRCodeSVG} from 'qrcode.react';
const [source,destination]=process.argv.slice(2);if(!source||!destination)throw new Error('Usage: node selfhost/device-cards.mjs PRIVATE-HANDOVER NEW-PRIVATE-DIRECTORY');
if((statSync(source).mode&0o077)!==0||existsSync(destination))throw new Error('Require a private handover and a new output directory.');
const handover=JSON.parse(readFileSync(source,'utf8'));mkdirSync(destination,{mode:0o700,recursive:true});
for(let i=0;i<handover.devices.length;i++){
 const d=handover.devices[i],card=React.createElement('html',{lang:'de'},React.createElement('head',null,React.createElement('meta',{charSet:'utf-8'}),React.createElement('title',null,'BasarKasse · '+d.label),React.createElement('style',null,'body{font:20px system-ui;margin:3rem;max-width:35rem}svg{width:320px;max-width:100%;height:auto}p{line-height:1.5}small{font-size:14px}')),React.createElement('body',null,React.createElement('h1',null,d.label),React.createElement('p',null,handover.event.name),React.createElement(QRCodeSVG,{value:d.enrolmentUrl,size:320,level:'M',marginSize:4}),React.createElement('p',null,'Mit dem vorgesehenen Tablet scannen und „Dieses Gerät freischalten“ wählen. Danach genügt an der Kasse die persönliche PIN. Die Kassenleitung verwendet ihr Passwort.'),React.createElement('p',null,React.createElement('a',{href:d.enrolmentUrl},'Gerät freischalten')),React.createElement('small',null,'Privater Einmalcode. Nur für das vorgesehene Gerät. Nicht weitergeben oder öffentlich aushängen.')));
 writeFileSync(join(destination,String(i).padStart(2,'0')+'-device.html'),'<!doctype html>'+renderToStaticMarkup(card),{flag:'wx',mode:0o600});
}
console.log('Private device setup cards generated; no PIN list exported.');
