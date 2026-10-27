// Color identifiers and labels are part of this application's catalog contract.
const accents = ['#c74355','#347cb0','#32836a','#a67a1a','#8660b6'];
const names: Record<number, string> = { 1: '紅赤', 2: '紺碧', 3: '翡翠', 4: '山吹', 5: '紫苑' };
export const cardTypeName = (id: number): string => names[id] ?? '色 ' + id;
export const cardTypeAccent = (id: number): string => accents[(id - 1) % accents.length] ?? '#6d6e81';

