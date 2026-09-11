/**
 * A friendship is symmetric but stored once. Both columns always hold the pair
 * in a canonical (sorted) order, so the unique constraint on the pair is enough
 * to prevent duplicates — including when two people accept the same invitation
 * at the same time.
 */
export interface FriendshipPair {
  userAId: string;
  userBId: string;
}

/** Order two distinct user ids canonically. Throws when they are the same. */
export function orderPair(first: string, second: string): FriendshipPair {
  if (first === second) {
    throw new Error('A user cannot be their own friend');
  }
  return first < second
    ? { userAId: first, userBId: second }
    : { userAId: second, userBId: first };
}
