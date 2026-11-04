#!/usr/bin/env node
// Offline, source-shaped PubChem fixture. No fabricated compounds are added
// to the actual ChemPath catalog or installed source data by this test.
import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const root=fs.mkdtempSync(path.join(os.tmpdir(),"chempath-pubchem-test-"));
const source=path.join(root,"CID-SMILES.tsv");
const db=path.join(root,"catalog","pubchem.sqlite");
const records=[
  [1,"CC"],[2,"CCO"],[3,"CC=O"],[4,"CC(=O)O"],[5,"C1CCCCC1"],
  [6,"N"],[7,"O"],[8,"C=C"],[9,"C#C"],[10,"CCN"],
  [11,"CO"],[12,"C=O"],[13,"CCC"]
];
fs.writeFileSync(source,
  "CID\tSMILES\n"+records.map(x=>x.join("\t")).join("\n")+"\n");
const importer=(target,output=db)=>spawnSync("python3",[
  "scripts/import-pubchem.py","--source-file",source,
  "--target",String(target),"--output",output
],{encoding:"utf8",timeout:25000});
const ok=importer(12);
assert.equal(ok.status,0,ok.stderr||ok.stdout);
const jsonStart=ok.stdout.indexOf("{");
assert.ok(jsonStart>=0,ok.stdout);
const result=JSON.parse(ok.stdout.slice(jsonStart));
assert.equal(result.count,12);
assert.equal(result.target,12);
assert.ok(fs.statSync(db).size>1000);

// Atomic promotion: an insufficient source must never replace a valid file.
const originalSize=fs.statSync(db).size;
const fail=importer(25);
assert.notEqual(fail.status,0);
assert.equal(fs.statSync(db).size,originalSize);

const sql=new Database(db,{readonly:true,fileMustExist:true});
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM compounds").get().n,12);
assert.equal(sql.prepare("SELECT value FROM catalog_meta WHERE key='count'").get().value,"12");
const query=sql.prepare("EXPLAIN QUERY PLAN SELECT cid FROM compounds WHERE smiles>=? AND smiles<? LIMIT 5")
  .all("CC","CC\uffff");
assert.ok(query.some(row=>row.detail.includes("idx_compounds_smiles")),JSON.stringify(query));
assert.equal(sql.pragma("integrity_check",{simple:true}),"ok");
sql.close();

// Regression: npm workspaces run from server/, NOT the repository root.
// The installed default must always point to repoRoot/data/catalog.
const expectedDefault=path.resolve("data","catalog","pubchem.sqlite");
const workspaceProbe=spawnSync(process.execPath,[
  "--input-type=module","-e",
  "import {catalogDatabasePath} from './compound-catalog.js'; console.log(catalogDatabasePath());"
],{
  cwd:path.resolve("server"),encoding:"utf8",timeout:10000,
  env:{...process.env,CHEMPATH_PUBCHEM_DB:"",CHEMPATH_DATA_DIR:""}
});
assert.equal(workspaceProbe.status,0,workspaceProbe.stderr);
assert.equal(workspaceProbe.stdout.trim(),expectedDefault,
  "Catalog default must be independent of npm workspace cwd");

const port=9993;
// Boot exactly as the npm server workspace does, without overriding the
// PubChem DB path; CHEMPATH_DATA_DIR selects the fixture's parent folder.
const server=spawn(process.execPath,["index.js"],{
  cwd:path.resolve("server"),
  env:{...process.env,PORT:String(port),
    CHEMPATH_PUBCHEM_DB:"",CHEMPATH_DATA_DIR:root},
  stdio:["ignore","pipe","pipe"]
});
let logs="";
server.stdout.on("data",data=>logs+=String(data));
server.stderr.on("data",data=>logs+=String(data));
const base="http://127.0.0.1:"+port;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function get(route,status=200){
  const response=await fetch(base+route);
  const payload=await response.json();
  assert.equal(response.status,status,route+": "+JSON.stringify(payload));
  return payload;
}
try{
  let ready=false;
  for(let i=0;i<80;i++){
    try{
      const result=await get("/api/catalog/status");
      if(result.available){ready=true;break;}
    }catch{/* await startup */}
    await delay(250);
  }
  assert.ok(ready,"PubChem fixture API never started: "+logs);
  const status=await get("/api/catalog/status");
  assert.equal(status.compounds,12);
  assert.equal(status.target,500000);
  assert.equal(status.structureOnly,true);
  const first=await get("/api/catalog/search?limit=5");
  assert.equal(first.matches.length,5);
  assert.equal(first.nextAfter,5);
  assert.equal(first.matches[0].cid,1);
  assert.equal(first.matches[0].hasCuratedReactionEdges,false);
  const next=await get("/api/catalog/search?limit=5&after="+first.nextAfter);
  assert.equal(next.matches[0].cid,6);
  const exact=await get("/api/catalog/search?q=CID%202&limit=5");
  assert.equal(exact.matches.length,1);
  assert.equal(exact.matches[0].smiles,"CCO");
  const prefix=await get("/api/catalog/search?q=CC&limit=20");
  assert.ok(prefix.matches.some(row=>row.smiles==="CCO"));
  assert.ok(prefix.matches.every(row=>row.smiles.startsWith("CC")));
  const detail=await get("/api/catalog/compound/3");
  assert.equal(detail.compound.smiles,"CC=O");
  assert.ok(detail.compound.url.includes("/compound/3"));
  await get("/api/catalog/compound/5000",404);
  await get("/api/catalog/search?limit=200",400);
  await get("/api/catalog/search?after=-1",400);
  await get("/api/catalog/search?q=CC&after=4",400);
  console.log("PubChem offline smoke passed: source import, integrity, indexed search, cursor browsing, structure distinction and atomic rollback.");
}finally{
  server.kill();
  fs.rmSync(root,{recursive:true,force:true});
}
