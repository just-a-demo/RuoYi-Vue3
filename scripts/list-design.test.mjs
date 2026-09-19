import test from 'node:test'
import assert from 'node:assert/strict'
import {syncFields, listColumns} from '../src/views/business/formModel/fields.js'
import {normalizeListConfig, validateListConfig, validateConditions, fieldMeta, operators, previewQuery, displayValue, sampleRecords} from '../src/views/business/formModel/listConfig.js'
const fields=syncFields([{type:'inputNumber',field:'n',title:'金额'},{type:'switch',field:'b',title:'启用'},{type:'input',field:'s',title:'文本'},{type:'datePicker',field:'d',title:'日期'},{type:'select',field:'e',options:[{label:'零',value:0},{label:'一',value:1}]},{type:'checkbox',field:'a',options:[{label:'A',value:'a'},{label:'B',value:'b'}]}])
fields.forEach(f=>f.sortable=true)
const c=(field,operator,value)=>({field,operator,value})
const query=(records,conditions=[],extra={})=>previewQuery(records,fields,{pageNum:1,pageSize:20,conditions,relation:'and',sort:null,...extra})
const records=[{id:1,values:{n:0,b:false,s:'Alpha%_',d:'2026-09-01',e:0,a:['a']}},{id:2,values:{n:10,b:true,s:'Beta',d:'2026-09-02',e:1,a:['a','b']}},{id:3,values:{}},{id:4,values:{n:null,s:'',a:[]}}]
test('legacy config defaults; field filter becomes a convenience row',()=>{
 const config=normalizeListConfig(null,[{...fields[0],filter:true}]);assert.equal(config.table.defaultWidth,160);assert.equal(config.table.pageSize,20);assert.equal(config.buttons.length,3);assert.deepEqual(config.filters.defaults,[{field:'n',operator:'eq'}])
})
test('column order, default and override widths; no client-page sorting',()=>{
 const columns=listColumns([{...fields[0],order:2,width:220},{...fields[1],order:1},{...fields[2],visible:false}],180)
 assert.deepEqual(columns.map(c=>[c.field,c.width,c.sort,c.showSort]),[['b',180,false,true],['n',220,false,true]])
 assert.equal(columns[0].fieldFormat(records[0]),'否')
})
test('zero and false are real query values, not empty filters',()=>{
 assert.equal(query(records,[c('n','eq',0)]).rows[0].id,1);assert.equal(query(records,[c('b','eq',false)]).total,1)
 assert.equal(query(records,[c('n','empty')]).total,2)
})
test('AND OR and repeated fields',()=>{
 assert.equal(query(records,[c('n','gte',0),c('n','lt',10)]).total,1)
 assert.equal(query(records,[c('n','eq',0),c('n','eq',10)],{relation:'or'}).total,2)
})
test('literal wildcard and case-insensitive text matching',()=>{
 assert.equal(query(records,[c('s','contains','%_')]).total,1)
 assert.equal(query(records,[c('s','startsWith','ALPHA')]).total,1)
 assert.equal(query(records,[c('s','notContains','beta')]).total,1)
})
test('typed enum and array operators',()=>{
 assert.equal(query(records,[c('e','in',[0])]).total,1);assert.equal(query(records,[c('a','all',['a','b'])]).total,1)
 assert.equal(query(records,[c('a','any',['b'])]).total,1);assert.equal(query(records,[c('a','empty')]).total,2)
 assert.throws(()=>validateConditions([c('e','eq','0')],fields),/失效/)
})
test('real calendar validation and ordered ranges',()=>{
 assert.equal(query(records,[c('d','between',['2026-09-01','2026-09-02'])]).total,2)
 assert.throws(()=>validateConditions([c('d','eq','2026-02-31')],fields),/日期/)
 assert.throws(()=>validateConditions([c('n','between',[4,0])],fields),/起始值/)
})
test('numeric sort, stable tie breaker and empty values last',()=>{
 const items=[...records,{id:5,values:{n:10}}]
 assert.deepEqual(query(items,[],{sort:{field:'n',order:'asc'}}).rows.map(r=>r.id),[1,5,2,4,3])
 assert.deepEqual(query(items,[],{sort:{field:'n',order:'desc'}}).rows.map(r=>r.id),[5,2,1,4,3])
})
test('pagination and overflow correction after filtering',()=>{
 const rows=Array.from({length:25},(_,i)=>({id:i+1,values:{n:i}}))
 assert.deepEqual(query(rows,[],{pageNum:2,pageSize:10,sort:{field:'n',order:'asc'}}).rows.map(r=>r.values.n),Array.from({length:10},(_,i)=>i+10))
 assert.equal(query(rows,[c('n','eq',0)],{pageNum:3,pageSize:10}).pageNum,1)
})
test('field extraction preserves flags but refreshes types and options',()=>{
 const synced=syncFields([{type:'input',field:'n',title:'新标题'}],[{...fields[0],visible:false,width:200}]);assert.equal(synced[0].valueType,'text');assert.equal(synced[0].width,200);assert.equal(synced[0].visible,false)
 assert.throws(()=>syncFields([{field:'a'},{children:[{field:'a'}]}]),/重复/)
})
test('complex and unsupported custom dates remain selectable for empty queries',()=>{
 assert.deepEqual(operators(fieldMeta({type:'upload'})),['empty','notEmpty'])
 assert.equal(fieldMeta({type:'datePicker',props:{valueFormat:'YYYY/MM/DD'}}).valueType,'complex')
 assert.equal(fieldMeta({type:'select',props:{multiple:true},options:[{label:'A',value:'a'}]}).valueType,'array')
})
test('deleted default sort/filter and invalid width are blocked at save',()=>{
 const config=normalizeListConfig({},fields);validateListConfig(config,fields)
 config.table.defaultSort={field:'gone',order:'asc'};assert.throws(()=>validateListConfig(config,fields),/排序/)
 config.table.defaultSort=null;config.table.defaultWidth=1;assert.throws(()=>validateListConfig(config,fields),/列宽/)
 config.table.defaultWidth=160;config.filters.defaults=[{field:'gone',operator:'eq'}];assert.throws(()=>validateListConfig(config,fields),/筛选/)
})
test('custom switch and option display preserve scalar types',()=>{
 const field={...fieldMeta({type:'switch',props:{activeValue:1,inactiveValue:0}}),field:'x'}
 assert.equal(displayValue(0,field),'否');validateConditions([c('x','eq',0)],[field]);assert.throws(()=>validateConditions([c('x','eq',false)],[field]),/是或否/)
 assert.equal(displayValue(0,fields.find(f=>f.field==='e')),'零')
})
test('mock data includes stable IDs and typed timestamp values',()=>{
 const timestamp={field:'t',title:'时间',...fieldMeta({type:'datePicker',props:{type:'datetime',valueFormat:'x'}})}
 const records=sampleRecords([timestamp]);assert.equal(records.length,25);assert.equal(records[0].id,1);assert.equal(typeof records[0].values.t,'number');assert.equal(displayValue(records[0].values.t,timestamp),'2026-09-01 12:00:00')
})
