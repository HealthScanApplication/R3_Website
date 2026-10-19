/*
 * Families for nutrients and hazards, and the farm-to-plate stage where each hazard typically enters food.
 *
 * Catalog rows carry only keys (`vitamin_d_mcg`, `glyphosate`, `bisphenol_a`), not a family or provenance,
 * so these are classifications of the substance, not traced history: a stage says where that kind of
 * hazard usually comes from (pesticides are sprayed on the farm, bisphenols migrate from packaging), not
 * where a particular ingredient picked it up. Unknown keys fall to 'other' rather than being guessed.
 */
import { WALLACH_MEMBERS } from './recipeNutrients';

/* ── nutrients ── */
export type NutrientFamily = 'macros' | 'fibre' | 'vitamins' | 'minerals' | 'fatty_acids' | 'amino_acids' | 'phytonutrients' | 'other';
export const NUTRIENT_FAMILIES: Array<{ id: NutrientFamily; label: string }> = [
  { id: 'macros', label: 'Energy & macros' },
  { id: 'fibre', label: 'Fibre' },
  { id: 'vitamins', label: 'Vitamins' },
  { id: 'minerals', label: 'Minerals' },
  { id: 'fatty_acids', label: 'Fatty acids' },
  { id: 'amino_acids', label: 'Amino acids' },
  { id: 'phytonutrients', label: 'Phytonutrients' },
  { id: 'other', label: 'Other' },
];

// The historical Essential 90 manifest already groups its members; that grouping wins.
const WALLACH_GROUP: Record<string, NutrientFamily> = { minerals: 'minerals', vitamins: 'vitamins', amino_acids: 'amino_acids', fatty_acids: 'fatty_acids' };
const WALLACH_FAMILY = new Map(WALLACH_MEMBERS.map((m) => [m.key, WALLACH_GROUP[m.group]]));

const NUTRIENT_RULES: Array<[NutrientFamily, RegExp]> = [
  ['fibre', /^(fib(er|re)|soluble_fib|insoluble_fib)/],
  ['macros', /^(energy|calories|protein|carb|fats?_|sugars?_|saturated_fat|trans_fat|salt_|alcohol|water_g|starch)/],
  ['vitamins', /^(vitamin_|folate|folic|thiamin|riboflavin|niacin|pantothen|biotin|choline|pyridox|cobalamin|retinol|tocopher)/],
  ['fatty_acids', /^(omega|dha|epa|ala_|linole|linolen|arachidon|gla_|monounsat|polyunsat|fatty)/],
  ['amino_acids', /^(histidine|isoleucine|leucine|lysine|methionine|phenylalanine|threonine|tryptophan|valine|arginine|cyste?ine|tyrosine|glycine|alanine|serine|proline|glutam|asparag|aspartic|taurine|carnitine)/],
  ['minerals', /^(iron|calcium|magnesium|zinc|potassium|iodine|phosphorus|selenium|copper|manganese|chromium|molybdenum|sodium|chlori(de|ne)|fluori|boron|silicon|vanadium|cobalt|nickel|lithium|germanium|strontium|sulfur|sulphur|tin_)/],
  ['phytonutrients', /^(beta_carotene|alpha_carotene|lutein|lycopene|zeaxanthin|coq10|polyphenol|flavon|resveratrol|quercetin|anthocyan|curcumin|catechin)/],
];

export function nutrientFamily(key: string): NutrientFamily {
  const k = key.toLowerCase();
  const fromManifest = WALLACH_FAMILY.get(k);
  if (fromManifest) return fromManifest;
  return NUTRIENT_RULES.find(([, re]) => re.test(k))?.[0] ?? 'other';
}

