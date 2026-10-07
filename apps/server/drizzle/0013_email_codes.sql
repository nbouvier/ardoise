CREATE TABLE "email_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" text NOT NULL,
	"email" text NOT NULL,
	"user_id" uuid,
	"code_hash" text NOT NULL,
	"attempts_left" integer NOT NULL,
	"name" text,
	"password_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_codes_purpose_email_unique" UNIQUE("purpose","email"),
	CONSTRAINT "email_codes_purpose_valid" CHECK ("email_codes"."purpose" in ('signup', 'password_reset')),
	CONSTRAINT "email_codes_attempts_non_negative" CHECK ("email_codes"."attempts_left" >= 0),
	CONSTRAINT "email_codes_signup_shape" CHECK (("email_codes"."purpose" = 'signup') = ("email_codes"."name" is not null and "email_codes"."password_hash" is not null))
);
--> statement-breakpoint
ALTER TABLE "email_codes" ADD CONSTRAINT "email_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_codes_user_id_idx" ON "email_codes" USING btree ("user_id");