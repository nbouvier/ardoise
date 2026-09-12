ALTER TABLE "transactions" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_valid" CHECK ("transactions"."category" is null or "transactions"."category" in (
        'groceries', 'restaurant', 'leisure', 'housing', 'transport', 'travel',
        'health', 'shopping', 'bills', 'gifts', 'education', 'pets', 'other'
      ));