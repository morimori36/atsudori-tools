import type { Reset } from './model';
export const DAY = 86400000;
export function dateValue(date:string):number {
  const value=Date.parse(date+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(value)||new Date(value).toISOString().slice(0,10)!==date)throw new Error('日付が不正です');
  return value;
}
export function localDate(at:number,offset:number):string {return new Date(at+offset*60000).toISOString().slice(0,10);}
export function startOfDate(date:string,offset:number):number {return dateValue(date)-offset*60000;}
export function period(startDate:string,endDate:string,offset:number) {
  const start=startOfDate(startDate,offset),end=startOfDate(endDate,offset)+DAY;
  const days=(end-start)/DAY;
  if(days<1||days>3660)throw new Error('試算期間は1〜3660日で指定してください');
  return {start,end,days};
}
/** Includes the current reset window once, then real boundaries in [start,end). */
export function opportunities(start:number,end:number,rule:Reset,offset:number):number[] {
  if(start>=end)return [];
  const result=[start];
  const shifted=start+offset*60000;
  let day=Math.floor(shifted/DAY)*DAY;
  for(;day-offset*60000<end;day+=DAY){
    const d=new Date(day),at=day+rule.hour*3600000-offset*60000;
    if(at<=start||at>=end)continue;
    if(rule.kind==='weekly'&&d.getUTCDay()!==rule.weekday)continue;
    if(rule.kind==='monthly'&&d.getUTCDate()!==rule.day)continue;
    result.push(at);
  }
  return result;
}
