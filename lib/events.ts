// Client-safe event taxonomy for every module. This module has NO server-only
// imports, so it can be imported from client components (which capture via
// posthog-js). lib/analytics.ts re-exports these for server-side captureServer().

export const EVENTS = {
  // Account + billing (shared)
  signup: 'signup',
  upgradeClicked: 'upgrade_clicked',
  subscriptionActivated: 'subscription_activated',
  moduleOpened: 'module_opened',
  whatsappRouted: 'whatsapp_routed',

  // Post (LinkedIn)
  voiceProfileCompleted: 'voice_profile_completed',
  voiceNoteSubmitted: 'voice_note_submitted',
  draftGenerated: 'draft_generated',
  draftEdited: 'draft_edited',
  postPublished: 'post_published',
  auditRun: 'audit_run',
  scoreShared: 'score_shared',
  teamInviteSent: 'team_invite_sent',
  teamSeatAccepted: 'team_seat_accepted',

  // Reels (regional-language short video)
  languageSelected: 'language_selected',
  pieceGenerated: 'bhasha_piece_generated',
  captionExported: 'caption_exported',
  audioMatchViewed: 'audio_match_viewed',
  contentPackPurchased: 'content_pack_purchased',
  agencyBrandPresetCreated: 'agency_brand_preset_created',

  // Deals (creator monetisation)
  instagramConnected: 'instagram_connected',
  mediaKitGenerated: 'media_kit_generated',
  brandMatchRun: 'brand_match_run',
  pitchSent: 'pitch_sent',
  rateViewed: 'rate_viewed',
  dealCreated: 'deal_created',
  dealWon: 'deal_won',
  commissionCollected: 'commission_collected',

  // Check (fact-checking)
  checkRequested: 'check_requested',
  checkCompleted: 'check_completed',
  languageOnboarded: 'language_onboarded',
  verdictReviewed: 'verdict_reviewed',
  personalSubscribed: 'personal_subscribed',
  apiKeyIssued: 'api_key_issued',
  apiCall: 'api_call',
  telcoLoi: 'telco_loi',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
