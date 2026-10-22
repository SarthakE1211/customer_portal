export type StageKey = 'created' | 'accepted' | 'rejected' | 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
export type Priority = 'P1' | 'P2' | 'P3' | 'P4';

/** One work order, as the portal uses it (mapped from customerDashboard/get). */
export interface Ticket {
  dbId: number;
  id: string;
  clientTicket: string;
  jobCard: string;
  customerId: number;
  customer: string;
  created: Date;
  visit: Date;
  monthKey: string;
  stage: StageKey;
  statusName: string;
  priorityName: string;
  pr: Priority;
  city: string;
  state: string;
  stateCode: string;
  region: string;
  pin: string;
  service: string;
  technician: string;
  hasTechnician: boolean;
  source: string;
  visitType: string;
  visitTypeGuessed: boolean;
  hours: number | null;
  age: number;
  billed: number;
  slaMet: boolean;
  slaReason: string;
  ticketType: string | null;
}

export interface RemoteArea { city: string; state: string; pin: string; nearest: string; }

export interface Stage { k: StageKey; label: string; bg: string; fg: string; tint: string; border: string; text: string; dot: string; }

/** order_status_master ids 1-7, in the order the design shows them. */
export const STAGES: Stage[] = [
  { k: 'created', label: 'Work Order Created', bg: 'linear-gradient(135deg,#C089DE 0%,#A961CF 100%)', fg: '#fff', tint: '#F4EDFA', border: '#E2D2F0', text: '#7B4AA8', dot: '#A961CF' },
  { k: 'accepted', label: 'Accepted', bg: 'linear-gradient(135deg,#F7DD4A 0%,#EFC71C 100%)', fg: '#16181D', tint: '#FBF7E4', border: '#EFE4B6', text: '#8A6D00', dot: '#EFC71C' },
  { k: 'rejected', label: 'Rejected', bg: 'linear-gradient(135deg,#EF6070 0%,#E44A5C 100%)', fg: '#fff', tint: '#FDEFF1', border: '#F6CBD1', text: '#C0263A', dot: '#E44A5C' },
  { k: 'scheduled', label: 'Scheduled', bg: 'linear-gradient(135deg,#5F9EE3 0%,#3E85D2 100%)', fg: '#fff', tint: '#EEF4FB', border: '#CFE0F3', text: '#2E6BA8', dot: '#3E85D2' },
  { k: 'ongoing', label: 'Ongoing', bg: 'linear-gradient(135deg,#FBA23A 0%,#F5760C 100%)', fg: '#fff', tint: '#FEF3E7', border: '#F8DDBB', text: '#B45C09', dot: '#F5760C' },
  { k: 'completed', label: 'Completed', bg: 'linear-gradient(135deg,#79C77A 0%,#57B45A 100%)', fg: '#fff', tint: '#EFF6F0', border: '#CFE6D1', text: '#2A7A3C', dot: '#57B45A' },
  { k: 'cancelled', label: 'Cancelled', bg: 'linear-gradient(135deg,#E30613 0%,#C10510 100%)', fg: '#fff', tint: '#FDECEE', border: '#F6C7CB', text: '#B0102A', dot: '#C10510' }
];
export const STAGE_BY_STATUS: Record<number, StageKey> = { 1: 'created', 2: 'accepted', 3: 'rejected', 4: 'scheduled', 5: 'ongoing', 6: 'completed', 7: 'cancelled' };
export const OPEN_STAGES: StageKey[] = ['created', 'accepted', 'scheduled', 'ongoing'];
export const stageOf = (k: StageKey): Stage => STAGES.find(s => s.k === k) || STAGES[0];

export interface PriorityStyle { bg: string; border: string; color: string; fill: string; desc: string; }
export const PRIORITIES: Priority[] = ['P1', 'P2', 'P3', 'P4'];
export const PRC: Record<Priority, PriorityStyle> = {
  P1: { bg: '#FCF1F3', border: '#F0C6CE', color: '#B0102A', fill: '#B0102A', desc: 'Critical — response ≤ 4 h' },
  P2: { bg: '#FBF5E7', border: '#EFE0BD', color: '#8A6000', fill: '#C98A00', desc: 'High — response ≤ 8 h' },
  P3: { bg: '#F4F1FA', border: '#DED4F0', color: '#5B3E9B', fill: '#6B4FA8', desc: 'Medium — response ≤ 1 day' },
  P4: { bg: '#EFF3F8', border: '#D3DEEA', color: '#2E6BA8', fill: '#2E6BA8', desc: 'Routine — over 1 day' }
};

export const VISIT_TYPES = ['Dispatch', 'Scheduled visit', 'Backfill'];
