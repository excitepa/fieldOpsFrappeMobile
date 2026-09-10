import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Image, Alert, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { useFieldStore } from '../store/useFieldStore';
import { clockIn } from '../services/api';
import { blockIfDayLocked } from '../utils/dayLock';
import { localDateStr } from '../utils/timestamp';
import { RouteName, Campaign } from '../types';

interface AttendanceScreenProps {
  campaignData?: Campaign;
  onNavigate: (route: RouteName, data?: any) => void;
}

type GpsStatus = 'locating' | 'locked' | 'failed';

export const AttendanceScreen: React.FC<AttendanceScreenProps> = ({
  campaignData,
  onNavigate,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state, dispatch } = useFieldStore();
  const user = state.user;

  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('locating');
  const [coordsText, setCoordsText] = useState('');
  const [rawCoords, setRawCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [placeLabel, setPlaceLabel] = useState('');
  const [accuracyText, setAccuracyText] = useState('');
  const [gpsErrorText, setGpsErrorText] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Prevents double-firing the camera picker (Expo Go restarts if launchCameraAsync is called
  // while the OS camera overlay is already open — e.g. when the Pressable fires again on resume).
  const cameraLockRef = useRef(false);

  useEffect(() => {
    // Auto-capture the device's real location on mount — every value below
    // comes from the live device fix, never a hardcoded place name.
    captureGps();
  }, []);

  const captureGps = async () => {
    setGpsStatus('locating');
    setGpsErrorText('');

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGpsStatus('failed');
        setGpsErrorText('Location permission denied — enable it in device settings.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      setRawCoords({ lat, lng });
      setCoordsText(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      setAccuracyText(position.coords.accuracy ? `±${Math.round(position.coords.accuracy)}m` : '');

      let label = '';
      try {
        const places = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        const place = places?.[0];
        if (place) {
          // Exact street-level location, not the district/LGA — a supervisor
          // reviewing attendance needs the actual spot, not the general area.
          const streetLine = [place.streetNumber, place.street].filter(Boolean).join(' ');
          label = place.formattedAddress
            || [streetLine || place.name, place.city || place.subregion]
              .filter(Boolean)
              .join(', ');
        }
      } catch (geocodeErr) {
        // Reverse geocoding can fail offline — the raw coordinates still stand on their own.
      }
      setPlaceLabel(label || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      setGpsStatus('locked');
    } catch (e) {
      setGpsStatus('failed');
      setGpsErrorText('Could not read device location — check GPS and retry.');
    }
  };

  const captureFace = async () => {
    // Bail out if a camera session is already open — this is what causes Expo Go to reload.
    if (cameraLockRef.current) return;
    cameraLockRef.current = true;
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Camera Permission Needed', 'Enable camera access to take your shift selfie.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        cameraType: ImagePicker.CameraType.front,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch (e) {
      Alert.alert('Camera Error', 'Could not open the camera. Please try again.');
    } finally {
      // Always release the lock so the user can try again
      cameraLockRef.current = false;
    }
  };

  const dateTimeText = new Date().toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });

  const handleFinishClockIn = async () => {
    // A same-day re-clock-in would otherwise trivially bypass the EOD day
    // lock (see App.tsx handleDayComplete) — clocking in again for today
    // stays blocked right alongside every other action until it lifts.
    if (blockIfDayLocked(state.dayLockedUntil)) return;
    if (gpsStatus !== 'locked' || !rawCoords) {
      Alert.alert('GPS Location Required', 'We need your real GPS location to verify your territory before clocking in.');
      return;
    }
    if (!photoUri) {
      Alert.alert('Selfie Required', 'Please take a selfie snapshot before completing attendance clock-in.');
      return;
    }

    setIsSubmitting(true);
    let alreadyCheckedIn = false;
    try {
      const result = await clockIn(rawCoords, { imageUri: photoUri, campaignId: campaignData?.id });
      alreadyCheckedIn = !!result.alreadyCheckedIn;

      if (result.alreadyCheckedOut) {
        // Server-confirmed proof this agent already completed a full attendance
        // cycle (clocked in AND out) today — most likely via EOD on a different
        // device, since that's this app's only clock-out path. The local day-lock
        // is otherwise per-device only (see App.tsx's onLogout clearing it), so
        // without this, a second device would never know the day was already
        // closed out. Locking here too is what actually makes safe mode follow
        // the agent instead of just the one device that submitted EOD.
        setIsSubmitting(false);
        const nextMidnight = new Date();
        nextMidnight.setHours(24, 0, 0, 0);
        dispatch({ type: 'SET_DAY_LOCK', until: nextMidnight.toISOString() });
        Alert.alert(
          'Already Completed Today',
          'You already clocked in and out for today on another device. The app will stay in safe mode until 12:00 AM tomorrow.',
          [{ text: 'OK', onPress: () => onNavigate('home') }]
        );
        return;
      }

      dispatch({ type: 'SET_ATTENDANCE_STATUS', clockedIn: true, attendanceId: result.attendanceId, clockInDate: localDateStr() });
    } catch (e: any) {
      setIsSubmitting(false);
      Alert.alert('Clock In Failed', e?.message || 'Could not clock in. Please try again.');
      return;
    }
    setIsSubmitting(false);

    if (alreadyCheckedIn) {
      // Real attendance already exists for today (e.g. from another device) —
      // resume the agent into it rather than pretending this was a fresh
      // clock-in they should get an "attendance success" celebration for.
      Alert.alert('Already Clocked In', "You're already clocked in for today.", [
        { text: 'OK', onPress: () => onNavigate('home') },
      ]);
      return;
    }

    const camp: Campaign = campaignData || {
      id: 'c2',
      name: 'Silver Card Rollout',
      client: 'Renmoney',
      type: 'Execution',
      category: 'Mixed',
      progress: 42,
      target: '84 / 200 units',
      color: '#1A9B8F',
      beat: 'Victoria Island',
      modules: ['sales', 'orders', 'merchandising'],
      ctaType: 'outlets',
    };
    const now = new Date();
    onNavigate('attendanceSuccess', {
      campaign: camp,
      placeLabel,
      timestamp: `${now.getDate()} ${now.toLocaleDateString('en-US', { weekday: 'short' })}, ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`,
    });
  };

  const canConfirm = gpsStatus === 'locked' && !!photoUri;
  const geoTagColor = gpsStatus === 'locked' ? theme.colors.emerald : gpsStatus === 'failed' ? theme.colors.red : theme.colors.amber;
  const geoTagLabel = gpsStatus === 'locked' ? 'Locked' : gpsStatus === 'failed' ? 'Failed' : 'Locating...';

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Attendance"
        subtitle="Capture selfie to clock in"
        onNavigate={onNavigate}
        onBackPress={() => onNavigate('campaignSelect')}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Selfie capture */}
        <Pressable onPress={captureFace} style={styles.selfieBox}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.selfieImage} resizeMode="cover" />
          ) : (
            <View style={styles.selfiePlaceholder}>
              <Icon name="camera" size={40} color={theme.colors.darkMuted} strokeWidth={1.5} />
              <Text style={styles.selfiePlaceholderText}>Tap to take selfie</Text>
            </View>
          )}
        </Pressable>

        {/* Info card */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Agent</Text>
            <Text style={styles.infoValue}>{user.name} · {user.role}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Campaign</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {campaignData ? `${campaignData.name} · ${campaignData.type}` : 'No campaign selected'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Date & time</Text>
            <Text style={styles.infoValue}>{dateTimeText}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>GPS</Text>
            <Text style={styles.infoValue}>{coordsText || (gpsStatus === 'failed' ? 'Unavailable' : 'Locating...')}</Text>
          </View>
        </View>

        {/* Auto geo-tag row — tap to retry if it fails */}
        <Pressable onPress={captureGps} style={styles.geoTagRow}>
          <View style={styles.geoTagIconBox}>
            <Icon name="map-pin" size={16} color={theme.colors.primaryLight} />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.geoTagLabel}>Auto geo-tag</Text>
            <Text style={styles.geoTagValue} numberOfLines={1}>
              {gpsStatus === 'failed' ? gpsErrorText : `${placeLabel || 'Locating...'}${accuracyText ? ` · ${accuracyText}` : ''}`}
            </Text>
          </View>
          <View style={[styles.geoTagBadge, { backgroundColor: `${geoTagColor}22` }]}>
            <Text style={[styles.geoTagBadgeText, { color: geoTagColor }]}>{geoTagLabel}</Text>
          </View>
        </Pressable>

        <Button
          title={isSubmitting ? 'Clocking in...' : 'Confirm clock in'}
          onPress={handleFinishClockIn}
          variant="primary"
          size="large"
          disabled={!canConfirm || isSubmitting}
          style={styles.submitBtn}
        />
        <Text style={styles.helperText}>Clock in is required before accessing outlets, sales, and surveys.</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.darkBg },
  scroll: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: 40 },
  flex1: { flex: 1 },
  selfieBox: {
    width: '100%',
    height: 280,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.colors.darkBorder,
    backgroundColor: theme.colors.darkSurface,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selfiePlaceholder: { alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm },
  selfiePlaceholderText: { fontFamily: theme.fonts.semibold, fontSize: 14, color: theme.colors.darkMuted },
  selfieImage: { width: '100%', height: '100%' },
  infoCard: {
    backgroundColor: theme.colors.darkCard,
    borderWidth: 1,
    borderColor: theme.colors.darkBorder,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md },
  infoLabel: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.darkMuted },
  infoValue: { fontFamily: theme.fonts.bold, fontSize: 13, color: theme.colors.primaryLight, flexShrink: 1, textAlign: 'right' },
  geoTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.darkCard,
    borderWidth: 1,
    borderColor: theme.colors.darkBorder,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
  },
  geoTagIconBox: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.darkSurface, alignItems: 'center', justifyContent: 'center' },
  geoTagLabel: { fontFamily: theme.fonts.regular, fontSize: 11, color: theme.colors.darkMuted },
  geoTagValue: { fontFamily: theme.fonts.semibold, fontSize: 13, color: theme.colors.primaryLight, marginTop: 1 },
  geoTagBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: theme.radius.full },
  geoTagBadgeText: { fontFamily: theme.fonts.bold, fontSize: 11 },
  submitBtn: { marginTop: theme.spacing.sm },
  helperText: { fontFamily: theme.fonts.regular, fontSize: 11, color: theme.colors.darkMuted, textAlign: 'center', paddingHorizontal: theme.spacing.md },
});
