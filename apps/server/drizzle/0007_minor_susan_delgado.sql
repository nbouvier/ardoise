ALTER TABLE "groups" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "depth" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_parent_id_groups_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "groups_parent_id_idx" ON "groups" USING btree ("parent_id");--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_pair_no_parent" CHECK ("groups"."kind" <> 'pair' or "groups"."parent_id" is null);--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_root_depth" CHECK (("groups"."parent_id" is null) = ("groups"."depth" = 0));--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_depth_valid" CHECK ("groups"."depth" between 0 and 4);