import { syntheticCatalog, syntheticCollection } from './synthetic';
import { starBudgetFixture } from './star-budget';

/** Independent arithmetic fixture, shared by review images and UI tests only. */
export function starBudgetReviewFixture() {
  const master = syntheticCatalog();
  const input = starBudgetFixture();
  const names = ['紙のしずく', '紙のかけら', '譜面券A', '譜面券B', '譜面券C', '譜面券D', 'SRピース・架空バンド甲', 'SRピース・架空バンド乙', 'SRピース・架空バンド丙', 'SRピース・架空バンド丁', 'SRピース・架空バンド戊'];
  input.definition.products.forEach((product, index) => { product.name = names[index]!; });
  master.starBudgetDefinition = {...input.definition, revision:master.revision};
  const {rank, ...starBudgetScenario} = input.scenario;
  const collection = {...syntheticCollection(master), tgwRank:rank!, starBudgetScenario};
  return {master, collection};
}
