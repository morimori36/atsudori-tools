import {expect, it, vi} from 'vitest';
import {createSealBudgetView} from '../../src/ui/seal-budget';
import {sealDefinition} from '../helpers/seal-budget';
import {syntheticCatalog, syntheticCollection} from '../helpers/synthetic';
import {defaultStarBudgetScenario} from '../../src/domain/star-budget/model';

// Minimal DOM port: retain rendered text and dispatch real view change handlers.
function setup() {
 const master = {...syntheticCatalog(), sealBudgetDefinition: sealDefinition()};
 master.sealBudgetDefinition.planBenefits!.premium.passGachas = [{gachaId: 'event', draws: 1, periodDays: 1, poolId: 'ordinary'}];
 const collection = syntheticCollection(master);
 collection.starBudgetScenario = {...defaultStarBudgetScenario(), passPlan: 'premium'};
 collection.sealBudgetScenario = {cm: false, pass: false, paid: 0, event: 0, eventFree: true, selectedProducts: []};
 const state = {master, collection, protected: false, unsaved: false, message: ''};
 const nodes = new Map<string, {innerHTML: string; textContent: string; hidden: boolean; classList: {toggle: ReturnType<typeof vi.fn>}}>();
 const node = (key: string) => {
  if (!nodes.has(key)) {
   let content = '';
   nodes.set(key, {get innerHTML() {return content;}, set innerHTML(v) {content = v;},
    get textContent() {return content;}, set textContent(v) {content = v;}, hidden: false, classList: {toggle: vi.fn()}});
  }
  return nodes.get(key)!;
 };
 const handlers = new Map<string, () => void>();
 const form = {addEventListener: (name: string, fn: () => void) => handlers.set(name, fn),
  elements: {namedItem: (name: string) => ({checked: false, value: name === 'passPlan' ? 'premium' : '0'})}, querySelectorAll: () => []};
 const host = {innerHTML: '', querySelector: (key: string) => key === 'form' ? form : node(key),
  querySelectorAll: (selectors: string) => [...nodes].filter(([key]) => selectors.split(', ').some(selector => key.startsWith(selector.slice(0, -1)))).map(([, value]) => value)};
 let protectOnSave = false;
 createSealBudgetView(() => state, () => {state.protected = protectOnSave; return false;}, () => {}).mount(host as unknown as HTMLElement);
 return {state, node, protect: () => {protectOnSave = true;}, refresh: () => handlers.get('change')!()};
}

it.each(['error', 'protected'] as const)('clears free contributions after successful rendering on %s', mode => {
 const {state, node, refresh, protect} = setup();
 expect(node('[data-seal-free-contribution="event"]').innerHTML).toContain('<strong>');
 if (mode === 'protected') protect();
 else state.master.sealBudgetDefinition!.version = 2 as 3;
 refresh();
 expect(node('[data-seal-results]').innerHTML).toContain(mode === 'protected' ? '復旧後' : 'role="alert"');
 expect(node('[data-seal-free-contribution="event"]').textContent).toBe('');
 expect(node('[data-seal-contribution="event"]').textContent).toBe('');
});

it('judges paid and free event selection independently of combined draws', () => {
 const {state, node, refresh} = setup();
 const paid = () => node('[data-seal-contribution="event"]').innerHTML;
 const free = () => node('[data-seal-free-contribution="event"]').innerHTML;
 expect(paid()).toContain('<strong>0</strong>');
 expect(paid()).toContain('未選択');
 expect(free()).not.toContain('未選択');
 expect(free()).not.toContain('<strong>0</strong>');
 state.collection.sealBudgetScenario!.event = 1;
 refresh();
 expect(paid()).not.toContain('未選択');
 state.collection.sealBudgetScenario!.eventFree = false;
 refresh();
 expect(paid()).not.toContain('未選択');
 expect(free()).toContain('未選択');
 state.collection.sealBudgetScenario!.event = 0;
 refresh();
 expect(paid()).toContain('未選択');
 expect(free()).toContain('未選択');
});
