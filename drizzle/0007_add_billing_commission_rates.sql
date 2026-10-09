ALTER TABLE "billing_settings" ADD COLUMN "commission_rate_web" numeric(4, 2) DEFAULT '10.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_settings" ADD COLUMN "commission_rate_store" numeric(4, 2) DEFAULT '5.00' NOT NULL;--> statement-breakpoint
UPDATE "billing_settings" SET "commission_rate_web" = "commission_rate";--> statement-breakpoint
ALTER TABLE "billing_settings" DROP COLUMN "commission_rate";