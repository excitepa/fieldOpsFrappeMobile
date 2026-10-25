import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/typography';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { SelectField } from '../components/SelectField';
import { StampedPhoto } from '../components/StampedPhoto';
import { useFieldStore } from '../store/useFieldStore';
import { useOutletFormOptions } from '../hooks/useOutletFormOptions';
import { createOutlet, NetworkError } from '../services/api';
import { blockIfDayLocked } from '../utils/dayLock';
import { listPlaceholder, missingPick, pickedName, subChannelsOf } from '../utils/outletForm';
import { normalizePhone, phoneError } from '../utils/phone';
import { buildStampLines, burnStampIntoPhoto, keepPhotoForDraft, streetAddressFromPlace } from '../utils/photoStamp';
import { newStamp } from '../utils/queue';
import { RouteName, Outlet, OutletDraft, ActionStamp } from '../types';

interface AddOutletScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
}

export const AddOutletScreen: React.FC<AddOutletScreenProps> = ({ onNavigate }) => {
const theme = useTheme();  const styles = createStyles(theme);
  const { state, dispatch } = useFieldStore();
  const activeCampaignId = state.activeCampaign?.id || 'c2';

  // Outlet type, channel, sub-channel and distributor, kept by id. The lists
  // come from the backend (kept on the device for offline use); nothing is
  // picked for the agent except their only distributor.
  const { options, loading: optionsLoading } = useOutletFormOptions();
  const [outletTypeId, setOutletTypeId] = useState<string>();
  const [channelId, setChannelId] = useState<string>();
  const [subChannelId, setSubChannelId] = useState<string>();
  const [distributorId, setDistributorId] = useState<string>();
  const channelSubChannels = subChannelsOf(options, channelId);

  useEffect(() => {
    if (options.defaultDistributorId) setDistributorId((current) => current || options.defaultDistributorId);
  }, [options.defaultDistributorId]);

  const handleChannelChange = (id: string) => {
    setChannelId(id);
    // A sub-channel belongs to one channel.
    if (!subChannelsOf(options, id).some((s) => s.id === subChannelId)) setSubChannelId(undefined);
  };
  // These previously defaulted to real-looking demo text ('QuickShop Express',
  // etc.) as the actual field VALUE, not just a placeholder — an agent who
  // didn't touch a field would silently submit that fake data as if it were
  // the real outlet's info. The placeholder props below already show the same
  // example text for guidance, so blanking these loses nothing.
  const [outletName, setOutletName] = useState('');
  const [phone, setPhone] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerMobile, setOwnerMobile] = useState('');
  const [address, setAddress] = useState('');
  const [phoneProblem, setPhoneProblem] = useState<string>();
  const [ownerMobileProblem, setOwnerMobileProblem] = useState<string>();

  // Location Auto-Captured
  const [gpsLocation, setGpsLocation] = useState('');
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState('');
  const [gpsTime, setGpsTime] = useState('');
  // Street-level, for the photo watermark — gpsLocation above is only area + city.
  const [gpsStreetAddress, setGpsStreetAddress] = useState('');
  const [loadingGps, setLoadingGps] = useState(false);

  // Photo
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  // When the photo was actually taken — the agent usually fills in the form
  // afterwards, so the watermark shouldn't show the time Save was tapped.
  const [photoTakenAt, setPhotoTakenAt] = useState<Date | null>(null);
  const [photoAspect, setPhotoAspect] = useState(3 / 4);
  const photoViewRef = useRef<View>(null);
  const [submitting, setSubmitting] = useState(false);
  // This outlet's one-time ID and when it was onboarded, from the first Save:
  // a second Save after one that got no answer is the same outlet to the server.
  const stampRef = useRef<ActionStamp | null>(null);

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
        setGpsStreetAddress('');
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
      let streetAddress = '';
      try {
        const places = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        const place = places?.[0];
        if (place) {
          placeLabel = [place.district || place.subregion, place.city || place.region]
            .filter(Boolean)
            .join(', ');
          streetAddress = streetAddressFromPlace(place);
        }
      } catch (geocodeErr) {
        // Reverse geocoding can fail offline — real coordinates still stand on their own.
      }

      setGpsStreetAddress(streetAddress);
      setGpsLocation(
        placeLabel
          ? `${placeLabel} · ${lat.toFixed(4)}, ${lng.toFixed(4)}`
          : `${lat.toFixed(4)}, ${lng.toFixed(4)}`
      );
    } catch (e) {
      setGpsError('Could not read device location. Check GPS/location services and retry.');
      setGpsLocation('');
      setGpsStreetAddress('');
      setGpsCoords(null);
    } finally {
      setLoadingGps(false);
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        // Was silently substituting a random stock photo from the internet as
        // if it were a real photo of the outlet — a field evidence photo that
        // was never actually taken must never be faked.
        Alert.alert('Camera Permission Needed', 'Enable camera access to take a photo of this outlet.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        // false, matching the attendance selfie — this is field evidence, not a
        // photo the agent should be able to crop/alter before it's saved.
        allowsEditing: false,
        quality: 0.7,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        const asset = result.assets[0];
        setPhotoUri(asset.uri);
        setPhotoTakenAt(new Date());
        if (asset.width > 0 && asset.height > 0) setPhotoAspect(asset.width / asset.height);
      }
    } catch (e) {
      Alert.alert('Camera Error', 'Could not open the camera. Please try again.');
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
    if (!address.trim()) {
      Alert.alert('Required', 'Please enter the outlet address.');
      return;
    }
    // The outlet's own phone is optional; the owner's mobile is required.
    const nextPhoneProblem = phoneError(phone, false);
    const nextOwnerMobileProblem = phoneError(ownerMobile, true);
    setPhoneProblem(nextPhoneProblem);
    setOwnerMobileProblem(nextOwnerMobileProblem);
    if (nextPhoneProblem || nextOwnerMobileProblem) return;
    const outletPhone = normalizePhone(phone) || undefined;
    const ownerPhone = normalizePhone(ownerMobile);

    const typeName = pickedName(options.types, outletTypeId);
    const subChannelName = pickedName(options.subChannels, subChannelId);
    const classification = {
      outletTypeId,
      outletTypeName: typeName,
      channelId,
      channelName: pickedName(options.channels, channelId),
      subChannelId,
      subChannelName,
      distributorId,
      distributorName: pickedName(options.distributors, distributorId),
    };

    setSubmitting(true);
    const stamp = stampRef.current || (stampRef.current = newStamp(state.user.email));
    // The watermarked snapshot, not the raw camera file, is what gets uploaded
    // (or kept for an offline draft) — same as the attendance selfie.
    const uploadPhotoUri = photoUri ? await burnStampIntoPhoto(photoViewRef, photoUri) : null;
    try {
      const { outlet: created, photoUploaded, photoError } = await createOutlet(activeCampaignId, {
        name: outletName.trim(),
        outletTypeId,
        channelId,
        subChannelId,
        distributorId,
        subChannel: subChannelName,
        address: address.trim(),
        phone: outletPhone,
        ownerName: ownerName.trim() || undefined,
        ownerPhone,
        photoUri: uploadPhotoUri || undefined,
        latitude: gpsCoords?.lat,
        longitude: gpsCoords?.lng,
      }, { clientRef: stamp.clientRef, happenedAt: stamp.happenedAt });

      // Enrich with fields the API doesn't return/accept yet
      const newOutlet: Outlet = {
        ...created,
        ...classification,
        type: typeName || created.type,
        category: subChannelName,
        area: address.includes('Oniru') ? 'Oniru' : address.includes('Ikoyi') ? 'Ikoyi' : 'Lekki Phase 1',
        distance: '',
        gps: gpsLocation,
      };

      dispatch({ type: 'ADD_OUTLET', outlet: newOutlet });
      setSubmitting(false);
      // The outlet itself is saved either way — only say something if the photo
      // specifically didn't make it, so the agent knows to re-add it rather
      // than assuming the whole onboarding failed.
      if (uploadPhotoUri && !photoUploaded) {
        // Says *why*, otherwise this is just a dead end the agent can't act on
        // (and we can't diagnose) — the reason is the whole point of the message.
        Alert.alert(
          'Outlet Saved — Photo Not Uploaded',
          [
            'The outlet was onboarded successfully, but its photo could not be uploaded.',
            photoError ? `\nReason: ${photoError}` : '',
            '\nYou can add the photo by opening this outlet and tapping Edit.',
          ].join(''),
          [{ text: 'OK', onPress: () => onNavigate('outlets') }]
        );
        return;
      }
      onNavigate('outlets');
    } catch (e: any) {
      setSubmitting(false);
      if (e instanceof NetworkError) {
        // Genuine connectivity failure, not a rejection — save a real local
        // outlet (so it shows up in the list right away, same as the
        // optimistic add on success) plus a queued draft to actually push
        // once back online, instead of just losing the work.
        const draftId = `od_${Date.now()}`;
        const draftPhotoUri = uploadPhotoUri ? keepPhotoForDraft(uploadPhotoUri) : undefined;
        const optimisticOutlet: Outlet = {
          id: draftId,
          name: outletName.trim(),
          ...classification,
          type: typeName || '',
          category: subChannelName,
          area: address.includes('Oniru') ? 'Oniru' : address.includes('Ikoyi') ? 'Ikoyi' : 'Lekki Phase 1',
          address: address.trim(),
          phone: outletPhone || '',
          ownerName: ownerName.trim() || undefined,
          ownerPhone,
          isOpen: true,
          distance: '',
          status: 'pending',
          gps: gpsLocation,
          photoUri: draftPhotoUri,
          campaignId: activeCampaignId,
        };
        const outletDraft: OutletDraft = {
          ...stamp,
          id: draftId,
          mode: 'create',
          campaignId: activeCampaignId,
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
          ownerPhone,
          photoUri: draftPhotoUri,
          latitude: gpsCoords?.lat,
          longitude: gpsCoords?.lng,
          createdAt: new Date().toISOString(),
          pendingSync: true,
        };
        dispatch({ type: 'ADD_OUTLET', outlet: optimisticOutlet });
        dispatch({ type: 'SAVE_OUTLET_DRAFT', outletDraft });
        Alert.alert(
          'Saved Locally',
          "No connection, so this outlet is saved on this phone. It's sent automatically once you're back online, and you can sell and survey there meanwhile.",
        );
        onNavigate('outlets');
      } else {
        // The request reached the server and was rejected — this will never
        // succeed on retry, so don't disguise it as an offline save.
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
              <StampedPhoto
                ref={photoViewRef}
                uri={photoUri}
                aspectRatio={photoAspect}
                lines={buildStampLines(photoTakenAt, gpsStreetAddress, gpsCoords)}
              />
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

          <SelectField
            label="Outlet Type"
            title="Select outlet type"
            options={options.types || []}
            value={outletTypeId}
            placeholder={listPlaceholder(options.types, optionsLoading, 'Select outlet type')}
            onChange={setOutletTypeId}
          />

          <SelectField
            label="Outlet Channel"
            title="Select outlet channel"
            options={options.channels || []}
            value={channelId}
            placeholder={listPlaceholder(options.channels, optionsLoading, 'Select outlet channel')}
            onChange={handleChannelChange}
          />

          <SelectField
            label="Outlet sub-channel"
            title="Select outlet sub-channel"
            options={channelSubChannels}
            value={subChannelId}
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
              placeholder="Select distributor"
              onChange={setDistributorId}
            />
          )}

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
            value={ownerMobile}
            onChangeText={(text) => { setOwnerMobile(normalizePhone(text)); setOwnerMobileProblem(undefined); }}
            placeholder="08012345678"
            keyboardType="phone-pad"
            variant="field"
            error={ownerMobileProblem}
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

    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  scroll: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: 60 },
  flex1: { flex: 1 },
  sectionCard: { gap: theme.spacing.md },
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
  autoCapturedTag: { ...typography.fieldLabel, color: theme.colors.navy },
  autoCapturedCoords: { ...typography.body, color: theme.colors.textDark },
  autoCapturedTime: { ...typography.caption, color: theme.colors.textMuted },
  retryBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.cardWhite, alignItems: 'center', justifyContent: 'center' },
  photoBox: {
    width: '100%',
    minHeight: 88,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.fieldFill,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  captureRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.md },
  captureIconBox: { width: 48, height: 48, borderRadius: theme.radius.md, backgroundColor: theme.colors.cardWhite, alignItems: 'center', justifyContent: 'center' },
  captureTitle: { ...typography.title, color: theme.colors.textDark },
  captureSub: { ...typography.caption, color: theme.colors.textMuted, marginTop: 1 },
  saveBtn: { marginTop: theme.spacing.sm },
});
