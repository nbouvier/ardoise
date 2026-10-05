ALTER TABLE "transaction_participants" DROP CONSTRAINT "transaction_participants_unique";--> statement-breakpoint
ALTER TABLE "transaction_participants" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "payer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction_participants" ADD CONSTRAINT "transaction_participants_unique" UNIQUE NULLS NOT DISTINCT("transaction_id","user_id");