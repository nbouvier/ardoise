CREATE TABLE "transaction_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"share_cents" integer NOT NULL,
	"weight" integer,
	CONSTRAINT "transaction_participants_unique" UNIQUE("transaction_id","user_id"),
	CONSTRAINT "transaction_participants_share_non_negative" CHECK ("transaction_participants"."share_cents" >= 0),
	CONSTRAINT "transaction_participants_weight_positive" CHECK ("transaction_participants"."weight" is null or "transaction_participants"."weight" > 0)
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"occurred_on" date NOT NULL,
	"comment" text,
	"payer_id" uuid NOT NULL,
	"split_mode" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_kind_valid" CHECK ("transactions"."kind" in ('expense', 'income', 'transfer')),
	CONSTRAINT "transactions_split_mode_valid" CHECK ("transactions"."split_mode" in ('shares', 'amount')),
	CONSTRAINT "transactions_amount_positive" CHECK ("transactions"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "transaction_participants" ADD CONSTRAINT "transaction_participants_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_participants" ADD CONSTRAINT "transaction_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payer_id_users_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transaction_participants_user_id_idx" ON "transaction_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transactions_group_id_occurred_on_idx" ON "transactions" USING btree ("group_id","occurred_on");--> statement-breakpoint
CREATE INDEX "transactions_payer_id_idx" ON "transactions" USING btree ("payer_id");