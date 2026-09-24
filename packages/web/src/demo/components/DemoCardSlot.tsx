import { DemoCard } from './DemoCard';

/** 本物（~/components/DemoCardSlot）と同じ export を、同じ型で用意する */
type DemoCardSlotModule = typeof import('~/components/DemoCardSlot');

export const DemoCardSlot: DemoCardSlotModule['DemoCardSlot'] = () => <DemoCard />;
