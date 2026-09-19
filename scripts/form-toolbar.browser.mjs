import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { compilePreview } from '../src/views/vueStudio/component/previewCompiler.js'
import { normalizeToolbarRules, toolbarDesignerRule } from '../src/studio-runtime/formToolbar.js'

const normalized = normalizeToolbarRules([{type:'input',field:'a'}, {type:'lc-FormTopToolbar',field:'old',title:'old',value:'bad'}])
assert.equal(normalized[0].type, 'lc-FormTopToolbar')
assert.equal(normalized[0].field, undefined)
assert.equal(normalized[1].field, 'a')
assert.equal(toolbarDesignerRule().field, undefined)
assert.deepEqual(normalizeToolbarRules(normalized), normalized)

const source = await fs.readFile('src/studio-components/FormTopToolbar.vue', 'utf8')
const toolbar = { ...await compilePreview(source, 'toolbar-test'), key:'FormTopToolbar', publishTargets:['vue','formCreate'], formRules:'[]', formOptions:'{}' }
const modelSource = `<template><section><h3>Original form title</h3><form-create v-model="formData" v-model:api="formApi" :rule="rules" :option="options" @submit="nativeSubmit"/><output id="native-count">{{ count }}</output></section></template><script setup>import {inject,ref} from 'vue'; const {rules,options,formApi,formData}=inject('studioForm'); const count=ref(0); function nativeSubmit(){count.value++}</script>`
const compiled = await compilePreview(modelSource, 'form-test')
const rules = [
 {type:'input',field:'subject',title:'Subject',validate:[{required:true,message:'Subject required',trigger:'blur'}]},
 {type:'input',field:'locked',title:'Locked',props:{disabled:true}},
 {type:'switch',field:'enabled',title:'Enabled'},
 {type:'lc-FormTopToolbar',field:'legacyToolbarField',title:'OLD TOOLBAR LABEL',props:{}}
]
const payload = {...compiled, codeMode:'integrated', formRules:JSON.stringify(rules), formOptions:'{"submitBtn":false,"resetBtn":false}', props:{formData:{subject:'original',locked:'fixed',enabled:true,legacyToolbarField:'obsolete'}}, modules:[toolbar], css:toolbar.css}
const harness = `<!doctype html><html><body><div id="test"></div><script type="module">
import {createApp,ref,nextTick,h} from 'vue';
import ElementPlus from 'element-plus';
import StudioFrame from '/src/components/StudioFrame/index.vue';
const payload=${JSON.stringify(payload).replaceAll('<','\\u003c')};
window.saveCalls=0; window.mode='preview'; window.status='idle';
createApp({components:{StudioFrame},setup(){
 const frame=ref();
 const save=async()=>{window.saveCalls++;window.saved=await frame.value.request('validate');await new Promise(r=>setTimeout(r,250));if(window.mode==='failure')return {success:false,message:'Simulated save failure'};return {success:true,preview:window.mode==='preview'}};
 window.boot=async(mode='preview')=>{window.mode=mode;window.saveCalls=0;await nextTick();await frame.value.start({...payload,mode:mode==='designer'?'designer':'preview'})};
 window.capture=()=>frame.value.request('capture');window.values=options=>frame.value.request('validate', options);
 return ()=>h(StudioFrame,{ref:frame,componentId:'toolbar-regression',height:'720px',submitHandler:save,onStatus:v=>window.status=v});
}}).use(ElementPlus).mount('#test');
</script></body></html>`
const filename = '.toolbar-regression.html'
const entry = '.toolbar-regression-entry.js'
await fs.writeFile(entry, harness.match(/<script type="module">([\s\S]*?)<\/script>/)[1])
await fs.writeFile(filename, '<!doctype html><html><body><div id="test"></div><script type="module" src="/' + entry + '"></script></body></html>')
const playwrightPath = process.env.PLAYWRIGHT_MODULE || path.join(process.env.TEMP, 'ruoyi-toolbar-browser/node_modules/playwright-core/index.mjs')
const { chromium } = await import(pathToFileURL(playwrightPath))
const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true})
const page = await browser.newPage({viewport:{width:1280,height:1000}})
const errors=[]
page.on('pageerror',e=>errors.push(e.message))
page.on('console',msg=>{if(msg.type()==='error')console.log('BROWSER ERROR',msg.text().slice(0,400))})
const wait = async(fn)=>{for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,100))}throw Error('condition timeout')}
try {
 await page.goto((process.env.RUOYI_FRONTEND_URL || 'http://127.0.0.1')+'/'+filename)
 await page.waitForFunction(()=>typeof window.boot==='function')
 await page.evaluate(()=>window.boot())
 const frame=page.frameLocator('iframe')
 const subject=frame.locator('input').nth(0), locked=frame.locator('input').nth(1)
 await wait(()=>subject.isDisabled())
 assert.equal(await frame.getByRole('button',{name:'✎ 修改',exact:true}).isEnabled(),true)
 assert.equal(await frame.getByText('OLD TOOLBAR LABEL',{exact:true}).count(),0)
 const toolbarBox=await frame.getByRole('toolbar').boundingBox(), titleBox=await frame.locator('h3').boundingBox()
 assert.ok(toolbarBox.y+toolbarBox.height<=titleBox.y,'Toolbar must precede title and fields')
 await frame.getByRole('button',{name:'✎ 修改',exact:true}).click()
 assert.equal(await subject.isEnabled(),true);assert.equal(await locked.isDisabled(),true)
 await subject.fill('changed');await frame.getByRole('button',{name:'取消',exact:true}).click()
 assert.equal(await subject.inputValue(),'original');assert.equal(await subject.isDisabled(),true)
 await frame.getByRole('button',{name:'＋ 新增',exact:true}).click()
 assert.equal(await subject.inputValue(),'');await subject.fill('new record');assert.equal((await page.evaluate(()=>window.values({includeMode:true}))).mode,'create');await frame.getByRole('button',{name:'取消',exact:true}).click()
 assert.equal(await subject.inputValue(),'original')
 console.log('PASS: top position, fieldless toolbar, initial read-only, edit/create/cancel, intrinsic disabled field')
 await frame.getByRole('button',{name:'✎ 修改',exact:true}).click();await subject.fill('')
 await frame.getByRole('button',{name:'提交',exact:true}).click()
 await wait(async()=>!(await frame.getByRole('button',{name:'提交',exact:true}).getAttribute('class')).includes('is-loading'))
 assert.equal(await page.evaluate(()=>window.saveCalls),0)
 assert.equal(await frame.locator('#native-count').textContent(),'0')
 assert.equal(await subject.isEnabled(),true)
 await subject.fill('valid')
 await frame.getByRole('button',{name:'提交',exact:true}).click()
 await wait(()=>subject.isDisabled())
 assert.equal(await page.evaluate(()=>window.saveCalls),1)
 assert.equal(await frame.locator('#native-count').textContent(),'1')
 assert.deepEqual(await page.evaluate(()=>window.saved),{subject:'valid',locked:'fixed',enabled:true})
 console.log('PASS: native validation, original @submit, same-host submit callback, no toolbar value leakage')
 await page.evaluate(()=>window.boot('failure'))
 await frame.getByRole('button',{name:'✎ 修改',exact:true}).click()
 await frame.getByRole('button',{name:'提交',exact:true}).click()
 await frame.getByText('Simulated save failure',{exact:true}).waitFor()
 assert.equal(await subject.isEnabled(),true)
 await page.evaluate(()=>window.mode='success')
 await frame.getByRole('button',{name:'提交',exact:true}).click()
 await wait(()=>subject.isDisabled())
 assert.equal(await page.evaluate(()=>window.saveCalls),2)
 console.log('PASS: failed host submission remains editable; retry succeeds')
 await page.evaluate(()=>window.boot('designer'))
 await page.waitForTimeout(600)
 const design=await page.evaluate(()=>window.capture())
 const designRules=JSON.parse(design.formRules)
 assert.equal(designRules[0].type,'lc-FormTopToolbar');assert.equal(designRules[0].field,undefined);assert.equal(designRules[0].title,undefined)
 assert.equal(designRules.filter(r=>r.type==='lc-FormTopToolbar').length,1)
 assert.notEqual(designRules.find(r=>r.field==='subject').props?.disabled,true,'Designer must not persist runtime-only readonly state')
 console.log('PASS: designer normalizes legacy toolbar to first, fieldless rule')
 await frame.locator('button').filter({hasText:'预览'}).first().click()
 const dialog=frame.getByRole('dialog').filter({has:frame.getByRole('toolbar')})
 const previewInput=dialog.locator('input').first()
 await wait(()=>previewInput.isDisabled())
 await dialog.getByRole('button',{name:'✎ 修改',exact:true}).click()
 assert.equal(await previewInput.isEnabled(),true)
 await previewInput.fill('designer preview only')
 await dialog.getByRole('button',{name:'取消',exact:true}).click()
 assert.equal(await previewInput.isDisabled(),true)
 const unchanged=JSON.parse((await page.evaluate(()=>window.capture())).formRules)
 assert.notEqual(unchanged.find(r=>r.field==='subject').props?.disabled,true)
 console.log('PASS: built-in designer preview controls fields without modifying saved design')
 assert.deepEqual(errors,[])
 console.log('ALL TOOLBAR BROWSER REGRESSIONS PASSED')
} finally {await browser.close();await fs.unlink(filename).catch(()=>{});await fs.unlink(entry).catch(()=>{})}
