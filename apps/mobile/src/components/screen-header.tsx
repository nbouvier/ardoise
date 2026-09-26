import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { PageHero } from '@/components/page-hero';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export interface ScreenHeaderProps {
  title: string;
  /** One quiet trailing note — what this screen counts — on the title's own line, after a "·". */
  caption?: string;
  /** A quiet line above the title — a breadcrumb. */
  above?: ReactNode;
  /** An action that belongs to the screen as a whole, aligned with the header. */
  action?: ReactNode;
  /**
   * Wraps the header in `PageHero`'s decorative wash (`docs/specs/home.md`).
   * The header must then be the screen's own first element, outside any
   * padded wrapper — `PageHero` owns its own padding and safe-area inset.
   */
  wash?: boolean;
}

/**
 * The top of a tab screen: the page's name on a single line, then — smaller
 * and secondary, after a "·" — what it counts. The home screen is the one
 * place the app introduces itself. See "App header" in docs/DESIGN.md.
 */
export function ScreenHeader({ title, caption, above, action, wash = false }: ScreenHeaderProps) {
  const header = (
    <View style={styles.header}>
      <View style={styles.column}>
        {above}
        <View style={styles.text}>
          <ThemedText type="sectionTitle" numberOfLines={1} style={styles.title}>
            {title}
          </ThemedText>
          {caption ? (
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.caption}>
              {`· ${caption}`}
            </ThemedText>
          ) : null}
        </View>
      </View>
      {action}
    </View>
  );

  return wash ? <PageHero>{header}</PageHero> : header;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  column: {
    flex: 1,
    gap: Spacing.half,
  },
  text: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.one,
  },
  title: {
    flexShrink: 1,
  },
  caption: {
    flexShrink: 0,
  },
});
