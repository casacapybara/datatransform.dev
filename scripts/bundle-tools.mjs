import {build} from 'esbuild';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
await mkdir('shared/vendor',{recursive:true});
const parquetBuild=await build({metafile:true,entryPoints:['shared/parquet.mjs'],outfile:'shared/parquet-bundle.js',bundle:true,format:'iife',globalName:'ParquetAdapter',platform:'browser',target:'es2022',minify:true,legalComments:'eof'});
const workbenchBuild=await build({metafile:true,entryPoints:['shared/workbench-libs.mjs'],outfile:'shared/workbench-bundle.js',bundle:true,format:'iife',globalName:'WorkbenchLibraries',platform:'browser',target:'es2022',minify:true,legalComments:'eof'});
let notices='Bundled browser libraries. Sources are locked in package-lock.json. Rebuild with npm run bundle:tools.\n';
for(const name of ['hyparquet','hyparquet-writer','hyparquet-compressors','fzstd','jsonpath-rfc9535','jsonschema']){
  const p=JSON.parse(await readFile(`node_modules/${name}/package.json`,'utf8'));let license='';for(const f of ['LICENSE','LICENSE.md','LICENSE.txt','LICENSE-MIT']){try{license=await readFile(`node_modules/${name}/${f}`,'utf8');break;}catch{}}
  if(!license)throw Error('Missing license for '+name);notices+=`\n\n${name} ${p.version} — ${p.license}\n${typeof p.repository==='string'?p.repository:p.repository?.url||''}\n${license}`;
}
const comments=new Set();
for(const file of new Set([...Object.keys(parquetBuild.metafile.inputs),...Object.keys(workbenchBuild.metafile.inputs)])){
  if(!file.startsWith('node_modules/'))continue;
  const source=await readFile(file,'utf8');
  for(const match of source.matchAll(/\/\*[\s\S]*?\*\//g))if(/copyright|license|adapted from/i.test(match[0]))comments.add(match[0]);
}
notices+='\n\nOfficial JSON Schema draft-04, draft-06 and draft-07 definitions\nSources: https://json-schema.org/draft-04/schema , https://json-schema.org/draft-06/schema , https://json-schema.org/draft-07/schema\n'+await readFile('shared/vendor/JSON-SCHEMA-LICENSE.txt','utf8');
notices+='\n\nUpstream source attributions\n'+[...comments].join('\n\n');
await writeFile('shared/vendor/NOTICE.txt',notices);
