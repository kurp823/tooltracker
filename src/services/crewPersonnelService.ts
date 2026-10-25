import { CrewPersonnel } from '../types';

const CREW_STORAGE_KEY = 'emdad_master_crew_personnel';

export const INITIAL_CREW_PERSONNEL: CrewPersonnel[] = [
  {
    id: 'CREW-001',
    badgeNo: 'EMD-4102',
    name: 'Ahmed Al-Mansoor',
    role: 'Lead Fishing & Whipstock Specialist',
    phone: '+971 50 123 4567',
    email: 'ahmed.mansoor@emdad.ae',
    rigPassNo: 'ADNOC-RP-88412',
    h2sExpiry: '2027-04-15',
    bosietExpiry: '2027-08-20',
    medicalExpiry: '2027-01-10',
    status: 'Active',
    dayRateAED: 3500,
  },
  {
    id: 'CREW-002',
    badgeNo: 'EMD-3841',
    name: 'Rajesh Sharma',
    role: 'Senior Downhole Tool Engineer',
    phone: '+971 50 234 5678',
    email: 'rajesh.sharma@emdad.ae',
    rigPassNo: 'ADNOC-RP-77219',
    h2sExpiry: '2026-12-10',
    bosietExpiry: '2027-05-12',
    medicalExpiry: '2026-11-30',
    status: 'Active',
    dayRateAED: 3200,
  },
  {
    id: 'CREW-003',
    badgeNo: 'EMD-5109',
    name: 'David Wass',
    role: 'Whipstock Operations Specialist',
    phone: '+971 50 345 6789',
    email: 'david.wass@emdad.ae',
    rigPassNo: 'ADNOC-RP-90114',
    h2sExpiry: '2027-02-18',
    bosietExpiry: '2027-09-01',
    medicalExpiry: '2027-03-15',
    status: 'Active',
    dayRateAED: 3800,
  },
  {
    id: 'CREW-004',
    badgeNo: 'EMD-2940',
    name: 'Toufik Boussouar',
    role: 'Senior Fishing Operations Supervisor',
    phone: '+971 50 456 7890',
    email: 'toufik.boussouar@emdad.ae',
    rigPassNo: 'ADNOC-RP-66320',
    h2sExpiry: '2027-06-25',
    bosietExpiry: '2027-11-14',
    medicalExpiry: '2027-05-10',
    status: 'Active',
    dayRateAED: 4000,
  },
  {
    id: 'CREW-005',
    badgeNo: 'EMD-3188',
    name: 'Luke Irondi',
    role: 'Field Service Engineer (Casing Exit & Mills)',
    phone: '+971 50 567 8901',
    email: 'luke.irondi@emdad.ae',
    rigPassNo: 'ADNOC-RP-81203',
    h2sExpiry: '2026-11-20',
    bosietExpiry: '2027-03-30',
    medicalExpiry: '2026-12-05',
    status: 'Active',
    dayRateAED: 3400,
  },
  {
    id: 'CREW-006',
    badgeNo: 'EMD-4472',
    name: 'Mohamed Ahmed Mahmoud',
    role: 'Downhole Rentals Field Engineer',
    phone: '+971 50 678 9012',
    email: 'mohamed.mahmoud@emdad.ae',
    rigPassNo: 'ADNOC-RP-95021',
    h2sExpiry: '2027-08-11',
    bosietExpiry: '2028-01-20',
    medicalExpiry: '2027-07-15',
    status: 'Active',
    dayRateAED: 3000,
  },
  {
    id: 'CREW-007',
    badgeNo: 'EMD-5821',
    name: 'Samir Isayev',
    role: 'Fishing & Redress Tech Specialist',
    phone: '+971 50 789 0123',
    email: 'samir.isayev@emdad.ae',
    rigPassNo: 'ADNOC-RP-74190',
    h2sExpiry: '2027-03-05',
    bosietExpiry: '2027-07-22',
    medicalExpiry: '2027-02-28',
    status: 'Active',
    dayRateAED: 3100,
  },
];

export function loadCrewPersonnel(): CrewPersonnel[] {
  if (typeof window === 'undefined') return INITIAL_CREW_PERSONNEL;
  try {
    const raw = localStorage.getItem(CREW_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('[CrewPersonnel] Failed to load from localStorage:', e);
  }
  saveAllCrewPersonnel(INITIAL_CREW_PERSONNEL);
  return INITIAL_CREW_PERSONNEL;
}

export function saveAllCrewPersonnel(crew: CrewPersonnel[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CREW_STORAGE_KEY, JSON.stringify(crew));
    window.dispatchEvent(new Event('crew_updated'));
  } catch (e) {
    console.warn('[CrewPersonnel] Failed to save to localStorage:', e);
  }
}

export function addCrewPersonnel(member: Omit<CrewPersonnel, 'id'>): CrewPersonnel {
  const current = loadCrewPersonnel();
  const id = `CREW-${Date.now().toString().slice(-4)}`;
  const newMember: CrewPersonnel = {
    ...member,
    id,
    badgeNo: member.badgeNo.trim().toUpperCase(),
    name: member.name.trim(),
  };
  const updated = [newMember, ...current];
  saveAllCrewPersonnel(updated);
  return newMember;
}

export function updateCrewPersonnel(id: string, updates: Partial<CrewPersonnel>): CrewPersonnel[] {
  const current = loadCrewPersonnel();
  const updated = current.map((m) => (m.id === id ? { ...m, ...updates } : m));
  saveAllCrewPersonnel(updated);
  return updated;
}

export function deleteCrewPersonnel(id: string): CrewPersonnel[] {
  const current = loadCrewPersonnel();
  const updated = current.filter((m) => m.id !== id);
  saveAllCrewPersonnel(updated);
  return updated;
}
