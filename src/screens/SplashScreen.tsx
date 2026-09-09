import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
const theme = useTheme();  const styles = createStyles(theme);
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.85)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [progressPercent, setProgressPercent] = useState(0);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(logoOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, friction: 7, tension: 35, useNativeDriver: true }),
    ]).start();

    const listenerId = progressAnim.addListener(({ value }) => {
      setProgressPercent(Math.floor(value));
    });

    Animated.timing(progressAnim, { toValue: 100, duration: 2000, useNativeDriver: false }).start(() => {
      setTimeout(onComplete, 200);
    });

    return () => { progressAnim.removeListener(listenerId); };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Animated.View style={[styles.logoWrapper, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
          <Image source={require('../../assets/logo-icon.png')} style={styles.logo} resizeMode="contain" />
        </Animated.View>

        <Animated.View style={{ opacity: logoOpacity, alignItems: 'center' }}>
          <Text style={styles.brandTitle}>FieldOps</Text>
          <Text style={styles.tagline}>Your field day, in perfect sync.</Text>
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <View style={styles.progressHeader}>
          <Text style={styles.loadingText}>Initializing workspace...</Text>
          <Text style={styles.percentText}>{progressPercent}%</Text>
        </View>
        <View style={styles.progressBarTrack}>
          <Animated.View
            style={[styles.progressBarFill, {
              width: progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
            }]}
          />
        </View>
      </View>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.darkBg, justifyContent: 'space-between', paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.xxl, paddingBottom: theme.spacing.xxl },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.lg },
  logoWrapper: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 110, height: 110 },
  brandTitle: { fontFamily: theme.fonts.display, fontSize: 36, color: theme.colors.darkText, letterSpacing: -0.5 },
  tagline: { fontFamily: theme.fonts.regular, fontSize: 15, color: theme.colors.darkMuted, marginTop: theme.spacing.xs, textAlign: 'center' },
  footer: { paddingBottom: theme.spacing.xl },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: theme.spacing.xs },
  loadingText: { fontFamily: theme.fonts.semibold, fontSize: 12, color: theme.colors.darkMuted },
  percentText: { fontFamily: theme.fonts.bold, fontSize: 13, color: theme.colors.primaryLight },
  progressBarTrack: { height: 5, backgroundColor: theme.colors.darkCard, borderRadius: theme.radius.full, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: theme.colors.primaryLight, borderRadius: theme.radius.full },
});
