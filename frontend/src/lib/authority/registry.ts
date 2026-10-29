// SYNTHETIC DATA ONLY. Stands in for government ID / address / company registries.
export interface RegistryPerson { documentNumber: string; fullName: string; dateOfBirth: string; status: "valid" | "reported_lost" | "revoked" }

const PEOPLE: RegistryPerson[] = [
  { documentNumber: "P8234519", fullName: "Emily Carter", dateOfBirth: "1991-04-12", status: "valid" },
  { documentNumber: "D5520193", fullName: "Emily Carter", dateOfBirth: "1991-04-12", status: "valid" },
  { documentNumber: "N7781042", fullName: "Emily Carter", dateOfBirth: "1991-04-12", status: "valid" },
  { documentNumber: "P1100234", fullName: "Daniel Okafor", dateOfBirth: "1985-11-03", status: "reported_lost" },
  // Fictional specimen people; keep in sync with eval/generator/people.ts (the generator verifies this).
  { documentNumber: "VD4K7Q2M9T", fullName: "Elin Thornquist", dateOfBirth: "1988-06-14", status: "valid" },
  { documentNumber: "VD8R3N6W1H", fullName: "Tobias Wrenfield", dateOfBirth: "1979-11-02", status: "valid" },
];
const ADDRESSES = [
  "42 willow lane, springfield, il 62704", "18 harbor street, portland, me 04101",
  // Fictional specimen addresses (eval/generator/people.ts).
  "14 quillfeather row, ambermoor 20417", "7 brindlewick lane, hollowmere 31862",
  "92 saltmarsh crescent, fennoryn 40259", "3 copperleaf close, duskvale 52914", "58 mistlethorn road, ambermoor 20433",
];

export const lookupDocument = (documentNumber: string) => PEOPLE.find((p) => p.documentNumber === documentNumber.trim().toUpperCase()) ?? null;
export const addressExists = (address: string) => ADDRESSES.includes(address.trim().toLowerCase().replace(/\s+/g, " "));
