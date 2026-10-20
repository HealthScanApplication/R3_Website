#!/usr/bin/env bash
# Builds the staging dry-run for the routine share-link migration. Prints the path of the SQL file it wrote.
# The file applies the migration inside one DO block, tests it as anon / authenticated / service_role and rolls
# everything back with RAISE EXCEPTION (the exception text carries the PASS / FAIL lines). Never run against production.
set -euo pipefail
cd "$(dirname "$0")/.."
out="${1:-/tmp/routine-share-links-dryrun.sql}"
{
  cat scripts/routine-share-links-dryrun.head.sql
  cat supabase/migrations/20261020153000_routine_share_links.sql
  cat scripts/routine-share-links-dryrun.tests.sql
} > "$out"
echo "$out"
