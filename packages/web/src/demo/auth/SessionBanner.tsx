import { DemoCard } from '../DemoCard';

/** 本物（~/auth/SessionBanner）と同じ export を、同じ型で用意する */
type SessionBannerModule = typeof import('~/auth/SessionBanner');

export const SessionBanner: SessionBannerModule['SessionBanner'] = () => <DemoCard />;
