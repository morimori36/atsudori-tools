import {expect,it} from 'vitest';
import {maximumAssignment} from '../../src/domain/selection/maximum-assignment';

it('matches an independent exhaustive oracle including forbidden edges and ties',()=>{
  let seed=37;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed;};
  for(let trial=0;trial<150;trial++) {
    const n=1+random()%4, s=random()%5;
    const matrix=Array.from({length:n},()=>[...Array.from({length:s},()=>random()%4===0 ? null : random()%9),...Array<number>(n).fill(2)]);
    let best=-1, expected:number[]=[];
    const visit=(row:number,cols:number[],total:number)=>{
      if(row===n) {if(total>best){best=total;expected=[...cols];}return;}
      matrix[row]!.forEach((value,col)=>{if(value!==null && !cols.includes(col))visit(row+1,[...cols,col],total+value);});
    };
    visit(0,[],0);
    expect(maximumAssignment(matrix)).toEqual(expected);
  }
});
it('handles thousands of candidates without enumerating combinations',()=>{
  const matrix=Array.from({length:18},(_,i)=>[...Array.from({length:2000},(_,j)=>j===i ? 1000 : 1),...Array<number>(18).fill(0)]);
  expect(maximumAssignment(matrix)).toEqual(Array.from({length:18},(_,i)=>i));
});
