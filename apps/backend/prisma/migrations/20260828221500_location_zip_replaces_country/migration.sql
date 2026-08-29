-- Replace Location.country with Location.zip (US-only going forward; nullable so a later
-- change to allow letters/dashes, e.g. Canadian postal codes, is a validation-only change).
ALTER TABLE "Location" ADD COLUMN "zip" TEXT;
ALTER TABLE "Location" DROP COLUMN "country";
