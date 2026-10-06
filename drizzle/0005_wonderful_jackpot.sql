-- Retrait de `PENDING_VERIFICATION` et `EXPIRED` de l'énumération des statuts.
--
-- Ces deux valeurs n'étaient écrites par aucun chemin applicatif. Leur retrait
-- impose de convertir les lignes existantes AVANT de changer le type de la
-- colonne : `reservation_status` ne contient plus `EXPIRED`, et l'instruction
-- finale (`USING "status"::reservation_status`) échouerait sinon sur ces lignes.
--
--   EXPIRED → CANCELLED : la non-présentation est une annulation du point de vue
--   du statut. Les lignes concernées portent déjà `is_no_show = 1`, seul vestige
--   de la distinction, et il est conservé tel quel par cette conversion.
--
--   PENDING_VERIFICATION → CONFIRMED : aucune ligne aujourd'hui, mais l'instruction
--   reste : une base ayant tourné avec une version antérieure du code en
--   contient peut-être.
--
-- L'ordre est impératif. Les deux UPDATE ci-dessous s'exécutent alors que la
-- colonne est encore typée par l'ancien enum, où les valeurs de destination
-- existent déjà.
UPDATE "reservations" SET "status" = 'CANCELLED' WHERE "status" = 'EXPIRED';--> statement-breakpoint
UPDATE "reservations" SET "status" = 'CONFIRMED' WHERE "status" = 'PENDING_VERIFICATION';--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "status" SET DEFAULT 'CONFIRMED'::text;--> statement-breakpoint
DROP TYPE "public"."reservation_status";--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('CONFIRMED', 'COLLECTED', 'RETURNED', 'CANCELLED');--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "status" SET DEFAULT 'CONFIRMED'::"public"."reservation_status";--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "status" SET DATA TYPE "public"."reservation_status" USING "status"::"public"."reservation_status";