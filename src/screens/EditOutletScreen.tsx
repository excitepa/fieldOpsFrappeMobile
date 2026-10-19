import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Image,
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
import { SelectField } from '../components/SelectField';
import { StampedPhoto } from '../components/StampedPhoto';
import { useFieldStore } from '../store/useFieldStore';
import { useOutletFormOptions } from '../hooks/useOutletFormOptions';
import { updateOutlet, NetworkError } from '../services/api';
import { parseGps } from '../utils/geo';
import { blockIfDayLocked } from '../utils/dayLock';
import { listPlaceholder, missingPick, pickedName, subChannelsOf } from '../utils/outletForm';
import { normalizePhone, phoneError } from '../utils/phone';
import { buildStampLines, burnStampIntoPhoto, getStampLocation, keepPhotoForDraft } from '../utils/photoStamp';
import { RouteName, Outlet, OutletDraft } from '../types';

interface EditOutletScreenProps {
  routeData?: { outletId?: string };
  onNavigate: (route: RouteName, data?: any) => void;
}

export const EditOutletScreen: React.FC<EditOutletScreenProps> = ({ routeData, onNavigate }) => {
const theme = useTheme();  const styles = createStyles(theme);
  const { state, dispatch } = useFieldStore();
  const outletId = routeData?.outletId;
  const outlet = state.outlets.find((o) => o.id === outletId) || state.outlets[0];

  const [outletName, setOutletName] = useState(outlet?.name || '');

  // Pre-filled from what the backend says the outlet has (an older backend
  // sends none of these, so they start empty there).
  const { options, loading: optionsLoading } = useOutletFormOptions();
  const [outletTypeId, setOutletTypeId] = useState(outlet?.outletTypeId);
  const [channelId, setChannelId] = useState(outlet?.channelId);
  const [subChannelId, setSubChannelId] = useState(outlet?.subChannelId);
  const [distributorId, setDistributorId] = useState(outlet?.distributorId);
  const channelSubChannels = subChannelsOf(options, channelId);

  useEffect(() => {
    if (options.defaultDistributorId) setDistributorId((current) => current || options.defaultDistributorId);
  }, [options.defaultDistributorId]);

  const handleChannelChange = (id: string) => {
    setChannelId(id);
    // A sub-channel belongs to one channel.
    if (!subChannelsOf(options, id).some((s) => s.id === subChannelId)) setSubChannelId(undefined);
  };
  // Saved numbers in another format (+234 801 ..., 0801-234-...) start tidied.
  const [phone, setPhone] = useState(normalizePhone(outlet?.phone || ''));
  const [ownerName, setOwnerName] = useState(outlet?.ownerName || '');
  const [ownerPhone, setOwnerPhone] = useState(normalizePhone(outlet?.ownerPhone || ''));
  const [phoneProblem, setPhoneProblem] = useState<string>();
  const [ownerPhoneProblem, setOwnerPhoneProblem] = useState<string>();
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
  // Only a photo taken in this session — the outlet's existing image is shown
  // separately below, so nothing here ever re-submits a photo that's already
  // on the server.
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoTakenAt, setPhotoTakenAt] = useState<Date | null>(null);
  const [photoAspect, setPhotoAspect] = useState(3 / 4);
  // Where the new photo was taken, for its watermark only — deliberately kept
  // apart from `coords`, so taking a photo never moves the outlet's saved location.
  const [photoLocation, setPhotoLocation] = useState<Awaited<ReturnType<typeof getStampLocation>>>(null);
  const photoViewRef = useRef<View>(null);

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Camera Permission Needed', 'Enable camera access to take a photo of this outlet.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        // Field evidence — not something the agent should crop/alter first.
        allowsEditing: false,
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        const asset = result.assets[0];
        setPhotoUri(asset.uri);
        setPhotoTakenAt(new Date());
        if (asset.width > 0 && asset.height > 0) setPhotoAspect(asset.width / asset.height);
        setPhotoLocation(null);
        getStampLocation().then(setPhotoLocation);
      }
    } catch (e) {
      Alert.alert('Camera Error', 'Could not open the camera. Please try again.');
    }
  };

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
    if (blockIfDayLocked(state.dayLockedUntil)) return;
    const missing = missingPick(options, { outletTypeId, channelId, subChannelId, distributorId });
    if (missing) {
      Alert.alert('Required', missing);
      return;
    }
    if (!outletName.trim()) {
      Alert.alert('Required', 'Please enter an outlet name.');
      return;
    }
    // The outlet's own phone is optional; the owner's mobile is required.
    const nextPhoneProblem = phoneError(phone, false);
    const nextOwnerPhoneProblem = phoneError(ownerPhone, true);
    setPhoneProblem(nextPhoneProblem);
    setOwnerPhoneProblem(nextOwnerPhoneProblem);
    if (nextPhoneProblem || nextOwnerPhoneProblem) return;
    const outletPhone = normalizePhone(phone);
    const ownerMobile = normalizePhone(ownerPhone);

    const typeName = pickedName(options.types, outletTypeId, outlet.outletTypeId, outlet.outletTypeName);
    const subChannelName = pickedName(options.subChannels, subChannelId, outlet.subChannelId, outlet.subChannelName);
    const classification = {
      outletTypeId,
      outletTypeName: typeName,
      channelId,
      channelName: pickedName(options.channels, channelId, outlet.channelId, outlet.channelName),
      subChannelId,
      subChannelName,
      distributorId,
      distributorName: pickedName(options.distributors, distributorId, outlet.distributorId, outlet.distributorName),
    };

    setSubmitting(true);
    // The watermarked snapshot, not the raw camera file, is what gets uploaded
    // (or kept for an offline draft) — same as the attendance selfie.
    const uploadPhotoUri = photoUri ? await burnStampIntoPhoto(photoViewRef, photoUri) : null;
    try {
      await updateOutlet(outlet.id, {
        name: outletName.trim(),
        outletTypeId,
        channelId,
        subChannelId,
        distributorId,
        subChannel: subChannelName,
        address: address.trim(),
        phone: outletPhone,
        ownerName: ownerName.trim() || undefined,
        ownerPhone: ownerMobile,
        notes: notes.trim() || undefined,
        photoUri: uploadPhotoUri || undefined,
        latitude: coords?.lat,
        longitude: coords?.lng,
      });

      const updatedOutlet: Outlet = {
        ...outlet,
        ...classification,
        photoUri: uploadPhotoUri || outlet.photoUri,
        name: outletName.trim(),
        type: typeName || outlet.type,
        category: subChannelName,
        phone: outletPhone,
        ownerName: ownerName.trim(),
        ownerPhone: ownerMobile,
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
        // Genuine connectivity failure, not a rejection — apply the edit
        // locally (so it shows right away, same as the optimistic update on
        // success) plus a queued draft to actually push once back online,
        // instead of just losing the changes.
        const draftPhotoUri = uploadPhotoUri ? keepPhotoForDraft(uploadPhotoUri) : undefined;
        const updatedOutlet: Outlet = {
          ...outlet,
          ...classification,
          photoUri: draftPhotoUri || outlet.photoUri,
          name: outletName.trim(),
          type: typeName || outlet.type,
          category: subChannelName,
          phone: outletPhone,
          ownerName: ownerName.trim(),
          ownerPhone: ownerMobile,
          address: address.trim(),
          notes: notes.trim(),
          gps: coords ? `${coords.lat}, ${coords.lng}` : outlet.gps,
        };
        const outletDraft: OutletDraft = {
          id: `od_${Date.now()}`,
          mode: 'edit',
          outletId: outlet.id,
          campaignId: outlet.campaignId,
          name: outletName.trim(),
          type: typeName || '',
          subChannel: subChannelName,
          outletTypeId,
          channelId,
          subChannelId,
          distributorId,
          address: address.trim(),
          phone: outletPhone,
          ownerName: ownerName.trim() || undefined,
          ownerPhone: ownerMobile,
          notes: notes.trim() || undefined,
          photoUri: draftPhotoUri,
          latitude: coords?.lat,
          longitude: coords?.lng,
          createdAt: new Date().toISOString(),
          pendingSync: true,
        };
        dispatch({ type: 'UPDATE_OUTLET', outlet: updatedOutlet });
        dispatch({ type: 'SAVE_OUTLET_DRAFT', outletDraft });
        Alert.alert(
          'Saved Locally',
          'No connection — these changes have been saved on this device and will upload automatically from the Sync page once you\'re back online.',
        );
        onNavigate('outletDetail', { outletId: outlet.id });
      } else {
        // The request reached the server and was rejected — this will never
        // succeed on retry, so don't disguise it as an offline save.
        Alert.alert('Could Not Save Changes', e?.message || 'The server rejected this update. Please try again.');
      }
    }
  };

  if (!outlet) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Edit Customer" onNavigate={onNavigate} onBackPress={() => onNavigate('outlets')} />
        <View style={styles.missingContainer}>
          <Icon name="alert-circle" size={44} color={theme.colors.amber} />
          <Text style={styles.missingTitle}>This outlet could not be found.</Text>
          <Button title="Back to Outlets" onPress={() => onNavigate('outlets')} variant="navy" />
        </View>
      </SafeAreaView>
    );
  }

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
            {/* This button used to have no onPress at all, so an outlet whose
                photo failed to upload during onboarding could never get one. */}
            <Pressable onPress={handleTakePhoto} style={styles.photoBox}>
              {photoUri ? (
                <StampedPhoto
                  ref={photoViewRef}
                  uri={photoUri}
                  aspectRatio={photoAspect}
                  lines={buildStampLines(photoTakenAt, photoLocation?.address ?? '', photoLocation?.coords ?? null)}
                />
              ) : outlet.photoUri ? (
                <Image source={{ uri: outlet.photoUri }} style={styles.photoPreview} />
              ) : (
                <View style={styles.captureRow}>
                  <View style={styles.captureIconBox}>
                    <Icon name="camera" size={20} color={theme.colors.navy} />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.captureTitle}>Tap to capture</Text>
                    <Text style={styles.captureSub}>Compressed automatically</Text>
                  </View>
                </View>
              )}
            </Pressable>
            {photoUri && (
              <Text style={styles.captureSub}>New photo ready — tap Save to upload it.</Text>
            )}
          </View>

          <SelectField
            label="Outlet Type"
            title="Select outlet type"
            options={options.types || []}
            value={outletTypeId}
            valueName={outletTypeId === outlet.outletTypeId ? outlet.outletTypeName : undefined}
            placeholder={listPlaceholder(options.types, optionsLoading, 'Select outlet type')}
            onChange={setOutletTypeId}
          />

          <SelectField
            label="Outlet Channel"
            title="Select outlet channel"
            options={options.channels || []}
            value={channelId}
            valueName={channelId === outlet.channelId ? outlet.channelName : undefined}
            placeholder={listPlaceholder(options.channels, optionsLoading, 'Select outlet channel')}
            onChange={handleChannelChange}
          />

          <SelectField
            label="Outlet sub-channel"
            title="Select outlet sub-channel"
            options={channelSubChannels}
            value={subChannelId}
            valueName={subChannelId === outlet.subChannelId ? outlet.subChannelName : undefined}
            placeholder={
              options.subChannels === undefined ? listPlaceholder(undefined, optionsLoading, '')
                : !channelId ? 'Select a channel first'
                : channelSubChannels.length === 0 ? 'None for this channel'
                : 'Select outlet sub-channel'
            }
            onChange={setSubChannelId}
          />

          {/* Only when the agent has distributors to choose from — a backend
              without get_my_distributors leaves this out. */}
          {!!options.distributors?.length && (
            <SelectField
              label="Distributor"
              title="Select distributor"
              options={options.distributors}
              value={distributorId}
              valueName={distributorId === outlet.distributorId ? outlet.distributorName : undefined}
              placeholder="Select distributor"
              onChange={setDistributorId}
            />
          )}

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
            onChangeText={(text) => { setPhone(normalizePhone(text)); setPhoneProblem(undefined); }}
            placeholder="08012345678"
            keyboardType="phone-pad"
            variant="field"
            error={phoneProblem}
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
            value={ownerPhone}
            onChangeText={(text) => { setOwnerPhone(normalizePhone(text)); setOwnerPhoneProblem(undefined); }}
            placeholder="08012345678"
            keyboardType="phone-pad"
            variant="field"
            error={ownerPhoneProblem}
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

    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  scroll: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: 60 },
  missingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md, padding: theme.spacing.xl },
  missingTitle: { fontFamily: theme.fonts.bold, fontSize: 16, color: theme.colors.textDark, textAlign: 'center' },
  flex1: { flex: 1 },
  sectionCard: { gap: theme.spacing.md },
  imageRow: { gap: 6 },
  photoBox: {
    backgroundColor: theme.colors.fieldFill,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
  },
  photoPreview: { width: '100%', height: 140, resizeMode: 'cover' },
  captureRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md,
  },
  captureIconBox: {
    width: 64, height: 64, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.fieldFill, alignItems: 'center', justifyContent: 'center',
  },
  captureTitle: { fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.textDark },
  captureSub: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted, marginTop: 1 },
  label: { fontFamily: theme.fonts.semibold, fontSize: 13, color: theme.colors.textDark },
  updateLocationBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end',
    backgroundColor: theme.colors.fieldFill, borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md, paddingVertical: 10, marginTop: 4,
  },
  updateLocationText: { fontFamily: theme.fonts.bold, fontSize: 13, color: theme.colors.navy },
  saveBtn: { marginTop: theme.spacing.sm },
});
