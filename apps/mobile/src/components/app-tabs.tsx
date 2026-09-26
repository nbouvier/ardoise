import { PagerTabs } from '@/components/pager-tabs';

export default function AppTabs() {
  return (
    // The tab bar is a surface, not the canvas, and the active tab carries the
    // brand hue — the one place navigation says which app this is.
    <PagerTabs>
      <PagerTabs.Screen name="index" options={{ title: 'Home', icon: 'home' }} />
      <PagerTabs.Screen name="groups" options={{ title: 'Groups', icon: 'groups' }} />
      <PagerTabs.Screen name="friends" options={{ title: 'Friends', icon: 'friends' }} />
      <PagerTabs.Screen name="account" options={{ title: 'Account', icon: 'account' }} />
    </PagerTabs>
  );
}
