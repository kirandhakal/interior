const assert = require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 try {
 const page=await browser.newPage({viewport:{width:1600,height:1100}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.HOUSE_TEST_URL || 'http://localhost:3000');
 await page.getByRole('button',{name:'House layout & preview'}).click();
 const canvas=page.locator('.house-canvas');
 async function coordinate(x,z){return canvas.evaluate((svg,p)=>{const q=new DOMPoint(p.x,p.z).matrixTransform(svg.getScreenCTM());return {x:q.x,y:q.y};},{x,z});}
 async function click(x,z){const p=await coordinate(x,z);await page.mouse.click(p.x,p.y);}
 const corridor=page.getByRole('button',{name:'Corridor 4 × 1.2 m',exact:true});
 const target=await coordinate(0,4);
 const transfer=await page.evaluateHandle(()=>new DataTransfer());
 await corridor.dispatchEvent('dragstart',{dataTransfer:transfer});
 await canvas.dispatchEvent('drop',{dataTransfer:transfer,clientX:target.x,clientY:target.y});
 await page.getByRole('button',{name:'Select Corridor',exact:true}).waitFor();
 await page.getByRole('button',{name:'Passage 4 × 1.5 m',exact:true}).click();
 await click(6,0);
 await page.getByRole('button',{name:'Select Passage',exact:true}).waitFor();
 assert.ok(await page.getByRole('button',{name:'Select Passage',exact:true}).locator('polygon').getAttribute('stroke-dasharray'));
 await page.getByRole('button',{name:'Draw a space',exact:true}).click();
 await page.getByLabel('Space to draw').selectOption('Bathroom');
 for(const [x,z] of [[4,3],[7,3],[7,5],[6,6],[4,6]])await click(x,z);
 await page.getByRole('button',{name:'Finish space',exact:true}).click();
 await page.getByRole('button',{name:'Select Bathroom',exact:true}).waitFor();
 const name=page.getByRole('textbox',{name:'Space name',exact:true});await name.fill('Guest bath');await name.press('Enter');
 await page.getByRole('button',{name:'Select Guest bath',exact:true}).waitFor();
 await page.getByRole('button',{name:'Edit shape & size',exact:true}).click();
 await page.getByRole('dialog').waitFor();
 await page.getByRole('button',{name:'Apply floor plan',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.screenshot({path:'/tmp/house-spaces-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Save project',exact:true}).click();
 // Initial save opens a name dialog.
 const saveDialog=page.getByRole('dialog');
 if(await saveDialog.isVisible()) await saveDialog.getByRole('button',{name:/save/i}).last().click();
 await page.waitForTimeout(300);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('room-paint-studio.projects.v1'))[0]);
 assert.equal(saved.rooms.length,4);
 assert.equal(saved.rooms.find(r=>r.name==='Corridor').spaceType,'Corridor');
 assert.equal(saved.rooms.find(r=>r.name==='Guest bath').dimensions.outline.length,5);
 await page.reload();await page.getByRole('button',{name:'House layout & preview'}).click();
 await page.getByRole('button',{name:'Select Guest bath',exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'/tmp/house-spaces-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
 assert.deepEqual(errors,[]);
 console.log('PASS: corridor drag/drop, passage placement, polygon drawing, editing, saving, reload, mobile width');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
