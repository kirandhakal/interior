const assert = require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 try {
 const page=await browser.newPage({viewport:{width:1600,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const r={id:'main',name:'Main room',dimensions:{length:5,width:4,height:2.6},placement:{x:0,z:0,rotation:0},walls:Object.fromEntries(['north','east','south','west'].map(w=>[w,{color:'#abcdef',finish:'Matte'}])),openings:[],furniture:[],lights:[],options:[],daylight:'Afternoon'};
  localStorage.setItem('room-paint-studio.projects.v1',JSON.stringify([{id:'test-attach',name:'Attachment test',rooms:[r],version:1,updatedAt:new Date().toISOString()}]));localStorage.setItem('room-paint-studio.last.v1','browser/test-attach');
 });
 await page.goto(process.env.HOUSE_TEST_URL || 'http://localhost:3000');await page.getByRole('button',{name:'House layout & preview'}).click();
 await page.getByRole('button',{name:'Attach bathroom',exact:true}).click();
 await page.getByRole('button',{name:'Select Bathroom',exact:true}).waitFor();
 await page.getByLabel('Select a space',{exact:true}).selectOption('main');
 await page.getByLabel('Attached space type').selectOption('Balcony');await page.getByLabel('Attachment wall').selectOption('east');
 await page.getByRole('button',{name:'Attach balcony',exact:true}).click();
 const balcony=page.getByRole('button',{name:'Select Balcony',exact:true});await balcony.waitFor();
 assert.equal(await balcony.evaluate(el=>getComputedStyle(el).cursor),'move');
 assert.equal(await page.locator('.house-canvas').evaluate(el=>getComputedStyle(el).userSelect),'none');
 // Drag an existing space, then undo the move.
 const before=await balcony.locator('polygon').getAttribute('points');const box=await balcony.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+70,box.y+box.height/2,{steps:8});await page.mouse.up();
 assert.notEqual(await balcony.locator('polygon').getAttribute('points'),before);assert.equal(await page.evaluate(()=>window.getSelection().toString()),'');
 await page.keyboard.press('Control+z');
 const bathId=await page.getByLabel('Select a space',{exact:true}).locator('option').evaluateAll(options=>options.find(o=>o.textContent==='Bathroom').value);
 await page.getByLabel('Select a space',{exact:true}).selectOption(bathId);
 await page.getByRole('button',{name:'Remove selected space',exact:true}).click();await page.getByRole('button',{name:'Confirm removal',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Select Bathroom',exact:true}).count(),0);
 await page.getByRole('button',{name:'Save project',exact:true}).click();
 let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('room-paint-studio.projects.v1'))[0]);assert.equal(saved.rooms.length,2);assert.equal(saved.rooms[0].openings.length,1);
 await page.keyboard.press('Control+z');await page.getByRole('button',{name:'Select Bathroom',exact:true}).waitFor();
 await page.getByRole('button',{name:'Save project',exact:true}).click();
 saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('room-paint-studio.projects.v1'))[0]);assert.equal(saved.rooms.length,3);assert.equal(saved.rooms[0].openings.length,2);
 await page.screenshot({path:'/tmp/house-attachments.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);console.log('PASS: attach bathroom/balcony, native pointer drag, no text selection, remove, undo and save');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
