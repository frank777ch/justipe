CREATE TYPE "public"."currency" AS ENUM('PEN', 'USD');--> statement-breakpoint
CREATE TYPE "public"."debt_direction" AS ENUM('i_owe', 'owed_to_me');--> statement-breakpoint
CREATE TYPE "public"."frequency" AS ENUM('monthly', 'biweekly');--> statement-breakpoint
CREATE TYPE "public"."movement_type" AS ENUM('expense', 'income');--> statement-breakpoint
CREATE TYPE "public"."rate_source" AS ENUM('api', 'manual');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "movement_type" NOT NULL,
	"icon" text,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "categories_name_not_empty" CHECK (length(trim("categories"."name")) > 0),
	CONSTRAINT "categories_color_hex" CHECK ("categories"."color" IS NULL OR "categories"."color" ~ '^#[0-9A-Fa-f]{6}$')
);
--> statement-breakpoint
CREATE TABLE "debts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"direction" "debt_direction" NOT NULL,
	"counterparty" text NOT NULL,
	"description" text,
	"initial_amount" numeric(14, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"installment" numeric(14, 2),
	"expected_on" date,
	"closed_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "debts_initial_amount_positive" CHECK ("debts"."initial_amount" > 0),
	CONSTRAINT "debts_installment_positive" CHECK ("debts"."installment" IS NULL OR "debts"."installment" > 0),
	CONSTRAINT "debts_counterparty_not_empty" CHECK (length(trim("debts"."counterparty")) > 0)
);
--> statement-breakpoint
CREATE TABLE "recurring" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "movement_type" NOT NULL,
	"category_id" uuid NOT NULL,
	"amount_original" numeric(14, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"frequency" "frequency" NOT NULL,
	"day_of_month" smallint,
	"start_on" date NOT NULL,
	"end_on" date,
	"next_run_on" date NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"debt_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "recurring_amount_positive" CHECK ("recurring"."amount_original" > 0),
	CONSTRAINT "recurring_name_not_empty" CHECK (length(trim("recurring"."name")) > 0),
	CONSTRAINT "recurring_day_of_month_valid" CHECK (("recurring"."frequency" = 'monthly' AND "recurring"."day_of_month" BETWEEN 1 AND 31)
        OR ("recurring"."frequency" = 'biweekly' AND "recurring"."day_of_month" IS NULL)),
	CONSTRAINT "recurring_dates_valid" CHECK ("recurring"."end_on" IS NULL OR "recurring"."end_on" >= "recurring"."start_on")
);
--> statement-breakpoint
CREATE TABLE "movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "movement_type" NOT NULL,
	"category_id" uuid NOT NULL,
	"amount_original" numeric(14, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"exchange_rate" numeric(10, 4) DEFAULT '1' NOT NULL,
	"amount_pen" numeric(14, 2) GENERATED ALWAYS AS (round(amount_original * exchange_rate, 2)) STORED NOT NULL,
	"occurred_on" date NOT NULL,
	"note" text,
	"recurring_id" uuid,
	"debt_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "movements_amount_positive" CHECK ("movements"."amount_original" > 0),
	CONSTRAINT "movements_rate_positive" CHECK ("movements"."exchange_rate" > 0),
	CONSTRAINT "movements_pen_rate_is_one" CHECK ("movements"."currency" <> 'PEN' OR "movements"."exchange_rate" = 1)
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"rate_date" date PRIMARY KEY NOT NULL,
	"buy" numeric(10, 4) NOT NULL,
	"sell" numeric(10, 4) NOT NULL,
	"source" "rate_source" DEFAULT 'api' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_rates_buy_positive" CHECK ("exchange_rates"."buy" > 0),
	CONSTRAINT "exchange_rates_sell_positive" CHECK ("exchange_rates"."sell" > 0)
);
--> statement-breakpoint
CREATE TABLE "quick_amounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" "currency" DEFAULT 'PEN' NOT NULL,
	"category_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "quick_amounts_amount_positive" CHECK ("quick_amounts"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "recurring" ADD CONSTRAINT "recurring_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring" ADD CONSTRAINT "recurring_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_recurring_id_recurring_id_fk" FOREIGN KEY ("recurring_id") REFERENCES "public"."recurring"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_amounts" ADD CONSTRAINT "quick_amounts_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_type_name_uq" ON "categories" USING btree ("type",lower("name")) WHERE "categories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "categories_updated_at_idx" ON "categories" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "debts_updated_at_idx" ON "debts" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "recurring_next_run_idx" ON "recurring" USING btree ("next_run_on") WHERE "recurring"."active" AND "recurring"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "recurring_updated_at_idx" ON "recurring" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "movements_recurring_period_uq" ON "movements" USING btree ("recurring_id","occurred_on") WHERE "movements"."recurring_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "movements_occurred_on_idx" ON "movements" USING btree ("occurred_on") WHERE "movements"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "movements_debt_id_idx" ON "movements" USING btree ("debt_id") WHERE "movements"."debt_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "movements_updated_at_idx" ON "movements" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "exchange_rates_updated_at_idx" ON "exchange_rates" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "quick_amounts_updated_at_idx" ON "quick_amounts" USING btree ("updated_at");