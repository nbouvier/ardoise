import { useLocalSearchParams } from 'expo-router';

import { GroupScreen } from '@/features/groups/group-screen';

export default function GroupRoute() {
  const { id, openSheet } = useLocalSearchParams<{ id: string; openSheet?: string }>();
  return <GroupScreen groupId={id} initialSheet={openSheet === 'details' ? 'details' : undefined} />;
}
