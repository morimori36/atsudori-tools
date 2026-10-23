import {it} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {calculateRating} from '../src/domain/rating/calculate';
import type {RatingInput} from '../src/domain/rating/calculate';
import {deriveMemberDisplay,deriveSnapDisplay} from '../src/data/catalog/growth';
import type {MemberProgression,SnapProgression} from '../src/data/catalog/growth';
import {validateCatalog,catalogIssues} from '../src/data/catalog/validate';
const root=process.env.PRIVATE_REGRESSION_ROOT;
if(!root)throw new Error('Set PRIVATE_REGRESSION_ROOT to an existing private checkout. No files are downloaded.');
const read=(path:string):unknown=>JSON.parse(readFileSync(join(resolve(root),path),'utf8'));
const check=(ok:boolean,message:string):void=>{if(!ok)throw new Error(message+' (private values omitted)');};
interface Case {id:string;verificationMode:string;rawInput:RatingInput;validationOverrides?:Partial<RatingInput>;expectedBandRating:number}
interface Delta {beforeCaseId:string;afterCaseId:string;verificationMode:string;observedDelta:number}
const cases=(read('tests/fixtures/evaluation-cases.json') as {cases:Case[]}).cases;
const deltas=(read('tests/fixtures/evaluation-deltas.json') as {cases:Delta[]}).cases;
const mode=process.env.PRIVATE_DIAGNOSTICS==='true'?'assumption-dependent':'strict';
const selected=cases.filter(c=>c.verificationMode===mode),differences=deltas.filter(d=>d.verificationMode===mode);
const before=JSON.stringify(cases);
const input=(c:Case):RatingInput=>mode==='strict'?c.rawInput:{...c.rawInput,...c.validationOverrides};
it('compares the nonempty external absolute cohort without logging records',()=>{
  check(selected.length>0,'No acceptance records');
  for(const c of selected)check(calculateRating(input(c)).bandRating===c.expectedBandRating,'Absolute mismatch');
  check(JSON.stringify(cases)===before,'Input mutation');
});
it('compares nonempty external deltas within the same cohort',()=>{
  check(differences.length>0,'No delta records');
  for(const d of differences){
    const a=selected.find(c=>c.id===d.beforeCaseId),b=selected.find(c=>c.id===d.afterCaseId);
    check(Boolean(a&&b),'Missing cohort endpoint');
    check(calculateRating(input(b!)).bandRating-calculateRating(input(a!)).bandRating===d.observedDelta,'Delta mismatch');
  }
});
it.skipIf(mode!=='strict')('uses external catalog/growth inputs for the strict cultivation path only',()=>{
  const source=read('src/data/masterdata/generated/jp.json') as Record<string,unknown>;
  const {provenance,...tables}=source;
  check(Boolean(provenance),'Missing private provenance');
  const m=validateCatalog({...tables,format:'atsudori-tools/catalog',catalogId:'external-private',revision:'local-verification'});
  check(catalogIssues(m).length===0,'External catalog needs explicit conversion');
  const growth=(read('tests/fixtures/display-growth-cases.json') as {cases:{caseId:string;member:MemberProgression;snap:SnapProgression}[]}).cases;
  check(growth.length>0,'No growth records');
  for(const g of growth){
    const observed=cases.find(c=>c.id===g.caseId);check(Boolean(observed)&&observed!.verificationMode==='strict','Missing strict growth observation');
    const member=deriveMemberDisplay(m,g.member),snap=deriveSnapDisplay(m,g.snap),raw=observed!.rawInput;
    check(JSON.stringify(member.displayedStats)===JSON.stringify(raw.memberDisplayedStats),'Display mismatch');
    check(JSON.stringify(snap.percentBp)===JSON.stringify(raw.snapPercentBp),'Snap display mismatch');
    check(member.awakeLevel===raw.awakeLevel&&snap.snapLimitBreak===raw.snapLimitBreak,'A/U mismatch');
    check(calculateRating({...raw,memberDisplayedStats:member.displayedStats,awakeLevel:member.awakeLevel,snapPercentBp:snap.percentBp,snapLimitBreak:snap.snapLimitBreak}).bandRating===observed!.expectedBandRating,'Growth rating mismatch');
  }
});
it('writes aggregate evidence locally; never includes a private record',()=>{
  let publicCommit='uncommitted';
  try{publicCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{/* Initial bootstrap. */}
  mkdirSync('.cache',{recursive:true});
  const growthCount=mode==='strict'?(read('tests/fixtures/display-growth-cases.json') as {cases:unknown[]}).cases.length:0;
  writeFileSync('.cache/private-'+mode+'-summary.json',JSON.stringify({publicCommit,mode,absoluteCount:selected.length,deltaCount:differences.length,growthCount},null,2)+'\n');
});
