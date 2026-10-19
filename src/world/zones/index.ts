import type { ZoneBuilder } from '../types';
import { buildTerrain } from './terrain';
import { buildGate } from './gate';
import { buildEccZone } from './ecc';
import { buildPfeiffer } from './pfeiffer';
import { buildAuditorium } from './auditorium';
import { buildAvenue } from './avenue';
import { buildLawn } from './lawn';
import { buildPeople } from './people';

/** Built in this order; `?only=gate,ecc` builds a subset (terrain always). */
export const ZONES: Record<string, ZoneBuilder> = {
  terrain: buildTerrain,
  gate: buildGate,
  ecc: buildEccZone,
  pfeiffer: buildPfeiffer,
  auditorium: buildAuditorium,
  avenue: buildAvenue,
  lawn: buildLawn,
  people: buildPeople,
};
