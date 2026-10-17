import { describe, expect, it } from 'vitest';
import { FOOD_STAGES, HAZARD_FAMILIES, NUTRIENT_FAMILIES, groupBy, hazardFamily, hazardStage, nutrientFamily } from '../foodTaxonomy';
import { NUTRIENTS, WALLACH_MEMBERS } from '../recipeNutrients';

// Every key found in catalog_ingredients.elements_hazardous (1,770 rows, Oct 2026).
const CATALOG_HAZARD_KEYS = 'sugar_family lead cadmium arsenic microplastics oxalates perchlorate uranium pfas pfoa pfos bromate estrone chromium_vi estradiol_e2 nitrate_water atenolol_water ibuprofen_water metformin_water diclofenac_water ethinylestradiol fluoxetine_water haloacetic_acids carbamazepine_water sulfamethoxazole_water free_chlorine total_trihalomethanes glyphosate atrazine chloramine radium_226_228 amoxicillin_water ciprofloxacin_water phytates salmonella aflatoxin_b1 ochratoxin_a deoxynivalenol dioxins_tcdd dehp pcbs campylobacter_jejuni mercury listeria_monocytogenes tetracycline acrylamide erucic_acid sodium_benzoate sodium_metabisulfite 3_mcpd_esters pahs benzo_a_pyrene glycidyl_esters antibiotics zearalenone nitrosamines e_coli_o157_h7 sodium_excess_intake lectins tannins ergot_alkaloids norovirus hepatitis_a_virus pyrrolizidine_alkaloids hydrocyanic_acid sodium_nitrite ethanol t_2_toxin hcas goitrogens aflatoxin_m1 cyclospora_cayetanensis solanine yersinia_enterocolitica caffeine aluminum saponins fumonisin_b1 ddt phosphates bisphenol_a pectins patulin inorganic_arsenic lecithins 3_mcpd_free sulfur_dioxide high_fructose_corn_syrup delta9_thc fat_family fiber_family carbohydrate_total sugar modified_starches chloride_salts_e507_e511 salmonella_enteritidis malic_acid steviol_glycosides ascorbates_e300_e302 tartaric_acid_tartrates sodium_nitrate potassium_benzoate sucralose maltitol anisakis_simplex toxoplasma_gondii ascorbyl_palmitate lutein_e161b allura_red_ac vitamin_d_excess_intake carmine rosemary_extracts sucrose_esters_of_fatty_acids sunset_yellow vibrio_parahaemolyticus acacia_gum curcumin carrageenan theobromine guar_gum tartrazine'.split(' ');

describe('hazard families', () => {
  it('classifies every hazard key the catalog carries (nothing falls to other)', () => {
    expect(CATALOG_HAZARD_KEYS).toHaveLength(121);
    expect(CATALOG_HAZARD_KEYS.filter((k) => hazardFamily(k) === 'other')).toEqual([]);
  });
  it('puts well-known hazards in the expected family', () => {
    expect(hazardFamily('arsenic')).toBe('heavy_metals');
    expect(hazardFamily('glyphosate')).toBe('pesticides');
    expect(hazardFamily('bisphenol_a')).toBe('plastics');
    expect(hazardFamily('aflatoxin_b1')).toBe('mycotoxins');
    expect(hazardFamily('acrylamide')).toBe('process');
    expect(hazardFamily('listeria_monocytogenes')).toBe('pathogens');
    expect(hazardFamily('ibuprofen_water')).toBe('drug_residues');
    expect(hazardFamily('carrageenan')).toBe('additives');
  });
  it('classifies unseen keys by pattern, and truly unknown ones as other', () => {
    expect(hazardFamily('chlorpyrifos')).toBe('pesticides');
    expect(hazardFamily('aflatoxin_g2')).toBe('mycotoxins');
    expect(hazardFamily('dibutyl_phthalate')).toBe('plastics');
    expect(hazardFamily('mystery_compound')).toBe('other');
  });
  it('only treats named drugs in water as drug residues', () => {
    expect(hazardFamily('salmonella_water')).toBe('pathogens');
    expect(hazardStage('salmonella_water')).toBe('handling');
    expect(hazardFamily('naproxen_water')).toBe('drug_residues');
    expect(hazardFamily('unknown_water')).toBe('other');
    expect(hazardFamily('nitrate_water')).toBe('nitrates');
  });
});

