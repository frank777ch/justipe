// Las utilidades de fechas viven en @justipe/shared para que la app offline
// calcule igual que la API. Se reexportan aquí para no cambiar los imports.
export {
  APP_TIME_ZONE,
  formatDate,
  lastDayOfMonth,
  maxDate,
  nextOccurrenceAfter,
  nextOccurrenceOnOrAfter,
  occurrencesInMonth,
  parseDate,
  todayInLima,
  type Schedule,
} from '@justipe/shared';
