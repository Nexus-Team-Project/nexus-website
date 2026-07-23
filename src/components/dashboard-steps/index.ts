// Barrel for the send-a-gift dashboard step mocks. Exports GIFT_FLOW_STEPS in
// the REAL wizard order (derived from each source page's navigation):
//   event -> brands (מתנה) -> greeting (ברכה) -> recipients (נמענים) -> summary.
// A marketing carousel imports this array and scales each fixed-size mock into
// its slide. Each Component renders a self-contained 1200x820 desktop frame.
import type { ComponentType } from 'react';
import EventStep from './EventStep';
import BrandsStep from './BrandsStep';
import GreetingStep from './GreetingStep';
import RecipientsStep from './RecipientsStep';
import SummaryStep from './SummaryStep';
import { STEP_WIDTH, STEP_HEIGHT } from './WizardShell';

export interface GiftFlowStep {
  key: string;
  title: string;
  titleEn: string;
  Component: ComponentType;
}

export const GIFT_FLOW_STEPS: GiftFlowStep[] = [
  { key: 'event', title: 'בחירת אירוע', titleEn: 'Event', Component: EventStep },
  { key: 'brands', title: 'בחירת מתנה', titleEn: 'Gift', Component: BrandsStep },
  { key: 'greeting', title: 'ברכה אישית', titleEn: 'Greeting', Component: GreetingStep },
  { key: 'recipients', title: 'בחירת נמענים', titleEn: 'Recipients', Component: RecipientsStep },
  { key: 'summary', title: 'סיכום ותשלום', titleEn: 'Summary', Component: SummaryStep },
];

export { STEP_WIDTH, STEP_HEIGHT };
export { EventStep, BrandsStep, GreetingStep, RecipientsStep, SummaryStep };