describe('farm-to-plate stages', () => {
  it('places every catalog hazard on a known route', () => {
    expect(CATALOG_HAZARD_KEYS.filter((k) => hazardStage(k) === 'unknown')).toEqual([]);
  });
  it('follows the route each kind of hazard typically takes', () => {
    expect(hazardStage('glyphosate')).toBe('farm');          // sprayed on crops
    expect(hazardStage('microplastics')).toBe('packaging');  // plastics migrate from packaging
    expect(hazardStage('cadmium')).toBe('soil_water');
    expect(hazardStage('ochratoxin_a')).toBe('storage');
    expect(hazardStage('acrylamide')).toBe('processing');
    expect(hazardStage('total_trihalomethanes')).toBe('water_treatment');
    expect(hazardStage('oxalates')).toBe('in_food');
  });
  it('uses key-level routes where one family has two origins', () => {
    expect(hazardStage('nitrate_water')).toBe('soil_water'); // fertiliser run-off, not curing
    expect(hazardStage('sodium_nitrite')).toBe('processing');
    expect(hazardStage('antibiotics')).toBe('farm');         // veterinary use
    expect(hazardStage('ibuprofen_water')).toBe('soil_water');
    expect(hazardFamily('high_fructose_corn_syrup')).toBe('limits');
    expect(hazardStage('high_fructose_corn_syrup')).toBe('processing'); // added, not made by the plant
    expect(hazardStage('sugar_family')).toBe('in_food');
  });
  it('lists stages field to plate with a note for each', () => {
    expect(FOOD_STAGES.map((s) => s.id).slice(0, 3)).toEqual(['in_food', 'soil_water', 'farm']);
    expect(FOOD_STAGES.at(-2)?.id).toBe('packaging');
    expect(FOOD_STAGES.every((s) => s.note.length > 10)).toBe(true);
  });
});

describe('nutrient families', () => {
  it('uses the Essential 90 manifest grouping for its members', () => {
    const fam = { minerals: 'minerals', vitamins: 'vitamins', amino_acids: 'amino_acids', fatty_acids: 'fatty_acids' } as const;
    for (const m of WALLACH_MEMBERS) expect(nutrientFamily(m.key)).toBe(fam[m.group]);
  });
  it('classifies the panel macros and every app nutrient definition', () => {
    for (const k of ['energy_kcal', 'protein_g', 'carbohydrates_g', 'fats_g', 'sugars_g', 'saturated_fat_g', 'trans_fat_g', 'salt_g', 'alcohol_g']) expect(nutrientFamily(k)).toBe('macros');
    expect(nutrientFamily('fiber_g')).toBe('fibre');
    expect(NUTRIENTS.filter((n) => nutrientFamily(n.key) === 'other').map((n) => n.key)).toEqual([]);
    expect(nutrientFamily('vitamin_d_mcg')).toBe('vitamins');
    expect(nutrientFamily('folate_mcg')).toBe('vitamins');
    expect(nutrientFamily('iron_mg')).toBe('minerals');
    expect(nutrientFamily('omega_3_g')).toBe('fatty_acids');
    expect(nutrientFamily('leucine_g')).toBe('amino_acids');
    expect(nutrientFamily('lycopene_mg')).toBe('phytonutrients');
  });
});

describe('groupBy', () => {
  it('groups in the given order and drops empty groups', () => {
    const groups = groupBy(['iron_mg', 'vitamin_c_mg', 'zinc_mg'], nutrientFamily, NUTRIENT_FAMILIES);
    expect(groups.map((g) => [g.id, g.items])).toEqual([['vitamins', ['vitamin_c_mg']], ['minerals', ['iron_mg', 'zinc_mg']]]);
    expect(groupBy([], hazardFamily, HAZARD_FAMILIES)).toEqual([]);
  });
});
