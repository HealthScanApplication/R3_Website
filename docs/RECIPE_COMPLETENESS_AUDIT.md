# Recipe completeness audit

Audit run: 2026-10-23 against the public staging catalog.

## Strict standard

A recipe is complete only when it has full descriptive and planning metadata, at
least two cooking steps, at least two declared ingredients, and a one-to-one
ingredient junction for every declared ingredient. Every junction must contain a
positive gram weight and point to an ingredient with macro nutrition and nutrient
junctions. Recipe nutrition is calculated from those junctions rather than copied
from prose or an external recipe card.

## Baseline result

- Recipes scanned: 3,197
- Passing the strict standard: 331
- Requiring remediation: 2,866

The most frequent legacy gaps were technical descriptions (2,041), preparation
times (1,994), cooking times (1,994), difficulty (1,976), fewer than two declared
ingredients (1,866), simple descriptions (1,757), taste profiles (1,708), fewer
than two cooking steps (1,682), and junctions without gram weights (1,501).

The 40 new world-table recipes were not yet present in staging at audit time.
Their migrations now contain complete recipe metadata and a catalog-wide
reconciliation pass. The 10 cookbook-curated recipes use explicit catalog IDs for
every ingredient in their formulations; all 48 referenced IDs were verified to
exist and contain macro nutrition in staging.

## Enforcement and remediation

`20261023134000_recipe_junction_reconciliation_and_completeness.sql` now:

- scans every catalog recipe, not only the new collection;
- links exact normalized ingredient names and reviewed aliases;
- copies resolved IDs back into the recipe ingredient JSON;
- derives missing ingredient nutrient junctions from existing structured data;
- calculates recipe macro and nutrient totals through canonical junctions;
- exposes `catalog_recipe_completeness.is_full_data` and individual gap counts.

Uncertain legacy matches remain incomplete for review. The migration deliberately
does not invent instructions, descriptions, nutrient values, or serving data.
Run `node scripts/audit-recipe-completeness.mjs` after deployment to obtain the
new catalog-wide count and the exact remaining recipe IDs.
