export type PhoneFormat = "us" | "international" | "eu" | "none";

export const phoneFormatConfig: Record<PhoneFormat, { label: string; example: string }> = {
  us: { label: "US", example: "(123) 456-7890" },
  international: { label: "International", example: "+1 234 567 8900" },
  eu: { label: "European", example: "+33 1 23 45 67 89" },
  none: { label: "No formatting", example: "1234567890" },
};

export const phoneFormatOptions: PhoneFormat[] = ["us", "international", "eu", "none"];

function stripNonDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function formatPhoneNumber(phone: string | null | undefined, format: PhoneFormat = "us"): string {
  if (!phone) return "";
  
  const digits = stripNonDigits(phone);
  
  if (!digits) return phone;
  
  switch (format) {
    case "us":
      if (digits.length === 10) {
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
      } else if (digits.length === 11 && digits[0] === "1") {
        return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
      }
      return phone;
      
    case "international":
      if (digits.length >= 10) {
        const hasCountryCode = digits.length > 10;
        if (hasCountryCode) {
          const countryCode = digits.slice(0, digits.length - 10);
          const rest = digits.slice(-10);
          return `+${countryCode} ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`;
        }
        return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
      }
      return phone;
      
    case "eu":
      if (digits.length >= 9) {
        const hasCountryCode = digits.length > 9;
        if (hasCountryCode) {
          const countryCode = digits.slice(0, digits.length - 9);
          const rest = digits.slice(-9);
          return `+${countryCode} ${rest.slice(0, 1)} ${rest.slice(1, 3)} ${rest.slice(3, 5)} ${rest.slice(5, 7)} ${rest.slice(7)}`;
        }
        return `${digits.slice(0, 1)} ${digits.slice(1, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)} ${digits.slice(7)}`;
      }
      return phone;
      
    case "none":
    default:
      return phone;
  }
}

export function formatPhoneAsYouType(phone: string, format: PhoneFormat = "us"): string {
  const digits = stripNonDigits(phone);
  
  if (!digits) return "";
  
  switch (format) {
    case "us":
      if (digits.length <= 3) {
        return `(${digits}`;
      } else if (digits.length <= 6) {
        return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
      } else if (digits.length <= 10) {
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
      } else {
        return `+${digits.slice(0, digits.length - 10)} (${digits.slice(-10, -7)}) ${digits.slice(-7, -4)}-${digits.slice(-4)}`;
      }
      
    case "international":
      if (digits.length <= 3) {
        return `+${digits}`;
      } else if (digits.length <= 6) {
        return `+${digits.slice(0, digits.length - 3)} ${digits.slice(-3)}`;
      } else if (digits.length <= 10) {
        return `+${digits.slice(0, digits.length - 6)} ${digits.slice(-6, -3)} ${digits.slice(-3)}`;
      } else {
        return `+${digits.slice(0, digits.length - 10)} ${digits.slice(-10, -7)} ${digits.slice(-7, -4)} ${digits.slice(-4)}`;
      }
      
    case "eu":
      if (digits.length <= 2) {
        return `+${digits}`;
      } else if (digits.length <= 4) {
        return `+${digits.slice(0, 2)} ${digits.slice(2)}`;
      } else if (digits.length <= 6) {
        return `+${digits.slice(0, 2)} ${digits.slice(2, 3)} ${digits.slice(3)}`;
      } else if (digits.length <= 8) {
        return `+${digits.slice(0, 2)} ${digits.slice(2, 3)} ${digits.slice(3, 5)} ${digits.slice(5)}`;
      } else if (digits.length <= 10) {
        return `+${digits.slice(0, 2)} ${digits.slice(2, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)} ${digits.slice(7)}`;
      } else {
        return `+${digits.slice(0, 2)} ${digits.slice(2, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
      }
      
    case "none":
    default:
      return digits;
  }
}
