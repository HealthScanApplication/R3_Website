import { expect, it } from 'vitest';
import { dietSupportItems, reviewDiet, type DietConfig, type MealPick } from '../protocolBuilders';
import { planWeek, type Candidate } from '../dietPlanner';
const meal: MealPick = { source:'catalog', id:'r1', name:'Lentil bowl', image:null, nutrition:{ energy_kcal:500, protein_g:20, carbohydrates_g:60, fats_g:15 } };
const cfg = (patch: Partial<DietConfig> = {}): DietConfig => ({ framework:'balanced', kcal:2000, protein:20, carbs:50, fat:30, slots:['breakfast'], plan:{ '1:breakfast':meal }, drinks:{ breakfast:[] }, fasting:{ type:'intermittent', start:'20:00', end:'12:00', days:[1,2,3,4,5,6,7] }, ...patch });
const fastingConflict = (c: DietConfig) => reviewDiet(c).conflicts.some(c => c.rule === 'Fasting window');
it.each([['11:59',true],['12:00',false],['19:59',false],['20:00',true]])('flags meals at %s with inclusive start/exclusive end', (time,want) => {
  expect(fastingConflict(cfg({ timing:{ breakfast:{ anchor:'clock',time,offset:0 } } }))).toBe(want);
});
it('carries a Sunday-started overnight fast into Monday, not unrelated days', () => {
  const c = cfg({ fasting:{ type:'intermittent',start:'20:00',end:'12:00',days:[7] } });
  expect(fastingConflict(c)).toBe(true);
  expect(fastingConflict({ ...c,plan:{ '7:breakfast':meal } })).toBe(false);
  expect(fastingConflict({ ...c,plan:{ '2:breakfast':meal } })).toBe(false);
});
it('keeps existing food as a conflict but never auto-fills fasting slots', () => {
  const candidate: Candidate = { ...meal, healthScore:90, tags:[], mealSlot:'breakfast', micros:{},hazards:[],ingredientIds:[] };
  const c = cfg({ plan:{} });
  expect(Object.values(planWeek(c,[candidate],15).plan).filter(Boolean)).toHaveLength(0);
  expect(planWeek(cfg(),[candidate],15).plan['1:breakfast']).toEqual(meal);
});
it('does not shade Daniel fast as no-food time', () => {
  expect(fastingConflict(cfg({ fasting:{ type:'daniel',start:'00:00',end:'23:59',days:[1] } }))).toBe(false);
});
it('allows plain water during water fasting but flags other drinks; dry fasting flags water too', () => {
  const c = cfg({ plan:{},drinkPlan:{ '1:breakfast':[{ ...meal,name:'Water' }] },fasting:{ type:'water',start:'00:00',end:'00:00',days:[1],fullDay:true } as any });
  expect(fastingConflict(c)).toBe(false);
  expect(fastingConflict({ ...c,drinkPlan:{ '1:breakfast':[{ ...meal,name:'Orange juice' }] } })).toBe(true);
  expect(fastingConflict({ ...c,fasting:{ ...c.fasting!,type:'dry' } })).toBe(true);
});
it('schedules a full-day fast from midnight to the next midnight', () => {
  const items = dietSupportItems(cfg({ fasting:{ type:'water',start:'20:00',end:'12:00',days:[7],fullDay:true } as any }));
  expect(items).toMatchObject([{ time:'00:00',days:[0] },{ time:'00:00',days:[1] }]);
});
it('preserves legacy daily supplements and respects empty day overrides and per-day times', () => {
  const c = cfg({ fasting:undefined,supplements:{ morning:['Zinc'] },supplementPlan:{ '1:morning':{items:[],time:'08:00'},'2:morning':{items:[{ id:'d3',source:'product',name:'D3',image:null }],time:'09:15'} } as any });
  expect(dietSupportItems(c)).toEqual(expect.arrayContaining([
    expect.objectContaining({ title:'Take D3',time:'09:15',days:[2],link:expect.objectContaining({catalog_product_id:'d3'}) }),
    expect.objectContaining({ title:'Take Zinc',days:[3,4,5,6,0] }),
  ]));
  expect(dietSupportItems(cfg({ fasting:undefined,supplements:{ morning:['Zinc'] } }))[0].days).toBeNull();
});
it('blocks invalid fasting times instead of saving a misleading schedule', () => {
  expect(reviewDiet(cfg({ fasting:{ type:'intermittent',start:'20:00',end:'20:00',days:[1] } })).blocking.length).toBeGreaterThan(0);
});
it('does not silently collapse repeated legacy supplement checklist entries', () => {
  expect(dietSupportItems(cfg({fasting:undefined,supplements:{morning:['Zinc','Zinc']}}))).toHaveLength(2);
});
it('names the weekday in a fasting-window conflict', () => {
  const c = cfg({ timing:{ breakfast:{ anchor:'clock',time:'08:00',offset:0 } } });
  expect(reviewDiet(c).conflicts.find(x => x.rule === 'Fasting window')?.where).toBe('Mon Breakfast');
});
