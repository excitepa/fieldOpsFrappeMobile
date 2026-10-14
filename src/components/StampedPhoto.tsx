import React, { forwardRef } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface StampedPhotoProps {
  uri: string;
  /** Watermark lines (see buildStampLines) — burned into the uploaded file by burnStampIntoPhoto. */
  lines: string[];
  /**
   * The photo's width / height. The preview takes the photo's own shape so the
   * snapshot that gets uploaded is the whole photo, not a cropped strip of it.
   */
  aspectRatio?: number;
}

/** Field-evidence photo with the same location/time watermark as the attendance selfie. */
export const StampedPhoto = forwardRef<View, StampedPhotoProps>(({ uri, lines, aspectRatio = 3 / 4 }, ref) => {
const theme = useTheme();  const styles = createStyles(theme);
  return (
    <View ref={ref} collapsable={false} style={[styles.frame, { aspectRatio }]}>
      <Image source={{ uri }} style={styles.photo} resizeMode="cover" />
      {lines.length > 0 && (
        <View style={styles.watermark}>
          {lines.map((line, i) => (
            <Text key={i} style={styles.watermarkText} numberOfLines={1}>{line}</Text>
          ))}
        </View>
      )}
    </View>
  );
});

const createStyles = (theme: any) => StyleSheet.create({
  frame: { width: '100%' },
  photo: { width: '100%', height: '100%' },
  watermark: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10, paddingVertical: 6, gap: 1,
  },
  watermarkText: { fontFamily: theme.fonts.semibold, fontSize: 11, color: '#FFFFFF' },
});
