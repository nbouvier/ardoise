ALTER TABLE "transaction_participants" DROP CONSTRAINT "transaction_participants_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_payer_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "google_sub" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "group_members" ADD COLUMN "claimed_placeholder_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "kind" text DEFAULT 'account' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "placeholder_group_id" uuid;--> statement-breakpoint
ALTER TABLE "transaction_participants" ADD CONSTRAINT "transaction_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payer_id_users_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_placeholder_group_id_groups_id_fk" FOREIGN KEY ("placeholder_group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_placeholder_name_unique" ON "users" USING btree ("placeholder_group_id",lower("name")) WHERE "users"."kind" = 'placeholder';--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_kind_valid" CHECK ("users"."kind" in ('account', 'placeholder'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_account_shape" CHECK (("users"."kind" = 'account') = ("users"."google_sub" is not null and "users"."email" is not null));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_placeholder_shape" CHECK (("users"."kind" = 'placeholder') = ("users"."placeholder_group_id" is not null));