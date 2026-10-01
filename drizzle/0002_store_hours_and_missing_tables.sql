CREATE TYPE "public"."reservation_source" AS ENUM('STORE', 'WEB');--> statement-breakpoint
CREATE TABLE "attribute_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(50) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "attribute_definitions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "attribute_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"definition_id" uuid NOT NULL,
	"value" varchar(100) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"monthly_fee" numeric(10, 2) DEFAULT '30.00' NOT NULL,
	"commission_rate" numeric(4, 2) DEFAULT '10.00' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rental_durations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" varchar(100) NOT NULL,
	"days" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rental_durations_days_unique" UNIQUE("days")
);
--> statement-breakpoint
CREATE TABLE "rental_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"seasonal_filtering_enabled" boolean DEFAULT true NOT NULL,
	"is_rental_open" boolean DEFAULT true NOT NULL,
	"season_override" text DEFAULT 'auto' NOT NULL,
	"summer_from" varchar(5),
	"summer_to" varchar(5),
	"winter_from" varchar(5),
	"winter_to" varchar(5),
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_hours" (
	"day" integer PRIMARY KEY NOT NULL,
	"label" varchar(20) NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL,
	"morning_from" varchar(5),
	"morning_to" varchar(5),
	"afternoon_from" varchar(5),
	"afternoon_to" varchar(5),
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "slug" varchar(160) NOT NULL;--> statement-breakpoint
ALTER TABLE "reservation_items" ADD COLUMN "label" varchar(100);--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "reference" varchar(20) NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "source" "reservation_source" DEFAULT 'STORE' NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "access_token" varchar(64);--> statement-breakpoint
ALTER TABLE "attribute_values" ADD CONSTRAINT "attribute_values_definition_id_attribute_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."attribute_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attribute_values_definition_value_uq" ON "attribute_values" USING btree ("definition_id","value");--> statement-breakpoint
CREATE UNIQUE INDEX "price_options_variant_duration_active_uq" ON "price_options" USING btree ("variant_id","duration") WHERE "price_options"."is_active" = true;--> statement-breakpoint
ALTER TABLE "items" DROP COLUMN "min_duration_unit";--> statement-breakpoint
ALTER TABLE "price_options" DROP COLUMN "duration_unit";--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_reference_unique" UNIQUE("reference");--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_access_token_unique" UNIQUE("access_token");--> statement-breakpoint
DROP TYPE "public"."duration_unit";