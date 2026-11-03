import { syntheticCatalog } from './synthetic';
/** Invented categories and overlapping memberships, unrelated to any source master. */
export function skillCategoryFixture() {
  const m=syntheticCatalog();
  m.skillCategories=[{id:91,kind:'live',name:'架空の紙'},{id:92,kind:'live',name:'架空の墨'},{id:93,kind:'gekisou',name:'架空の風'},{id:94,kind:'gekisou',name:'架空の雲'},{id:95,kind:'support',name:'架空の星'},{id:96,kind:'support',name:'架空の月'},{id:97,kind:'gekisouSupport',name:'架空の森'},{id:98,kind:'gekisouSupport',name:'架空の海'}];
  m.members=Array.from({length:4},(_,i)=>({...m.members[0]!,id:8401+i,...(i===3?{}:{liveSkillCategoryIds:i===0?[91,92]:[i===1?91:92],gekisouSkillCategoryIds:[i===1?94:93]})}));
  m.snaps=Array.from({length:4},(_,i)=>({...m.snaps[0]!,id:8501+i,...(i===3?{}:{supportSkillCategoryIds:i===0?[95,96]:[i===1?95:96],gekisouSupportSkillCategoryIds:[i===1?98:97]})}));
  return m;
}
