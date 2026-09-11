import { useLocalSearchParams } from 'expo-router';

import { GroupScreen } from '@/features/groups/group-screen';

export default function GroupRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GroupScreen groupId={id} />;
}
