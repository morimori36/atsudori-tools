import { expect,test } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import { resourcesForDisplay } from '../../src/ui/resource-order';
import { importCatalog,exportCatalog } from '../../src/data/catalog/validate';
import { inventoryFixture } from '../helpers/inventory';
const schema=JSON.parse(readFileSync('public/schemas/catalog-v1.schema.json','utf8'));
const valid=new Ajv2020().compile(schema);
test('optional resource order round trips; ties and missing values retain catalog order without mutation',()=>{
  const {m}=inventoryFixture(),resources=m.materialDefinition!.resources;
  resources.find(r=>r.id==='paper')!.displayOrder=8;
  resources.find(r=>r.id==='copy')!.displayOrder=0;
  resources.find(r=>r.id==='retired')!.displayOrder=8;
  const before=JSON.stringify(m);
  expect(valid(m)).toBe(true);
  expect(importCatalog(exportCatalog(m))).toEqual(m);
  expect(resourcesForDisplay(resources).map(r=>r.id)).toEqual(['paper','retired','copy','member-exp','snap-exp']);
  expect(JSON.stringify(m)).toBe(before);
  resources.forEach(r=>delete r.displayOrder);
  expect(importCatalog(exportCatalog(m))).toEqual(m);
  expect(resourcesForDisplay(resources).map(r=>r.id)).toEqual(['paper','retired','copy','member-exp','snap-exp']);
});
for(const displayOrder of [-1,0.5,9007199254740992,null,'2'])test(`rejects invalid resource order ${displayOrder}`,()=>{
  const {m}=inventoryFixture();Object.assign(m.materialDefinition!.resources[0]!,{displayOrder});
  expect(valid(m)).toBe(false);expect(()=>importCatalog(JSON.stringify(m))).toThrow();
});
