CREATE TABLE "group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_members_unique" UNIQUE("group_id","user_id"),
	CONSTRAINT "group_members_role_valid" CHECK ("group_members"."role" in ('owner', 'member'))
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text DEFAULT 'standard' NOT NULL,
	"name" text,
	"friendship_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_friendship_id_unique" UNIQUE("friendship_id"),
	CONSTRAINT "groups_kind_valid" CHECK ("groups"."kind" in ('standard', 'pair')),
	CONSTRAINT "groups_pair_shape" CHECK (("groups"."kind" = 'pair') = ("groups"."friendship_id" is not null)),
	CONSTRAINT "groups_standard_named" CHECK (("groups"."kind" = 'standard') = ("groups"."name" is not null))
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"inviter_id" uuid NOT NULL,
	"group_id" uuid,
	"code" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "invites_code_unique" UNIQUE("code"),
	CONSTRAINT "invites_kind_valid" CHECK ("invites"."kind" in ('friend', 'group')),
	CONSTRAINT "invites_target_shape" CHECK (("invites"."kind" = 'group') = ("invites"."group_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_friendship_id_friendships_id_fk" FOREIGN KEY ("friendship_id") REFERENCES "public"."friendships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_members_user_id_idx" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invites_inviter_id_idx" ON "invites" USING btree ("inviter_id");--> statement-breakpoint
CREATE INDEX "invites_group_id_idx" ON "invites" USING btree ("group_id");