/* ── hazards ── */
export type HazardFamily = 'heavy_metals' | 'radionuclides' | 'pesticides' | 'drug_residues' | 'plastics' | 'pollutants' | 'water_treatment' | 'nitrates' | 'mycotoxins' | 'pathogens' | 'process' | 'natural' | 'additives' | 'limits' | 'other';
export const HAZARD_FAMILIES: Array<{ id: HazardFamily; label: string }> = [
  { id: 'heavy_metals', label: 'Heavy metals' },
  { id: 'radionuclides', label: 'Radioactive elements' },
  { id: 'pesticides', label: 'Pesticides' },
  { id: 'drug_residues', label: 'Drug & hormone residues' },
  { id: 'plastics', label: 'Plastics & packaging chemicals' },
  { id: 'pollutants', label: 'Industrial pollutants' },
  { id: 'water_treatment', label: 'Water-treatment by-products' },
  { id: 'nitrates', label: 'Nitrates & nitrites' },
  { id: 'mycotoxins', label: 'Mould toxins' },
  { id: 'pathogens', label: 'Pathogens' },
  { id: 'process', label: 'Cooking & processing contaminants' },
  { id: 'natural', label: 'Natural plant compounds' },
  { id: 'additives', label: 'Additives' },
  { id: 'limits', label: 'Nutrients to limit' },
  { id: 'other', label: 'Other' },
];

// Exact keys seen in catalog_ingredients.elements_hazardous (Oct 2026), then patterns for new ones.
const HAZARD_KEYS: Record<string, HazardFamily> = {
  lead: 'heavy_metals', cadmium: 'heavy_metals', arsenic: 'heavy_metals', inorganic_arsenic: 'heavy_metals', mercury: 'heavy_metals', uranium: 'heavy_metals', chromium_vi: 'heavy_metals', aluminum: 'heavy_metals', aluminium: 'heavy_metals',
  radium_226_228: 'radionuclides',
  glyphosate: 'pesticides', atrazine: 'pesticides', ddt: 'pesticides',
  antibiotics: 'drug_residues', tetracycline: 'drug_residues', estrone: 'drug_residues', estradiol_e2: 'drug_residues', ethinylestradiol: 'drug_residues',
  microplastics: 'plastics', pfas: 'plastics', pfoa: 'plastics', pfos: 'plastics', dehp: 'plastics', bisphenol_a: 'plastics',
  dioxins_tcdd: 'pollutants', pcbs: 'pollutants', perchlorate: 'pollutants',
  bromate: 'water_treatment', haloacetic_acids: 'water_treatment', free_chlorine: 'water_treatment', total_trihalomethanes: 'water_treatment', chloramine: 'water_treatment',
  nitrate_water: 'nitrates', sodium_nitrite: 'nitrates', sodium_nitrate: 'nitrates',
  acrylamide: 'process', '3_mcpd_esters': 'process', '3_mcpd_free': 'process', glycidyl_esters: 'process', pahs: 'process', benzo_a_pyrene: 'process', nitrosamines: 'process', hcas: 'process',
  oxalates: 'natural', phytates: 'natural', lectins: 'natural', tannins: 'natural', saponins: 'natural', solanine: 'natural', goitrogens: 'natural', hydrocyanic_acid: 'natural', pyrrolizidine_alkaloids: 'natural', erucic_acid: 'natural', caffeine: 'natural', theobromine: 'natural', delta9_thc: 'natural',
  sugar_family: 'limits', sugar: 'limits', fat_family: 'limits', fiber_family: 'limits', carbohydrate_total: 'limits', sodium_excess_intake: 'limits', vitamin_d_excess_intake: 'limits', ethanol: 'limits', high_fructose_corn_syrup: 'limits',
};
const HAZARD_RULES: Array<[HazardFamily, RegExp]> = [
  // Named drugs only: a key ending in _water (salmonella_water) must still reach its own substance rule.
  ['drug_residues', /atenolol|ibuprofen|metformin|diclofenac|fluoxetine|carbamazepine|sulfamethoxazole|amoxicillin|ciprofloxacin|paracetamol|acetaminophen|naproxen|antibiotic|cycline|estr(one|adiol|iol)|hormone/],
  ['pathogens', /salmonella|listeria|e_coli|campylobacter|virus|vibrio|yersinia|cyclospora|anisakis|toxoplasma|clostridium|bacillus|staphylococ/],
  ['mycotoxins', /aflatoxin|ochratoxin|nivalenol|zearalenone|fumonisin|patulin|ergot|t_2_toxin|citrinin/],
  ['plastics', /plastic|pfa[a-z]|pfo[as]|phthalate|dehp|bisphenol/],
  ['heavy_metals', /^(lead|cadmium|arsenic|mercury|nickel|thallium|antimony|chromium_vi)/],
  ['pesticides', /pesticide|herbicide|fungicide|insecticide|chlorpyrifos|organophosph|neonicotin|glyphosate|atrazine/],
  ['nitrates', /nitr(ate|ite)/],
  ['process', /acrylamide|mcpd|glycidyl|pahs?$|benzo_a_pyrene|furan|nitrosamine|hcas?$/],
  ['limits', /_excess_intake$|_family$/],
  ['additives', /^e\d{3}|_e\d{3}|benzoate|sulfite|sulphite|sulfur_dioxide|carrageenan|_gum$|sucralose|aspartame|acesulfame|maltitol|sorbitol|stevi|phosphates?$|tartrazine|sunset_yellow|allura|carmine|starch|lecithin|pectin|ascorb|tartar|malic|citric|esters_of|rosemary_extract|curcumin|lutein_e/],
];

