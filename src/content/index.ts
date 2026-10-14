// What: typed game data: content/*.json parsed through the schemas once at load (unknown keys dropped, types inferred).
// Called by: src/sim, src/scene, src/ui, src/main.ts — everything that needs numbers, names or colors.
// Keep: no other module imports content json directly; a schema failure here means verify was skipped.

import * as v from 'valibot';
import eggsJson from '@content/eggs.json';
import speciesJson from '@content/species.json';
import customersJson from '@content/customers.json';
import upgradesJson from '@content/upgrades.json';
import calendarJson from '@content/calendar.json';
import styleJson from '@content/style.json';
import ftueJson from '@content/ftue.json';
import feelJson from '@content/feel.json';
import audioJson from '@content/audio.json';
import newsJson from '@content/news.json';
import eventsJson from '@content/events.json';
import ruJson from '@content/i18n/ru.json';
import enJson from '@content/i18n/en.json';
import { AudioFile, CalendarFile, CustomersFile, EggsFile, FeelFile, FtueFile, I18nFile, NewsFile, EventsFile, SpeciesFile, StyleFile, UpgradesFile, type LangName } from './schemas.ts';

export const eggs = v.parse(EggsFile, eggsJson);
export const species = v.parse(SpeciesFile, speciesJson);
export const customers = v.parse(CustomersFile, customersJson);
export const upgrades = v.parse(UpgradesFile, upgradesJson);
export const calendar = v.parse(CalendarFile, calendarJson);
export const style = v.parse(StyleFile, styleJson);
export const ftue = v.parse(FtueFile, ftueJson);
/** Mutable on purpose: the ?debug=1 sliders tune it live (CLAUDE.md, «Как работать» p. 5). */
export const feel = v.parse(FeelFile, feelJson);
export const audio = v.parse(AudioFile, audioJson);
export const news = v.parse(NewsFile, newsJson);
export const events = v.parse(EventsFile, eventsJson);

function dictionary(json: Record<string, unknown>): Record<string, string> {
  const { $schema: _s, note: _n, ...rest } = json;
  return v.parse(I18nFile, rest);
}
export const dictionaries: Record<LangName, Record<string, string>> = { ru: dictionary(ruJson), en: dictionary(enJson) };

export function speciesById(id: string) {
  return species.species.find((s) => s.id === id);
}
export function eggById(id: string) {
  return eggs.eggs.find((e) => e.id === id);
}
