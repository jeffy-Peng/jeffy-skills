
import {writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {loadChromium,findChrome} from '../lib/browser.mjs'
const [file,out='validation.json']=process.argv.slice(2)
if(!file)throw Error('用法 node scripts/verify-page.mjs out.html report.json')
const browser=await loadChromium().launch({executablePath:findChrome()})
try{
 const page=await browser.newPage({viewport:{width:1400,height:1000},reducedMotion:'reduce'})
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(pathToFileURL(resolve(file)).href)
 await page.waitForFunction(()=>window.renderComplete===true,{},{timeout:20000})
 const report=await page.evaluate(()=>window.validationReport)
 writeFileSync(out,JSON.stringify({errors,pages:report},null,2))
 if(errors.length||report.some(p=>!p.ok))process.exitCode=1
 console.log(report.filter(p=>p.ok).length+'/'+report.length+' 页通过，'+out)
}finally{await browser.close()}