export function hazardFamily(key: string): HazardFamily {
  const k = key.toLowerCase();
  return HAZARD_KEYS[k] ?? HAZARD_RULES.find(([, re]) => re.test(k))?.[0] ?? 'other';
}

/* ── farm to plate ── */
export type FoodStage = 'in_food' | 'soil_water' | 'farm' | 'storage' | 'handling' | 'processing' | 'water_treatment' | 'packaging' | 'unknown';
/** Ordered from the field to the plate; `note` is the one-line "how it gets in". */
export const FOOD_STAGES: Array<{ id: FoodStage; label: string; note: string }> = [
  { id: 'in_food', label: 'In the food itself', note: 'Made by the plant or part of the food; the amount eaten is what matters.' },
  { id: 'soil_water', label: 'Soil, water & air', note: 'Taken up from soil, irrigation or drinking water, or settled from pollution.' },
  { id: 'farm', label: 'Farm sprays & medicines', note: 'Sprayed on crops or given to animals, leaving residues.' },
  { id: 'storage', label: 'Harvest & storage', note: 'Mould growing on grains, nuts and fruit in damp storage.' },
  { id: 'handling', label: 'Handling & hygiene', note: 'Picked up from contaminated water, surfaces or hands, or undercooking.' },
  { id: 'processing', label: 'Processing & cooking', note: 'Formed by high-heat cooking, refining or curing, or added as an ingredient.' },
  { id: 'water_treatment', label: 'Water treatment', note: 'By-products of disinfecting drinking water.' },
  { id: 'packaging', label: 'Packaging', note: 'Migrates from plastics, can linings and wrappers into the food.' },
  { id: 'unknown', label: 'Route not classified', note: 'No typical route recorded for this hazard yet.' },
];
const FAMILY_STAGE: Record<HazardFamily, FoodStage> = {
  natural: 'in_food', limits: 'in_food',
  heavy_metals: 'soil_water', radionuclides: 'soil_water', pollutants: 'soil_water', drug_residues: 'soil_water',
  pesticides: 'farm',
  mycotoxins: 'storage',
  pathogens: 'handling',
  process: 'processing', additives: 'processing', nitrates: 'processing',
  water_treatment: 'water_treatment',
  plastics: 'packaging',
  other: 'unknown',
};
// Same family, different route: nitrate in water comes from fertiliser run-off, not curing;
// veterinary antibiotics are given on the farm, unlike drug residues found in water;
// high-fructose corn syrup is a nutrient to limit, but it is added in processing, not made by the plant.
const STAGE_KEYS: Record<string, FoodStage> = { nitrate_water: 'soil_water', antibiotics: 'farm', tetracycline: 'farm', high_fructose_corn_syrup: 'processing' };

export function hazardStage(key: string): FoodStage {
  const k = key.toLowerCase();
  return STAGE_KEYS[k] ?? FAMILY_STAGE[hazardFamily(k)];
}

/** Group items by a classifier, in the given order, dropping empty groups. */
export function groupBy<T, G extends string>(items: T[], classify: (item: T) => G, order: Array<{ id: G }>): Array<{ id: G; items: T[] }> {
  const buckets = new Map<G, T[]>();
  for (const item of items) { const g = classify(item); buckets.set(g, [...(buckets.get(g) || []), item]); }
  return order.filter((o) => buckets.has(o.id)).map((o) => ({ id: o.id, items: buckets.get(o.id)! }));
}
