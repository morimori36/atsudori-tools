import type {SealBudgetDefinition} from '../../src/domain/seal-budget/model';
/** Independent synthetic rates and costs; not derived from game records. */
export function sealDefinition():SealBudgetDefinition {
 const base={draws:1,periodDays:1,memberProbabilityBp:2000,snapProbabilityBp:3000,otherProbabilityBp:5000,memberSeals:10,snapSeals:20,pointsPerDraw:2,sealsPerPoint:7,paidStarsPerDraw:0};
 return {version:1,revision:'test-1',gachas:[{...base,id:'cm',name:'架空の日次抽選',draws:4},{...base,id:'pass',name:'架空の週次抽選',periodDays:7,memberProbabilityBp:0,snapProbabilityBp:0,otherProbabilityBp:10000,pointsPerDraw:0},{...base,id:'paid',name:'架空の有償抽選',paidStarsPerDraw:8}],products:[{id:'fictional-paper',name:'架空の紙',tiers:[{sealCost:11,monthlyLimit:3},{sealCost:17,monthlyLimit:2}]}]};
}
