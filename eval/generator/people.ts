// FICTIONAL PEOPLE ONLY. Names, addresses and numbers are invented. ID numbers use
// an invented "VD" + 8 character pattern that is not modelled on any real ID scheme.
// Each person's ID record and address must also be in the synthetic registry
// (frontend/src/lib/authority/registry.ts); generate.ts checks this.

export interface Address {
  line: string;
  city: string;
  postcode: string;
}

export interface Avatar {
  skin: string;
  hair: string;
  hairStyle: "short" | "long" | "bun";
  shirt: string;
  bg: string;
}

export interface Person {
  key: string; // used in case ids, e.g. "p1"
  fullName: string;
  dateOfBirth: string; // ISO
  idNumber: string;
  idIssued: string; // ISO; expiry is issue + 10 years - 1 day
  address: Address;
  avatar: Avatar;
}

export const formatAddress = (a: Address) => `${a.line}, ${a.city} ${a.postcode}`;

export const PEOPLE: Person[] = [
  {
    key: "p1",
    fullName: "Elin Thornquist",
    dateOfBirth: "1988-06-14",
    idNumber: "VD4K7Q2M9T",
    idIssued: "2021-05-10",
    address: { line: "14 Quillfeather Row", city: "Ambermoor", postcode: "20417" },
    avatar: { skin: "#e8c4a0", hair: "#5a3825", hairStyle: "long", shirt: "#2f6f73", bg: "#dce8ee" },
  },
  {
    key: "p2",
    fullName: "Tobias Wrenfield",
    dateOfBirth: "1979-11-02",
    idNumber: "VD8R3N6W1H",
    idIssued: "2022-09-01",
    address: { line: "7 Brindlewick Lane", city: "Hollowmere", postcode: "31862" },
    avatar: { skin: "#a8724e", hair: "#1f1a17", hairStyle: "short", shirt: "#7a4b8c", bg: "#ece4d6" },
  },
];

// Pools the defects draw from (seeded). Alternate addresses are in the registry too,
// so an address-mismatch case only trips the cross-document check.
export const ALT_ADDRESSES: Address[] = [
  { line: "92 Saltmarsh Crescent", city: "Fennoryn", postcode: "40259" },
  { line: "3 Copperleaf Close", city: "Duskvale", postcode: "52914" },
  { line: "58 Mistlethorn Road", city: "Ambermoor", postcode: "20433" },
];

export const ALT_FIRST_NAMES = ["Harriet", "Corin", "Maelis", "Odran", "Sefa", "Juno", "Brannoch", "Ilsabet"];
