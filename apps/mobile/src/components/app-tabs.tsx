import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { PagerTabs } from '@/components/pager-tabs';
import { useAuth } from '@/features/auth/use-auth';

const AVATAR_SIZE = 24;

export default function AppTabs() {
  const { state } = useAuth();
  const user = state.status === 'signedIn' ? state.user : null;

  return (
    // The tab bar is a surface, not the canvas, and the active tab carries the
    // brand hue — the one place navigation says which app this is.
    <PagerTabs>
      <PagerTabs.Screen name="index" options={{ title: 'Home', icon: 'home' }} />
      <PagerTabs.Screen name="groups" options={{ title: 'Groups', icon: 'groups' }} />
      <PagerTabs.Screen name="friends" options={{ title: 'Friends', icon: 'friends' }} />
      <PagerTabs.Screen
        name="account"
        options={{
          title: 'Account',
          icon: 'account',
          // Whoever is signed in is the icon, so it is always clear whose
          // account this is; the ring takes the active tab's colour.
          renderIcon: user
            ? ({ color, active }) => (
                <View style={[styles.ring, { borderColor: active ? color : 'transparent' }]}>
                  <Avatar
                    name={user.name}
                    picture={user.picture}
                    size={AVATAR_SIZE}
                    seed={user.id}
                  />
                </View>
              )
            : undefined,
        }}
      />
    </PagerTabs>
  );
}

const styles = StyleSheet.create({
  ring: {
    padding: 1.5,
    borderWidth: 1.5,
    borderRadius: (AVATAR_SIZE + 6) / 2,
  },
});
