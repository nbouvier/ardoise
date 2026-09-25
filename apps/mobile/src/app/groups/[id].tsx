import { useLocalSearchParams } from 'expo-router';

import { GroupScreen, parseGroupTab } from '@/features/groups/group-screen';

export default function GroupRoute() {
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  return <GroupScreen groupId={id} initialTab={parseGroupTab(tab)} />;
}
