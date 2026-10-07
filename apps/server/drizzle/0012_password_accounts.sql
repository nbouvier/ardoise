ALTER TABLE "users" DROP CONSTRAINT "users_account_shape";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_account_shape" CHECK (("users"."kind" = 'account') = ("users"."email" is not null and ("users"."google_sub" is not null or "users"."password_hash" is not null)));