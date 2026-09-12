import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { medallionFor } from '@/constants/theme';
import { useIsDark } from '@/hooks/use-theme';

export interface AvatarProps {
  name: string;
  picture: string | null;
  /** Diameter in pixels. Defaults to a list-row avatar. */
  size?: number;
  /**
   * What the fallback's colour is derived from, when the person has an id that
   * outlives their display name. Defaults to the name.
   */
  seed?: string;
}

/**
 * Someone's Google avatar, falling back to the initial of their name on their
 * own medallion colour — a picture is optional on a Google profile, and the row
 * still has to read, and still has to tell two people apart.
 */
export function Avatar({ name, picture, size = 40, seed }: AvatarProps) {
  const dark = useIsDark();
  const shape = { width: size, height: size, borderRadius: size / 2 };

  if (picture) {
    return <Image source={{ uri: picture }} style={shape} contentFit="cover" />;
  }

  const medallion = medallionFor(seed ?? name);

  return (
    <View
      style={[
        shape,
        styles.fallback,
        { backgroundColor: dark ? medallion.dark : medallion.light },
      ]}>
      <Text
        style={{
          fontSize: size * 0.42,
          fontWeight: '700',
          color: dark ? medallion.inkDark : medallion.ink,
        }}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
