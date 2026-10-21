import { describe, it, expect } from 'vitest';
import { EVENTS } from '@/lib/events';

const EXPECTED: Record<string, string> = {
  signup: 'signup',
  voiceProfileCompleted: 'voice_profile_completed',
  voiceNoteSubmitted: 'voice_note_submitted',
  draftGenerated: 'draft_generated',
  draftEdited: 'draft_edited',
  postPublished: 'post_published',
  auditRun: 'audit_run',
  scoreShared: 'score_shared',
  upgradeClicked: 'upgrade_clicked',
  subscriptionActivated: 'subscription_activated',
  teamInviteSent: 'team_invite_sent',
  teamSeatAccepted: 'team_seat_accepted',
};

// The core EVENTS is the union of every module's taxonomy; Post relies on
// these 12 keys keeping their original (Folio) names.
describe('EVENTS', () => {
  it('includes all 12 Post event keys', () => {
    for (const key of Object.keys(EXPECTED)) expect(EVENTS).toHaveProperty(key);
  });

  it('maps each key to its expected snake_case event name', () => {
    for (const [key, value] of Object.entries(EXPECTED)) {
      expect(EVENTS[key as keyof typeof EVENTS]).toBe(value);
    }
  });

  it('uses snake_case (or lowercase) names with no spaces or capitals', () => {
    for (const value of Object.values(EVENTS)) {
      expect(value).toMatch(/^[a-z]+(?:_[a-z]+)*$/);
    }
  });

  it('has unique values across all events', () => {
    const values = Object.values(EVENTS);
    expect(new Set(values).size).toBe(values.length);
  });
});
