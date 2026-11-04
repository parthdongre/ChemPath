// Real PubChem compound registry. The C++ reaction-network engine remains
// authoritative for pathfinding; this indexed catalog is NOT an edge graph.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const dbPath=path.resolve(process.env.CHEMPATH_PUBCHEM_DB||
  path.join(process.env.CHEMPATH_DATA_DIR||"data","catalog","pubchem.sqlite"));
let db=null;
let openedMtime=null;
let metadata=null;

function failure(message,status=400){
  const error=new Error(message);
  error.status=status;
  throw error;
}
function optionalDb(){
  if(!fs.existsSync(dbPath)){
    if(db){db.close();db=null;metadata=null;openedMtime=null;}
    return null;
  }
  const info=fs.statSync(dbPath);
  const version=info.mtimeMs+":"+info.size+":"+info.ino;
  if(db&&openedMtime===version)return db;
  if(db)db.close();
  db=null;metadata=null;
  try{
    const opened=new Database(dbPath,{readonly:true,fileMustExist:true,timeout:4000});
    opened.pragma("query_only=ON");
    // Verify this is a complete, atomically published PubChem import.
    const values=opened.prepare("SELECT key,value FROM catalog_meta").all();
    const meta=Object.fromEntries(values.map(row=>[row.key,row.value]));
    if(!/^\d+$/.test(meta.count||"")||meta.format!=="CID-SMILES"){
      opened.close();
      return null;
    }
    db=opened;metadata=meta;openedMtime=version;
    return db;
  }catch(error){
    // Existing malformed SQLite DB should not crash ChemPath startup.
    console.warn("[ChemPath catalog] Database not readable:",error.message);
    return null;
  }
}
export function catalogStatus(){
  const handle=optionalDb();
  return {
    ok:true,available:Boolean(handle),target:500000,
    compounds:handle?Number(metadata.count):0,
    source:"PubChem Compound Extras",
    format:"CID-SMILES",structureOnly:true,
    setup:"npm run data:500k",
    distinction:"The 500,000 catalog records do not imply reaction connectivity.",
    importedAt:metadata?.imported_at||null
  };
}
function requiredDb(){
  return optionalDb()||failure(
    "PubChem catalog is not installed. Run npm run data:500k on your machine.",503);
}
const summary=row=>({
  cid:row.cid,
  id:"pubchem:"+row.cid,
  label:"PubChem CID "+row.cid,
  smiles:row.smiles,
  url:"https://pubchem.ncbi.nlm.nih.gov/compound/"+row.cid,
  source:"PubChem",
  hasCuratedReactionEdges:false
});
function parseLimit(raw){
  const limit=raw==null?24:Number(raw);
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)
    failure("limit must be an integer 1-100");
  return limit;
}
function parseCursor(raw){
  if(raw==null)return 0;
  const cursor=Number(raw);
  if(!Number.isSafeInteger(cursor)||cursor<0)
    failure("after must be a nonnegative PubChem CID");
  return cursor;
}
export function catalogSearch(query,rawLimit,rawAfter){
  const handle=requiredDb();
  const limit=parseLimit(rawLimit);
  const after=parseCursor(rawAfter);
  const q=typeof query==="string"?query.trim():"";
  if(q.length>180||/[\x00-\x1f]/.test(q))failure("query must contain up to 180 printable characters");
  let rows, mode;
  if(!q){
    mode="browse";
    rows=handle.prepare("SELECT cid,smiles FROM compounds WHERE cid > ? ORDER BY cid LIMIT ?")
      .all(after,limit);
  }else{
    if(after)failure("after cursor is supported for browse mode only");
    const match=/^(?:cid[: #\-]*)?(\d{1,12})$/i.exec(q);
    if(match){
      mode="cid";
      rows=handle.prepare("SELECT cid,smiles FROM compounds WHERE cid=? LIMIT 1")
        .all(Number(match[1]));
    }else{
      mode="smiles-prefix";
      // Binary prefix matches preserve meaningful uppercase/lowercase in SMILES.
      rows=handle.prepare("SELECT cid,smiles FROM compounds "+
        "WHERE smiles >= ? AND smiles < ? ORDER BY smiles,cid LIMIT ?")
        .all(q,q+"\uffff",limit);
    }
  }
  return {ok:true,mode,query:q,limit,matches:rows.map(summary),
    nextAfter:mode==="browse"&&rows.length===limit?rows[rows.length-1].cid:null,
    total:Number(metadata.count),source:"PubChem",structureOnly:true};
}
export function catalogCompound(rawCid){
  const handle=requiredDb();
  if(!/^\d{1,12}$/.test(String(rawCid)))failure("Invalid PubChem CID");
  const row=handle.prepare("SELECT cid,smiles FROM compounds WHERE cid=?")
    .get(Number(rawCid));
  if(!row)failure("PubChem CID not in installed catalog",404);
  return {ok:true,compound:summary(row)};
}
export function closeCatalogDb(){
  if(db)db.close();
  db=null;metadata=null;openedMtime=null;
}
