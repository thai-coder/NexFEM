/**
 * Read-only SAP2000 S2K import audit. Run with Node >= 22 and project dependencies:
 * node --experimental-transform-types scripts/validation/sap-import-audit.mjs /path/to/model.s2k > audit.json
 * The output deliberately excludes the raw input, its saved path and license fields.
 * Compares importer output to parsed input, not solver results or SAP engineering accuracy.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { importS2k } from '../../packages/io-formats/src/csi/s2k-import.ts';
import { parseS2k } from '../../packages/io-formats/src/csi/s2k-parse.ts';
import { unitFactors } from '../../packages/io-formats/src/csi/units.ts';

const path = process.argv[2];
if (!path) { console.error('Usage: node --experimental-transform-types scripts/validation/sap-import-audit.mjs model.s2k'); process.exit(2); }
const bytes = readFileSync(path), text = bytes.toString('utf8'), parsed = parseS2k(text);
const table = n => parsed.tables.get(n) ?? [];
const f = (r,k) => r.fields.get(k);
const n = (r,k) => Number(f(r,k));
const pc = table('PROGRAM CONTROL')[0];
const [force,length,temp] = (f(pc,'CurrUnits') ?? '').split(',').map(x=>x.trim());
const units=unitFactors(force,length,temp);
if (!units) throw new Error('Unknown source units; cannot audit conversions');
const {model,report}=importS2k(parsed,{name:'audit'});
// Optional temporary output for the independent uniform-load checker; can contain model data.
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify({model,report}));
const byId = xs => new Map(xs.map(x=>[x.id,x]));
const joints=byId(model.joints), shells=byId(model.shells), patterns=byId(model.loadPatterns);
let matched=0, missing=0, maxCoordinateErrorM=0;
for(const row of table('JOINT COORDINATES')) {
  const target=joints.get(report.mapping.joints[f(row,'Joint')]);
  if(!target){missing++;continue;}
  const keys=row.fields.has('GlobalX')?['GlobalX','GlobalY','GlobalZ']:['XorR','Y','Z'];
  if(keys.some(k=>!row.fields.has(k)||!Number.isFinite(n(row,k)))){missing++;continue;}
  matched++;
  for(let i=0;i<3;i++) maxCoordinateErrorM=Math.max(maxCoordinateErrorM,Math.abs(target[['x','y','z'][i]]-n(row,keys[i])*units.l));
}
const active=table('ACTIVE DEGREES OF FREEDOM')[0];
const inactive=['UX','UY','UZ','RX','RY','RZ'].map(k=>f(active,k)!==undefined && f(active,k)?.toLowerCase()!=='yes');
let restraintsMatched=0,restraintsMismatch=0,restraintsMissing=0;
for(const row of table('JOINT RESTRAINT ASSIGNMENTS')) {
  const target=joints.get(report.mapping.joints[f(row,'Joint')]);
  if(!target){restraintsMissing++;continue;}
  const expected=['U1','U2','U3','R1','R2','R3'].map((k,i)=>f(row,k)?.toLowerCase()==='yes'||inactive[i]);
  const actual=target.restraint ?? [false,false,false,false,false,false];
  if(expected.every((v,i)=>v===actual[i])) restraintsMatched++;else restraintsMismatch++;
}
const diagnosticCounts={};
for(const d of report.diagnostics) {
 const key=`${d.level}:${d.code}`; diagnosticCounts[key]=(diagnosticCounts[key]??0)+d.count;
}
const ignored=report.diagnostics.filter(d=>d.code==='section_ignored').map(d=>d.params);
const selected=['AREA LOADS - UNIFORM TO FRAME','FRAME LOAD TRANSFER OPTIONS','AUTO SEISMIC - ASCE 7-22','AUTO SEISMIC LOADS TO JOINTS','MASS SOURCE','CASE - MODAL 1 - GENERAL','AREA AUTO MESH ASSIGNMENTS'];
const sourceCounts=Object.fromEntries(selected.map(name=>[name,table(name).length]));
const output={sourceSha256:createHash('sha256').update(bytes).digest('hex'),program:report.program,version:report.version,units:report.units,counts:report.counts,
 finalCounts:Object.fromEntries(['joints','frames','shells','frameSections','shellSections','loadPatterns','loadCases','combos','frameLoads','shellLoads','jointLoads'].map(k=>[k,model[k].length])),
 coordinateCheck:{matched,missing,maxCoordinateErrorM},restraintCheck:{matched:restraintsMatched,mismatch:restraintsMismatch,missing:restraintsMissing},
 loadPatterns:model.loadPatterns.map(({name,type,selfWeight})=>({name,type,selfWeight})),
 loadCases:model.loadCases.map(c=>({name:c.name,type:c.type,loads:c.loads.map(l=>({pattern:patterns.get(l.pattern)?.name,factor:l.factor}))})),
 diagnostics:diagnosticCounts, ignoredTables:ignored, selectedSourceTableCounts:sourceCounts,
 sectionPropertyDifferences:report.diagnostics.filter(d=>d.code==='section_props_differ').flatMap(d=>d.objects),
 mappingFrame1:report.mapping.frames['1'] ?? null,
 notes:['Counts describe data, not solver equivalence. frame count in report precedes splitting.','Coordinate and restraint comparisons reuse the project parser; not an independent format validation.']};
console.log(JSON.stringify(output,null,2));
