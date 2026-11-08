const int = { type:'integer', minimum:0, maximum:Number.MAX_SAFE_INTEGER };
const positive = { ...int, minimum:1 };
const text = { type:'string', minLength:1, maxLength:200, pattern:'\\S' };
const id = { type:'string', pattern:'^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$', not:{enum:['__proto__','prototype','constructor']} };
const date = { type:'string', pattern:'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' };
const instant = { type:'string', pattern:'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' };
const enumeration = (values: readonly string[]) => ({ enum:values });
const nullable = (s:unknown) => ({anyOf:[s,{type:'null'}]});
const array = (items:unknown,maxItems=1000) => ({type:'array',maxItems,items});
const object = (properties:Record<string,unknown>, required=Object.keys(properties)) => ({type:'object',additionalProperties:false,properties,required});
const ratio = object({numerator:int,denominator:positive});
const amount = object({resourceId:id,quantity:int});
const grant = object({resourceId:id,quantity:int,destination:enumeration(['inventory','direct','entitlement'])});
const unavailable = object({reason:text,resourceIds:array(id),destination:enumeration(['inventory','direct','entitlement'])},['reason','resourceIds']);
const rewards = object({fixed:array(grant),lotteries:array(object({draws:ratio,totalWeight:positive,
  outcomes:array(object({weight:positive,rewards:array(grant)}))})),unavailable:array(unavailable)});
const reset = object({kind:enumeration(['once','daily','weekly','monthly']),hour:{...int,maximum:23},
  weekday:{...int,maximum:6},day:{...positive,maximum:28}},['kind','hour']);
const window = object({startsAt:instant,endsAt:instant});
const named = {id,name:text,basis:text};
export const supplyDefinitionSchema = object({catalogRevision:id,revision:id,basis:text,
  utcOffsetMinutes:{type:'integer',minimum:-840,maximum:840},currencies:array(id),
  lives:array(object({...named,mode:enumeration(['play','skip']),scoreRank:text,lbMultiplier:positive,perLb:rewards,perPlay:rewards})),
  studios:array(object({bandId:positive,level:positive,tickMinutes:positive,rewardScale:ratio,normalMinutes:int,capMinutes:nullable(int),
    overflowRate:nullable(ratio),rounding:nullable(enumeration(['claim','tick'])),lotteryRounding:nullable(enumeration(['floor','fractional'])),rewards,basis:text})),
  ranks:array(object({rank:positive,studioMultiplier:nullable(ratio),daily:nullable(rewards)})),
  events:array(object({...named,startsAt:instant,endsAt:instant,milestones:array(object({points:int,excludeOnFullCollection:{type:'boolean'},rewards})),
    repeat:nullable(object({startsAfter:int,everyPoints:positive,rewards}))})),
  offers:array(object({...named,scope:enumeration(['catalog','seal','event','other']),eventId:id,minimumRank:nullable(positive),
    costs:array(amount),rewards,limit:nullable(positive),reset,window:nullable(window)},
    [...Object.keys(named),'scope','minimumRank','costs','rewards','limit','reset','window'])),
  passes:array(object({...named,durationDays:{...positive,maximum:3660},priceYen:int,purchase:rewards,daily:rewards,
    weekly:rewards,weeklyReset:nullable(reset),eventDaily:rewards,features:array(text)})),
  fixedSources:array(object({...named,category:enumeration(['permanent','oneTime','paid']),reset,window:nullable(window),rewards,priceYen:int})),
  unavailable:array(unavailable),eventCoverage:window
},['catalogRevision','revision','basis','utcOffsetMinutes','currencies','lives','studios','ranks','events','offers','passes','fixedSources','unavailable']);
export const economyScenarioSchema = {
  $schema:'https://json-schema.org/draft/2020-12/schema',
  title:'Economy scenario v1',
  ...object({format:{const:'atsudori-tools/economy-scenario'},schemaVersion:{const:1},catalogId:id,
    startDate:date,endDate:date,rank:nullable(positive),
    live:object({enabled:{type:'boolean'},lbPerDay:int,skipPercent:{...int,maximum:100},playId:nullable(id),skipId:nullable(id),playsPerDay:nullable(int),skipsPerDay:nullable(int)}),
    studio:object({enabled:{type:'boolean'},levels:array(object({bandId:positive,level:positive})),
      claimEveryMinutes:{...positive,maximum:5270400},minutesPerDay:{...int,maximum:1440}}),
    dailyClaims:int,
    events:array(object({eventId:id,claimDate:date,points:nullable(int),fullCollection:{type:'boolean'},buyLimited:{type:'boolean'}})),
    purchases:array(object({offerId:id,quantity:int,alreadyPurchased:int})),
    pass:nullable(object({passId:id,startsOn:date,claimDates:array(date,3660)})),
    fixedSources:array(object({sourceId:id,claims:int})),
    externalIncome:array(object({id,name:text,date,amounts:array(amount)})),
    allocations:array(object({id,name:text,date,purpose:enumeration(['gacha','lb','reserve','other']),costs:array(amount)}))
  })
};
