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
 * A group as it appears in a list. `name` is always populated: a pair group
 * stores none, so the server fills it with the *other* member's name — each
 * side sees the person they share with.
 */
export const groupSummarySchema = z.object({
  id: z.uuid(),
  kind: groupKindSchema,
  name: z.string().min(1),
  memberCount: z.number().int().positive(),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type GroupSummary = z.infer<typeof groupSummarySchema>;

/** A group opened by one of its members. `viewerRole` drives which actions show. */
export const groupDetailSchema = groupSummarySchema.extend({
  members: z.array(groupMemberSchema),
  viewerRole: groupRoleSchema,
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

/** `POST /groups`. `memberIds` must be friends of the caller. */
export const createGroupRequestSchema = z.object({
  name: groupNameSchema,
  memberIds: z.array(z.uuid()).max(50).optional(),
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
