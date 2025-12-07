import parsePhoneNumber, { type CountryCode } from 'libphonenumber-js';

export type FormattedPhoneNumber = {
  formatted: string;
  uri: string;
};

/**
 * Format a phone number for display and create a tel: URI
 * @param phoneNumber - The phone number string to format
 * @param defaultCountry - The default country code (defaults to 'US')
 * @returns Object containing formatted phone number and URI, or null if parsing fails
 */
export function formatPhoneNumber(
  phoneNumber: string,
  defaultCountry: CountryCode = 'US',
): FormattedPhoneNumber | null {
  try {
    const parsed = parsePhoneNumber(phoneNumber, defaultCountry);
    if (parsed) {
      return {
        formatted: parsed.formatNational(),
        uri: parsed.getURI(),
      };
    }
    // If parsing fails, create a basic URI by stripping non-digits
    return {
      formatted: phoneNumber,
      uri: `tel:${phoneNumber.replace(/[^0-9+]/g, '')}`,
    };
  } catch {
    // If parsing fails completely, create a basic URI by stripping non-digits
    return {
      formatted: phoneNumber,
      uri: `tel:${phoneNumber.replace(/[^0-9+]/g, '')}`,
    };
  }
}
