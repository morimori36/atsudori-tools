import { digest } from '../../src/domain/conversion/profile';
import type { ConversionProfile, Shape, Template } from '../../src/domain/conversion/profile';
import type { Masterdata } from '../../src/data/catalog/model';
import { syntheticCatalog } from './synthetic';

/** Invented transport only. The real destination contract is verified in Private. */
export async function fictionalProfile(master: Masterdata = syntheticCatalog()): Promise<ConversionProfile> {
  const get=(path:string):Template=>({op:'get',path:path.split('.')});
  const object=(fields:Record<string,Template>):Template=>({op:'object',fields});
  const number:Shape={type:'integer',min:0,max:Number.MAX_SAFE_INTEGER};
  const record=(properties:Record<string,Shape>):Shape=>({type:'object',properties});
  const array=(items:Shape):Shape=>({type:'array',items,max:10000});
  const row:Template=object({id:get('row.cardId'),outLive:get('row.liveSkillLevel'),outGeki:get('row.gekisouSkillLevel')});
  const program:Template=object({nonce:get('meta.exportId'),time:get('meta.at'),total:get('meta.totalRank'),
    roster:{op:'map',source:'members',body:row},supports:{op:'map',source:'snaps',body:object({id:get('row.supportCardId'),lv:get('row.level'),stage:get('row.rank')})},
    ranks:{op:'map',source:'ranks',key:{op:'text',values:[get('row.id')]},body:get('row.value')},
    items:{op:'map',source:'items',key:{op:'text',values:[get('row.id')]},body:{op:'ifNull',value:get('row.level'),yes:{op:'literal',value:'absent'},no:get('row.level')}}});
  const payload:Omit<ConversionProfile,'checksum'>={format:'atsudori-tools/conversion-profile',schemaVersion:2,engine:'bounded-template/1',id:'fictional-test-transport',version:'1',
    input:{format:'atsudori-tools/collection',schemaVersion:1},target:{format:'fictional-transport/1',version:'fictional-version',definitionSha256:'a'.repeat(64)},
    catalog:{catalogId:master.catalogId,revision:master.revision,sha256:await digest(master)},
    provenance:{sources:[{id:'fictional-definitions',revision:'test-1',sha256:'d'.repeat(64)}]},program,
    output:record({nonce:{type:'string'},time:number,total:number,roster:array(record({id:number,outLive:number,outGeki:number})),supports:array(record({id:number,lv:number,stage:number})),ranks:{type:'record',values:number},items:{type:'record',values:{type:'choice',options:[number,{type:'string',enum:['absent']}]}}})};
  return {...payload,checksum:await digest(payload)};
}
