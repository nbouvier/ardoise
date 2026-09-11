import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export interface AvatarProps {
  name: string;
  picture: string | null;
  /** Diameter in pixels. Defaults to a list-row avatar. */
  size?: number;
}

/**
 * Someone's Google avatar, falling back to the initial of their name — a
 * picture is optional on a Google profile, and the row still has to read.
 */
export function Avatar({ name, picture, size = 40 }: AvatarProps) {
  const shape = { width: size, height: size, borderRadius: size / 2 };

  if (picture) {
    return <Image source={{ uri: picture }} style={shape} contentFit="cover" />;
  }

  return (
    <ThemedView type="backgroundElement" style={[shape, styles.fallback]}>
      <ThemedText type={size >= 64 ? 'subtitle' : 'default'}>
        {name.charAt(0).toUpperCase()}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
