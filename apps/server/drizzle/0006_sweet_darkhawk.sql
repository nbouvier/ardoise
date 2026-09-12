-- Backfill existing rows before the column can become NOT NULL: an
-- uncategorised transaction recorded before this migration is now 'other',
-- same as one recorded without a category from here on.
UPDATE "transactions" SET "category" = 'other' WHERE "category" IS NULL;--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_category_valid";--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "category" SET DEFAULT 'other';--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "category" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_valid" CHECK ("transactions"."category" in (
        'groceries', 'restaurant', 'leisure', 'housing', 'transport', 'travel',
        'health', 'shopping', 'bills', 'gifts', 'education', 'pets', 'other'
      ));