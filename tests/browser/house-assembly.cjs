const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
const room=(id,x)=>({id,name:id,dimensions:{length:4,width:3,height:2.6},placement:{x,z:0,rotation:0},walls:Object.fromEntries(['north','east','south','west'].map(w=>[w,{color:'#abcdef',finish:'Matte'}])),openings:[],furniture:[],lights:[],options:[],daylight:'Afternoon'});
localStorage.setItem('room-paint-studio.projects.v1',JSON.stringify([{id:'test-house',name:'Test house',rooms:[room('Living room',0),room('Bedroom',4)],version:1,updatedAt:new Date().toISOString()}]));localStorage.setItem('room-paint-studio.last.v1','browser/test-house');
});
await page.goto(process.env.HOUSE_TEST_URL || 'http://localhost:3000');await page.getByRole('button',{name:'House layout & preview'}).click();
await page.getByRole('button',{name:'Connect to Bedroom with door'}).click();
await page.getByRole('button',{name:'Save project',exact:true}).click();
const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('room-paint-studio.projects.v1'))[0]);
if(saved.rooms.some(r=>!r.openings[0]?.connectionId))throw Error('Connection missing');
await page.getByRole('button',{name:'Add five-room example',exact:true}).click();
await page.getByRole('button',{name:'Save project',exact:true}).click();
const example=await page.evaluate(()=>JSON.parse(localStorage.getItem('room-paint-studio.projects.v1'))[0]);
if(example.rooms.length!==7 || example.rooms.find(r=>r.name==='Hallway').openings.length!==4)throw Error('Example house missing connected rooms');
await page.screenshot({path:'/tmp/house-top-view.png'});
await page.getByRole('button',{name:'House 3D',exact:true}).click();await page.waitForTimeout(1000);
await page.screenshot({path:'/tmp/house-preview.png'});
if(errors.length)throw Error(errors.join('\n'));console.log('PASS: house navigation, paired connection, persistence and 3D preview');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
