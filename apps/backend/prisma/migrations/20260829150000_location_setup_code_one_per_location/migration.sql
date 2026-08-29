-- Enforce one LocationSetupCode row per Location. Before adding the constraint, collapse any
-- location that currently has multiple codes down to a single row: keep the most-recently-created
-- active code, falling back to the most-recently-created row if none are active.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "locationId"
           ORDER BY "active" DESC, "createdAt" DESC
         ) AS rn
  FROM "LocationSetupCode"
)
DELETE FROM "LocationSetupCode"
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- DropIndex
DROP INDEX IF EXISTS "LocationSetupCode_locationId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "LocationSetupCode_locationId_key" ON "LocationSetupCode"("locationId");
