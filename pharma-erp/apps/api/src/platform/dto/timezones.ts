/**
 * IANA zones this MVP accepts. Kept small and explicit rather than accepting any
 * string: manufacturing and expiry dates are legally meaningful, so an
 * unresolvable zone is a compliance problem rather than a display glitch.
 */
export const SUPPORTED_TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'UTC',
] as const;
