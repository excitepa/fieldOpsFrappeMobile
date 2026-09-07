import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { OptionPickerSheet } from '../components/OptionPickerSheet';
import { useFieldStore } from '../store/useFieldStore';
import { updateOutlet, NetworkError } from '../services/api';
import { parseGps } from '../utils/geo';
import { RouteName, Outlet } from '../types';

interface EditOutletScreenProps {
  routeData?: { outletId?: string };
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

export const EditOutletScreen: React.FC<EditOutletScreenProps> = ({ routeData, onNavigate }) => {
const theme = useTheme();  const styles = createStyles(theme);
  const { state, dispatch } = useFieldStore();
  const outletId = routeData?.outletId;
  const outlet = state.outlets.find((o) => o.id === outletId) || state.outlets[0];

  const [outletName, setOutletName] = useState(outlet?.name || '');
  const [outletType, setOutletType] = useState(outlet?.type || 'Supermarket');
  const [subChannel, setSubChannel] = useState(outlet?.category || '');
  const [showChannelPicker, setShowChannelPicker] = useState(false);
  const [showSubChannelPicker, setShowSubChannelPicker] = useState(false);
  const [phone, setPhone] = useState(outlet?.phone || '');
  const [ownerName, setOwnerName] = useState(outlet?.ownerName || '');
  const [ownerPhone, setOwnerPhone] = useState(outlet?.ownerPhone || '');
  const [address, setAddress] = useState(outlet?.address || '');
  const [notes, setNotes] = useState(outlet?.notes || '');
  const [submitting, setSubmitting] = useState(false);
  // `coords` is what actually gets submitted — it starts at the outlet's
  // already-saved location so Save doesn't silently wipe it if the agent
  // never touches this button. `justUpdated` is separate and always starts
  // false: it only tracks whether *this button* was manually tapped in this
  // session, so the label never claims a capture that didn't happen — no
  // auto-updating on screen open just because a location was saved before.
  const [coords, setCoords] = useState(parseGps(outlet?.gps));
  const [justUpdated, setJustUpdated] = useState(false);
  const [capturingLocation, setCapturingLocation] = useState(false);

  const handleUpdateLocation = async () => {
    setCapturingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location Permission Needed', 'Enable location access to update this outlet\'s position.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
      setJustUpdated(true);
    } catch (e) {
      Alert.alert('Location Error', 'Could not read the device location. Check GPS and try again.');
    } finally {
      setCapturingLocation(false);
    }
  };

  const handleSubmit = async () => {
    if (!outletName.trim()) {
      Alert.alert('Required', 'Please enter an outlet name.');
      return;
    }

    setSubmitting(true);
    try {
      await updateOutlet(outlet.id, {
        name: outletName.trim(),
        type: outletType,
        address: address.trim(),
        phone: phone.trim(),
        ownerName: ownerName.trim() || undefined,
        ownerPhone: ownerPhone.trim() || undefined,
        notes: notes.trim() || undefined,
        latitude: coords?.lat,
        longitude: coords?.lng,
      });

      const updatedOutlet: Outlet = {
        ...outlet,
        name: outletName.trim(),
        type: outletType,
        category: subChannel || undefined,
        phone: phone.trim(),
        ownerName: ownerName.trim(),
        ownerPhone: ownerPhone.trim(),
        address: address.trim(),
        notes: notes.trim(),
        gps: coords ? `${coords.lat}, ${coords.lng}` : outlet.gps,
      };
      dispatch({ type: 'UPDATE_OUTLET', outlet: updatedOutlet });
      setSubmitting(false);
      onNavigate('outletDetail', { outletId: outlet.id });
    } catch (e: any) {
      setSubmitting(false);
      if (e instanceof NetworkError) {
        Alert.alert('No Connection', 'Could not reach the server. Check your connection and try again.');
      } else {
        Alert.alert('Could Not Save Changes', e?.message || 'The server rejected this update. Please try again.');
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Edit Customer"
        subtitle="One form, all outlet details"
        onNavigate={onNavigate}
        onBackPress={() => onNavigate('outletDetail', { outletId: outlet.id })}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card style={styles.sectionCard}>
          <View style={styles.imageRow}>
            <Text style={styles.label}>Image</Text>
            <Pressable style={styles.captureRow}>
              <View style={styles.captureIconBox}>
                <Icon name="camera" size={20} color={theme.colors.navy} />
              </View>
              <View style={styles.flex1}>
                <Text style={styles.captureTitle}>Tap to capture</Text>
                <Text style={styles.captureSub}>Compressed automatically</Text>
              </View>
            </Pressable>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Outlet Channel</Text>
            <Pressable onPress={() => setShowChannelPicker(true)} style={styles.dropdownBtn}>
              <Text style={styles.dropdownText}>{outletType}</Text>
              <Icon name="chevron-down" size={18} color={theme.colors.textMuted} />
            </Pressable>
          </View>

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
            placeholder="Corner Store"
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
            label="Field notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Manager usually arrives at 10 AM..."
            multiline
            numberOfLines={3}
            variant="field"
          />

          <Pressable
            onPress={handleUpdateLocation}
            disabled={capturingLocation}
            style={styles.updateLocationBtn}
          >
            {capturingLocation ? (
              <ActivityIndicator size="small" color={theme.colors.navy} />
            ) : (
              <Icon name="map-pin" size={16} color={theme.colors.navy} />
            )}
            <Text style={styles.updateLocationText}>
              {capturingLocation ? 'Locating…' : justUpdated ? 'Location Updated' : 'Update Location'}
            </Text>
          </Pressable>
        </Card>

        <Button
          title={submitting ? 'Updating...' : 'Save'}
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
  imageRow: { gap: 6 },
  captureRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md,
  },
  captureIconBox: {
    width: 64, height: 64, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.fieldFill, alignItems: 'center', justifyContent: 'center',
  },
  captureTitle: { fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.textDark },
  captureSub: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted, marginTop: 1 },
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
  updateLocationBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end',
    backgroundColor: theme.colors.fieldFill, borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md, paddingVertical: 10, marginTop: 4,
  },
  updateLocationText: { fontFamily: theme.fonts.bold, fontSize: 13, color: theme.colors.navy },
  saveBtn: { marginTop: theme.spacing.sm },
});
