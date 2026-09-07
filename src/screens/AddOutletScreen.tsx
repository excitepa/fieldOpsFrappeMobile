import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { OptionPickerSheet } from '../components/OptionPickerSheet';
import { useFieldStore } from '../store/useFieldStore';
import { createOutlet, NetworkError } from '../services/api';
import { RouteName, Outlet } from '../types';

interface AddOutletScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
}

const OUTLET_CHANNELS = [
  'Supermarket', 'Mini Mart', 'Kiosk', 'Pharmacy', 'Open Market Stall', 'Wholesaler',
  'Distributor', 'Convenience Store', 'Provision Store', 'Cosmetics Shop',
  'Restaurant', 'Bar / Lounge', 'Hotel', 'Bakery', 'Fuel Station Shop',
  'Beauty Salon', 'Electronics Shop', 'Mobile Money Agent', 'POS Agent', 'Filling Station',
  'School Canteen', 'Hospital Store', 'Cold Room', 'Poultry Shop', 'Table Top Seller',
];
const OUTLET_SUB_CHANNELS = ['Modern Trade', 'Traditional Trade', 'Wholesale', 'Distributor', 'Pharmacy', 'HORECA', 'Key Account'];

export const AddOutletScreen: React.FC<AddOutletScreenProps> = ({ onNavigate }) => {
const theme = useTheme();  const styles = createStyles(theme);
  const { state, dispatch } = useFieldStore();
  const activeCampaignId = state.activeCampaign?.id || 'c2';

  const [outletType, setOutletType] = useState('Supermarket');
  const [showChannelPicker, setShowChannelPicker] = useState(false);
  const [subChannel, setSubChannel] = useState('');
  const [showSubChannelPicker, setShowSubChannelPicker] = useState(false);
  const [outletName, setOutletName] = useState('QuickShop Express');
  const [phone, setPhone] = useState('+234 801 000 0000');
  const [ownerName, setOwnerName] = useState('Mr. Emeka Obi');
  const [ownerMobile, setOwnerMobile] = useState('+234 802 000 0000');
  const [address, setAddress] = useState('12 Marine Rd, Oniru, Lekki');

  // Location Auto-Captured
  const [gpsLocation, setGpsLocation] = useState('');
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState('');
  const [gpsTime, setGpsTime] = useState('');
  const [loadingGps, setLoadingGps] = useState(false);

  // Photo
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    autoCaptureGps();
  }, []);

  const autoCaptureGps = async () => {
    setLoadingGps(true);
    setGpsError('');

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGpsError('Location permission denied. Enable it in device settings to tag this outlet.');
        setGpsLocation('');
        setGpsCoords(null);
        return;
      }

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      setGpsCoords({ lat, lng });

      const nowStr = new Date().toLocaleString('en-US', {
        month: 'numeric', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
      });
      setGpsTime(nowStr);

      let placeLabel = '';
      try {
        const places = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        const place = places?.[0];
        if (place) {
          placeLabel = [place.district || place.subregion, place.city || place.region]
            .filter(Boolean)
            .join(', ');
        }
      } catch (geocodeErr) {
        // Reverse geocoding can fail offline — real coordinates still stand on their own.
      }

      setGpsLocation(
        placeLabel
          ? `${placeLabel} · ${lat.toFixed(4)}, ${lng.toFixed(4)}`
          : `${lat.toFixed(4)}, ${lng.toFixed(4)}`
      );
    } catch (e) {
      setGpsError('Could not read device location. Check GPS/location services and retry.');
      setGpsLocation('');
      setGpsCoords(null);
    } finally {
      setLoadingGps(false);
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        // Fallback sample image
        setPhotoUri('https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=500');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch (e) {
      setPhotoUri('https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=500');
    }
  };

  const handleSubmit = async () => {
    if (!outletName.trim()) {
      Alert.alert('Required', 'Please enter an outlet name.');
      return;
    }
    if (!address.trim()) {
      Alert.alert('Required', 'Please enter the outlet address.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await createOutlet(activeCampaignId, {
        name: outletName.trim(),
        type: outletType,
        address: address.trim(),
        phone: phone.trim() || undefined,
        ownerName: ownerName.trim() || undefined,
        ownerPhone: ownerMobile.trim() || undefined,
        photoUri: photoUri || undefined,
        latitude: gpsCoords?.lat,
        longitude: gpsCoords?.lng,
      });

      // Enrich with fields the API doesn't return/accept yet
      const newOutlet: Outlet = {
        ...created,
        category: subChannel || undefined,
        area: address.includes('Oniru') ? 'Oniru' : address.includes('Ikoyi') ? 'Ikoyi' : 'Lekki Phase 1',
        distance: '',
        gps: gpsLocation,
      };

      dispatch({ type: 'ADD_OUTLET', outlet: newOutlet });
      setSubmitting(false);
      onNavigate('outlets');
    } catch (e: any) {
      setSubmitting(false);
      if (e instanceof NetworkError) {
        Alert.alert('No Connection', 'Could not reach the server. Check your connection and try again.');
      } else {
        Alert.alert('Could Not Add Outlet', e?.message || 'The server rejected this outlet. Please check the details and try again.');
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Add Outlet"
        subtitle="Register new territory outlet"
        onNavigate={onNavigate}
        onBackPress={() => onNavigate('outlets')}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card style={styles.sectionCard}>
          {/* Photo */}
          <Pressable onPress={handleTakePhoto} style={styles.photoBox}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photoPreview} />
            ) : (
              <View style={styles.captureRow}>
                <View style={styles.captureIconBox}>
                  <Icon name="camera" size={20} color={theme.colors.navy} />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.captureTitle}>Tap to take photo</Text>
                  <Text style={styles.captureSub}>Outlet front image · compressed automatically</Text>
                </View>
              </View>
            )}
          </Pressable>

          {/* Outlet Channel Dropdown */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Outlet Channel</Text>
            <Pressable onPress={() => setShowChannelPicker(true)} style={styles.dropdownBtn}>
              <Text style={styles.dropdownText}>{outletType}</Text>
              <Icon name="chevron-down" size={18} color={theme.colors.textMuted} />
            </Pressable>
          </View>

          {/* Outlet Sub-channel Dropdown */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Outlet sub-channel</Text>
            <Pressable onPress={() => setShowSubChannelPicker(true)} style={styles.dropdownBtn}>
              <Text style={[styles.dropdownText, !subChannel && styles.dropdownPlaceholder]}>
                {subChannel || 'Select outlet sub-channel'}
              </Text>
              <Icon name="chevron-down" size={18} color={theme.colors.textMuted} />
            </Pressable>
          </View>

          <Input
            label="Outlet Name"
            value={outletName}
            onChangeText={setOutletName}
            placeholder="QuickShop Express"
            variant="field"
          />

          <Input
            label="Address"
            value={address}
            onChangeText={setAddress}
            placeholder="12 Marine Rd, Oniru, Lekki"
            variant="field"
          />

          <Input
            label="Phone Number"
            value={phone}
            onChangeText={setPhone}
            placeholder="+234 801 000 0000"
            keyboardType="phone-pad"
            variant="field"
          />

          <Input
            label="Owner's Name"
            value={ownerName}
            onChangeText={setOwnerName}
            placeholder="Mr. Emeka Obi"
            variant="field"
          />

          <Input
            label="Owner's Mobile"
            value={ownerMobile}
            onChangeText={setOwnerMobile}
            placeholder="+234 802 000 0000"
            keyboardType="phone-pad"
            variant="field"
          />

          {/* Auto-Captured GPS Box — real device location, reverse-geocoded when possible */}
          <View style={styles.autoCapturedBox}>
            <View style={styles.pinCircle}>
              <Icon name="map-pin" size={18} color={theme.colors.navy} />
            </View>
            <View style={styles.autoCapturedTextCol}>
              <Text style={styles.autoCapturedTag}>{gpsLocation ? 'AUTO-CAPTURED' : gpsError ? 'LOCATION UNAVAILABLE' : 'CAPTURING...'}</Text>
              <Text style={styles.autoCapturedCoords}>
                {gpsLocation || gpsError || 'Fetching real-time GPS coordinates...'}
              </Text>
              {gpsTime && gpsLocation ? <Text style={styles.autoCapturedTime}>{gpsTime}</Text> : null}
            </View>
            <Pressable onPress={autoCaptureGps} style={styles.retryBtn} disabled={loadingGps}>
              <Icon name="compass" size={16} color={theme.colors.navy} />
            </Pressable>
          </View>
        </Card>

        <Button
          title={submitting ? 'Saving Outlet...' : 'Save Outlet'}
          onPress={handleSubmit}
          variant="navy"
          size="large"
          loading={submitting}
          style={styles.saveBtn}
        />
      </ScrollView>

      <OptionPickerSheet
        visible={showChannelPicker}
        title="Select outlet channel"
        options={OUTLET_CHANNELS}
        selected={outletType}
        searchable
        searchPlaceholder="Search outlet channel"
        onConfirm={(v) => setOutletType(v as string)}
        onClose={() => setShowChannelPicker(false)}
      />

      <OptionPickerSheet
        visible={showSubChannelPicker}
        title="Select outlet category"
        options={OUTLET_SUB_CHANNELS}
        selected={subChannel || null}
        onConfirm={(v) => setSubChannel(v as string)}
        onClose={() => setShowSubChannelPicker(false)}
      />
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  scroll: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: 60 },
  flex1: { flex: 1 },
  sectionCard: { gap: theme.spacing.md },
  fieldGroup: { gap: 6 },
  label: { fontFamily: theme.fonts.semibold, fontSize: 13, color: theme.colors.textDark },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.fieldFill,
    borderRadius: theme.radius.md,
    height: 52,
    paddingHorizontal: theme.spacing.md,
  },
  dropdownText: { fontFamily: theme.fonts.regular, fontSize: 15, color: theme.colors.textDark },
  dropdownPlaceholder: { color: theme.colors.textMuted },
  autoCapturedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.fieldFill,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginTop: 4,
  },
  pinCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.cardWhite, alignItems: 'center', justifyContent: 'center' },
  autoCapturedTextCol: { flex: 1, gap: 2 },
  autoCapturedTag: { fontFamily: theme.fonts.bold, fontSize: 10, color: theme.colors.navy, letterSpacing: 0.8 },
  autoCapturedCoords: { fontFamily: theme.fonts.bold, fontSize: 13, color: theme.colors.textDark },
  autoCapturedTime: { fontFamily: theme.fonts.regular, fontSize: 11, color: theme.colors.textMuted },
  retryBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.cardWhite, alignItems: 'center', justifyContent: 'center' },
  photoBox: {
    width: '100%',
    minHeight: 88,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.fieldFill,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  photoPreview: { width: '100%', height: 140, resizeMode: 'cover' },
  captureRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.md },
  captureIconBox: { width: 48, height: 48, borderRadius: theme.radius.md, backgroundColor: theme.colors.cardWhite, alignItems: 'center', justifyContent: 'center' },
  captureTitle: { fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.textDark },
  captureSub: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted, marginTop: 1 },
  saveBtn: { marginTop: theme.spacing.sm },
});
