import { z } from 'zod';

import { friendSummarySchema } from './friends.js';

/**
 * `standard` is a group someone created and named. `pair` is the implicit group
 * every pair of friends shares: it is never listed, nobody can be added to it,
 * and it cannot be renamed, archived or deleted. Everything else about it —
 * members, and later expenses — works identically.
 */
export const groupKindSchema = z.enum(['standard', 'pair']);
export type GroupKind = z.infer<typeof groupKindSchema>;

/** The creator owns the group. Only an owner may delete it. */
export const groupRoleSchema = z.enum(['owner', 'member']);
export type GroupRole = z.infer<typeof groupRoleSchema>;

export const groupNameSchema = z.string().trim().min(1).max(60);

export const groupMemberSchema = friendSummarySchema.extend({
  role: groupRoleSchema,
});
export type GroupMember = z.infer<typeof groupMemberSchema>;

/**
 * Groups nest up to this many levels below a root group (five levels total,
 * depth 0..4). Fixed and not configurable — see `docs/specs/groups.md`.
 */
export const MAX_GROUP_DEPTH = 4;

/**
 * A group as it appears in a list. `name` is always populated: a pair group
 * stores none, so the server fills it with the *other* member's name — each
 * side sees the person they share with.
 *
 * `parentId` is `null` for a root group. `subgroupCount` is the number of
 * *direct* sub-groups only — see `subgroups` on `GroupDetail` for the list
 * itself. `viewerBalanceCents` is the viewer's own net position, rolled up
 * over the group **and every sub-group nested inside it** at any depth —
 * positive means the viewer is owed, negative means they owe
 * (`docs/specs/balances.md`). For a group with no sub-groups this is simply
 * its own balance; a sub-group the viewer has never joined contributes
 * nothing to it, whether or not that sub-group is visible to them.
 */
export const groupSummarySchema = z.object({
  id: z.uuid(),
  kind: groupKindSchema,
  name: z.string().min(1),
  memberCount: z.number().int().positive(),
  parentId: z.uuid().nullable(),
  depth: z.number().int().min(0).max(MAX_GROUP_DEPTH),
  subgroupCount: z.number().int().nonnegative(),
  viewerBalanceCents: z.number().int(),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type GroupSummary = z.infer<typeof groupSummarySchema>;

/**
 * One of a group's direct sub-groups, as shown in its parent's own detail —
 * enough to decide whether to open (if already a member) or join it, never a
 * member list. `viewerIsMember` is what the client uses to show "Open" versus
 * a join affordance.
 */
export const subgroupSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  memberCount: z.number().int().positive(),
  viewerIsMember: z.boolean(),
  /** Rolled up over this sub-group's own sub-tree, `0` when not a member. */
  viewerBalanceCents: z.number().int(),
});
export type SubgroupSummary = z.infer<typeof subgroupSummarySchema>;

/** One ancestor of a sub-group, for a breadcrumb — id and name only. */
export const groupAncestorSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
});
export type GroupAncestor = z.infer<typeof groupAncestorSchema>;

/**
 * A group opened by one of its members. `viewerRole` drives which actions
 * show. `subgroups` are the group's *direct* sub-groups (`docs/specs/groups.md`);
 * `ancestors` is empty for a root group and, for a sub-group, every one of its
 * ancestors root-first, for a breadcrumb. `readOnly` is `true` when the group
 * itself is archived *or any ancestor of it is* — a root group's `readOnly`
 * always equals its own `archivedAt !== null`, since it has no ancestors.
 * `pairRooted` is `true` when this group — or one of its ancestors — is the
 * implicit space shared by two friends: it, and every sub-group nested inside
 * it at any depth, can only ever contain those two people, so the client
 * hides "add friends" and "share an invitation link" there and relies on the
 * ordinary unjoined-sub-group toggle for the other person to join instead.
 */
export const groupDetailSchema = groupSummarySchema.extend({
  members: z.array(groupMemberSchema),
  viewerRole: groupRoleSchema,
  subgroups: z.array(subgroupSummarySchema),
  ancestors: z.array(groupAncestorSchema),
  readOnly: z.boolean(),
  pairRooted: z.boolean(),
});
export type GroupDetail = z.infer<typeof groupDetailSchema>;

/**
 * What a group invitation discloses before it is accepted. Bounded on purpose:
 * enough to decide whether to join, never the member list.
 */
export const groupInvitePreviewSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  memberCount: z.number().int().positive(),
});
export type GroupInvitePreview = z.infer<typeof groupInvitePreviewSchema>;

/** `GET /groups` response. Pair groups are never included. */
export const groupsListResponseSchema = z.object({
  groups: z.array(groupSummarySchema),
});
export type GroupsListResponse = z.infer<typeof groupsListResponseSchema>;

/** Response of every route returning a single group. */
export const groupResponseSchema = z.object({ group: groupDetailSchema });
export type GroupResponse = z.infer<typeof groupResponseSchema>;

/**
 * `POST /groups`. `memberIds` must be friends of the caller. `parentId`,
 * when given, creates a sub-group under that group instead of a root group —
 * the caller must belong to it, and it is added (with every other initial
 * member) to that group's own ancestors too, since membership always flows
 * down the tree (`docs/specs/groups.md`).
 */
export const createGroupRequestSchema = z.object({
  name: groupNameSchema,
  memberIds: z.array(z.uuid()).max(50).optional(),
  parentId: z.uuid().optional(),
});
export type CreateGroupRequest = z.infer<typeof createGroupRequestSchema>;

/** `PATCH /groups/:groupId`. At least one field must be present. */
export const updateGroupRequestSchema = z
  .object({
    name: groupNameSchema.optional(),
    archived: z.boolean().optional(),
  })
  .refine((value) => value.name !== undefined || value.archived !== undefined, {
    message: 'nothing to update',
  });
export type UpdateGroupRequest = z.infer<typeof updateGroupRequestSchema>;

/** `POST /groups/:groupId/members`. */
export const addGroupMembersRequestSchema = z.object({
  memberIds: z.array(z.uuid()).min(1).max(50),
});
export type AddGroupMembersRequest = z.infer<typeof addGroupMembersRequestSchema>;
