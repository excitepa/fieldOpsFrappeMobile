import { GeofenceConfig } from '../types';
import { distanceMeters } from './geo';

/** The server's default GPS tolerance, used until the agent's geofence has loaded. */
export const DEFAULT_TOLERANCE_M = 100;

/** A GPS fix for a sale: where, how accurate (meters), and when it was taken. */
export interface LocationFix {
  lat: number;
  lng: number;
  accuracy?: number;
  /** Local time, "YYYY-MM-DD HH:MM:SS", as the server reads it. */
  capturedAt: string;
}

export interface SaleLocationCheck {
  /** null when there's no distance check: the outlet has no saved location, or there's no fix. */
  atOutlet: boolean | null;
  distanceM: number | null;
  /** null when there's no territory check: no geofence on the device yet, or no fix. */
  insideTerritory: boolean | null;
  /** What to tell the agent; empty when the sale's location is fine. */
  problems: string[];
}

/** "350 m", "1.2 km": a distance the way the warning says it. */
const metersText = (m: number): string => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

/** Ray casting over one ring of [lng, lat] positions. */
const inRing = (lat: number, lng: number, ring: number[][]): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** Inside a polygon's outer ring and none of its holes. */
const inPolygon = (lat: number, lng: number, rings: number[][][]): boolean =>
  rings.length > 0 && inRing(lat, lng, rings[0]) && !rings.slice(1).some((hole) => inRing(lat, lng, hole));

/** The geometries in a GeoJSON value: a FeatureCollection, Feature, geometry, or the JSON text of one. */
const geometriesOf = (geojson: any): any[] => {
  let value = geojson;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!value || typeof value !== 'object') return [];
  if (value.type === 'FeatureCollection') return (value.features || []).flatMap(geometriesOf);
  if (value.type === 'Feature') return geometriesOf(value.geometry);
  if (value.type === 'GeometryCollection') return (value.geometries || []).flatMap(geometriesOf);
  return [value];
};

/** Whether a point is inside any Polygon or MultiPolygon of a GeoJSON value (holes excluded). */
export const pointInGeoJson = (lat: number, lng: number, geojson: any): boolean =>
  geometriesOf(geojson).some((g) =>
    g?.type === 'Polygon'
      ? inPolygon(lat, lng, g.coordinates || [])
      : g?.type === 'MultiPolygon'
        ? (g.coordinates || []).some((polygon: number[][][]) => inPolygon(lat, lng, polygon))
        : false
  );

/**
 * A sale's location against the outlet's saved location and the agent's
 * territory, the way the server checks it. At the outlet: within the
 * tolerance plus the fix's accuracy, the accuracy counted up to the tolerance
 * at most; an outlet with no saved location gets no distance check. Inside
 * the territory: the agent has none, may work outside, or the fix is inside
 * one; without a geofence on the device (not loaded yet, or a backend without
 * get_my_geofence) there's no territory check. Being outside never blocks a
 * sale; the problems are what the agent is told before recording it anyway.
 */
export function checkSaleLocation(
  fix: LocationFix | null,
  outlet: { name: string; coords: { lat: number; lng: number } | null },
  geofence: GeofenceConfig | null
): SaleLocationCheck {
  if (!fix) return { atOutlet: null, distanceM: null, insideTerritory: null, problems: ["Your location isn't available."] };
  const tolerance = geofence?.toleranceM || DEFAULT_TOLERANCE_M;
  const problems: string[] = [];

  let atOutlet: boolean | null = null;
  let distanceM: number | null = null;
  if (outlet.coords) {
    distanceM = distanceMeters(fix, outlet.coords);
    atOutlet = distanceM <= tolerance + Math.min(Math.max(fix.accuracy || 0, 0), tolerance);
    if (!atOutlet) problems.push(`You're ${metersText(distanceM)} from ${outlet.name} (it should be within ${metersText(tolerance)}).`);
  }

  let insideTerritory: boolean | null = null;
  if (geofence) {
    insideTerritory = geofence.allowedOutside
      || geofence.territories.length === 0
      || geofence.territories.some((t) => pointInGeoJson(fix.lat, fix.lng, t.geojson));
    if (!insideTerritory) problems.push(`You're outside your territory (${geofence.territories.map((t) => t.name).join(', ')}).`);
  }

  return { atOutlet, distanceM, insideTerritory, problems };
}
