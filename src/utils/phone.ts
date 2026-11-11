/** Shown under a phone field whose number isn't valid. The backend checks numbers with the same rule. */
export const PHONE_FORMAT_MESSAGE = 'Enter an 11-digit phone number starting with 0, e.g. 08012345678.';

/**
 * A phone number as the agent types or pastes it, tidied: spaces, dashes,
 * dots, brackets and the + go; a +234 / 234 number becomes 0 plus its last
 * 10 digits once it's complete (13 digits, or 14 with the 0 some write after
 * the country code, as in +234 (0) 801...); any other number stops at 11
 * digits. A +234 number still being typed is left as typed so it can be
 * finished — capping it at 11 would cut it off before it's converted, which
 * is also why phone fields don't use a TextInput maxLength.
 */
export const normalizePhone = (text: string): string => {
  const digits = text.replace(/\D/g, '');
  if (digits.startsWith('2340')) return digits.length >= 14 ? `0${digits.slice(4, 14)}` : digits;
  if (digits.startsWith('234')) return digits.length >= 13 ? `0${digits.slice(3, 13)}` : digits;
  return digits.slice(0, 11);
};

/** Exactly 11 digits starting with 0. */
export const isValidPhone = (phone: string): boolean => /^0\d{10}$/.test(phone);

/** The message for a phone field, or undefined when it's fine. A blank number is fine unless it's required. */
export const phoneError = (value: string, required: boolean): string | undefined => {
  const phone = normalizePhone(value);
  if (!phone) return required ? PHONE_FORMAT_MESSAGE : undefined;
  return isValidPhone(phone) ? undefined : PHONE_FORMAT_MESSAGE;
};
