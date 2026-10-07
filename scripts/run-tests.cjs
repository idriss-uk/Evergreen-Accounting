'use strict';
const fs=require('node:fs'),{execFileSync}=require('node:child_process');
for(const name of fs.readdirSync('tests').filter(name=>name.endsWith('.test.cjs')&&!name.includes('browser'))){execFileSync(process.execPath,['tests/'+name],{stdio:'inherit'});}
