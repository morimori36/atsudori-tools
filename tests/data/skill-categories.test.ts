import { expect,it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import schema from '../../public/schemas/catalog-v1.schema.json';
import { importCatalog,exportCatalog,validateCatalog } from '../../src/data/catalog/validate';
import { syntheticCatalog,syntheticCollection } from '../helpers/synthetic';
import { skillCategoryFixture } from '../helpers/skill-categories';
import { evaluateCollection } from '../../src/app/evaluate-collection';
const structural=new Ajv2020({strict:true}).compile(schema);
it('round trips optional categories and leaves old catalogs and numeric evaluation intact',()=>{
  const m=skillCategoryFixture(),old=syntheticCatalog();
  expect(importCatalog(exportCatalog(m))).toEqual(m);expect(structural(m)).toBe(true);
  expect(importCatalog(exportCatalog(old))).toEqual(old);
  const c=syntheticCollection(m);c.members[0]!.cardId=8401;
  const before=evaluateCollection(m,c);
  delete m.skillCategories;for(const row of m.members){delete row.liveSkillCategoryIds;delete row.gekisouSkillCategoryIds;}for(const row of m.snaps){delete row.supportSkillCategoryIds;delete row.gekisouSupportSkillCategoryIds;}
  expect(evaluateCollection(m,c)).toEqual(before);
});
it.each(['missing','wrong-kind','duplicate-id','duplicate-ref','invalid-kind','empty-refs'] as const)('rejects %s without inferring categories',kind=>{
  const m=skillCategoryFixture();
  if(kind==='missing')delete m.skillCategories;
  if(kind==='wrong-kind')m.members[0]!.liveSkillCategoryIds=[95];
  if(kind==='duplicate-id')m.skillCategories!.push({...m.skillCategories![0]!});
  if(kind==='duplicate-ref')m.snaps[0]!.supportSkillCategoryIds=[95,95];
  if(kind==='invalid-kind')(m.skillCategories![0] as unknown as {kind:string}).kind='unknown';
  if(kind==='empty-refs')m.members[0]!.liveSkillCategoryIds=[];
  expect(()=>importCatalog(JSON.stringify(m))).toThrow();
  if(['duplicate-ref','invalid-kind','empty-refs'].includes(kind)){expect(structural(m)).toBe(false);expect(()=>validateCatalog(m)).toThrow();}
});
