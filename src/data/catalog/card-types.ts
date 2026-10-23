// Color identifiers come from user data. Labels are neutral and contain no masterdata join.
const accents = ['#c74355','#347cb0','#32836a','#a67a1a','#8660b6'];
export const cardTypeName = (id: number): string => '色 ' + id;
export const cardTypeAccent = (id: number): string => accents[(id - 1) % accents.length] ?? '#6d6e81';
