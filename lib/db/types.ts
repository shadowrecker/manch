// Hand-written Supabase Database types matching supabase/migrations/*.sql.
// Regenerate with `supabase gen types typescript` once the project is linked;
// kept in sync by hand here so the codebase typechecks before any DB exists.
// Embedding columns (pgvector) are typed as string ('[0.1,0.2,...]').

import type { Plan } from '@/lib/plans';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
type Ts = string;

type PaidPlan = Exclude<Plan, 'free'>;
export type UsageMetric = 'posts' | 'pieces' | 'media_kits' | 'pitches';
export type PurchaseKind = 'makeover' | 'content_pack';
export type WhatsappModule = 'post' | 'reels' | 'check';
type Kind = 'script' | 'caption' | 'hashtags' | 'audio_match' | 'thumbnail' | 'repurpose' | 'calendar';
type DealStatus = 'pitched' | 'in_conversation' | 'contract_review' | 'live' | 'delivered' | 'paid';
type CommissionStatus = 'none' | 'pending' | 'collected' | 'waived';

export interface Database {
  public: {
    Tables: {
      // ── Core (0001_core.sql) ──
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          headline: string | null;
          handle: string | null;
          plan: Plan;
          team_id: string | null;
          whatsapp_e164: string | null;
          hindi_output: boolean;
          default_language: string | null;
          created_at: Ts;
          updated_at: Ts;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          headline?: string | null;
          handle?: string | null;
          plan?: Plan;
          team_id?: string | null;
          whatsapp_e164?: string | null;
          hindi_output?: boolean;
          default_language?: string | null;
          created_at?: Ts;
          updated_at?: Ts;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      teams: {
        Row: { id: string; name: string; owner_id: string; brand_voice: string | null; seats: number; created_at: Ts };
        Insert: { id?: string; name: string; owner_id: string; brand_voice?: string | null; seats?: number; created_at?: Ts };
        Update: Partial<Database['public']['Tables']['teams']['Insert']>;
        Relationships: [];
      };
      team_invites: {
        Row: { id: string; team_id: string; email: string; token: string; status: 'pending' | 'accepted' | 'revoked'; created_at: Ts };
        Insert: { id?: string; team_id: string; email: string; token: string; status?: 'pending' | 'accepted' | 'revoked'; created_at?: Ts };
        Update: Partial<Database['public']['Tables']['team_invites']['Insert']>;
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string | null;
          team_id: string | null;
          plan: PaidPlan;
          rzp_subscription_id: string | null;
          rzp_customer_id: string | null;
          status: string;
          current_period_end: Ts | null;
          cancel_at_period_end: boolean | null;
          created_at: Ts;
          updated_at: Ts;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          team_id?: string | null;
          plan: PaidPlan;
          rzp_subscription_id?: string | null;
          rzp_customer_id?: string | null;
          status: string;
          current_period_end?: Ts | null;
          cancel_at_period_end?: boolean | null;
          created_at?: Ts;
          updated_at?: Ts;
        };
        Update: Partial<Database['public']['Tables']['subscriptions']['Insert']>;
        Relationships: [];
      };
      one_time_purchases: {
        Row: {
          id: string;
          user_id: string;
          kind: PurchaseKind;
          rzp_order_id: string | null;
          rzp_payment_id: string | null;
          amount_paise: number;
          credits: number;
          status: string;
          created_at: Ts;
        };
        Insert: {
          id?: string;
          user_id: string;
          kind: PurchaseKind;
          rzp_order_id?: string | null;
          rzp_payment_id?: string | null;
          amount_paise: number;
          credits?: number;
          status: string;
          created_at?: Ts;
        };
        Update: Partial<Database['public']['Tables']['one_time_purchases']['Insert']>;
        Relationships: [];
      };
      usage_counters: {
        Row: { user_id: string; period: string; metric: UsageMetric; used: number };
        Insert: { user_id: string; period: string; metric: UsageMetric; used?: number };
        Update: Partial<Database['public']['Tables']['usage_counters']['Insert']>;
        Relationships: [];
      };
      transcriptions: {
        Row: {
          id: string;
          user_id: string;
          source: string;
          audio_path: string | null;
          provider: string;
          detected_lang: string | null;
          text: string | null;
          duration_sec: number | null;
          created_at: Ts;
        };
        Insert: {
          id?: string;
          user_id: string;
          source: string;
          audio_path?: string | null;
          provider?: string;
          detected_lang?: string | null;
          text?: string | null;
          duration_sec?: number | null;
          created_at?: Ts;
        };
        Update: Partial<Database['public']['Tables']['transcriptions']['Insert']>;
        Relationships: [];
      };
      whatsapp_messages: {
        Row: {
          wa_message_id: string;
          user_id: string | null;
          from_e164: string;
          type: string;
          module: WhatsappModule | null;
          received_at: Ts;
          processed: boolean;
        };
        Insert: {
          wa_message_id: string;
          user_id?: string | null;
          from_e164: string;
          type: string;
          module?: WhatsappModule | null;
          received_at?: Ts;
          processed?: boolean;
        };
        Update: Partial<Database['public']['Tables']['whatsapp_messages']['Insert']>;
        Relationships: [];
      };
      whatsapp_sessions: {
        Row: { from_e164: string; user_id: string | null; state: Json; updated_at: Ts };
        Insert: { from_e164: string; user_id?: string | null; state?: Json; updated_at?: Ts };
        Update: Partial<Database['public']['Tables']['whatsapp_sessions']['Insert']>;
        Relationships: [];
      };
      whatsapp_link_codes: {
        Row: { code: string; user_id: string; expires_at: Ts; created_at: Ts };
        Insert: { code: string; user_id: string; expires_at: Ts; created_at?: Ts };
        Update: Partial<Database['public']['Tables']['whatsapp_link_codes']['Insert']>;
        Relationships: [];
      };
      languages: {
        Row: {
          code: string;
          name: string;
          native_name: string;
          script: string;
          noto_font: string | null;
          sarvam_supported: boolean;
          reels_enabled: boolean;
          check_enabled: boolean;
          sort: number;
        };
        Insert: {
          code: string;
          name: string;
          native_name: string;
          script: string;
          noto_font?: string | null;
          sarvam_supported?: boolean;
          reels_enabled?: boolean;
          check_enabled?: boolean;
          sort?: number;
        };
        Update: Partial<Database['public']['Tables']['languages']['Insert']>;
        Relationships: [];
      };
      events_outbox: {
        Row: { id: number; user_id: string | null; event: string; props: Json; sent: boolean; created_at: Ts };
        Insert: { id?: number; user_id?: string | null; event: string; props?: Json; sent?: boolean; created_at?: Ts };
        Update: Partial<Database['public']['Tables']['events_outbox']['Insert']>;
        Relationships: [];
      };
      // ── Post (0002_post.sql) ──
      voice_profiles: {
        Row: {
          id: string;
          user_id: string;
          industry: string;
          seniority: string;
          topics: string[];
          tone: string;
          writing_sample: string | null;
          style_guide: string | null;
          style_guide_model: string | null;
          is_active: boolean;
          created_at: Ts;
          updated_at: Ts;
        };
        Insert: {
          id?: string;
          user_id: string;
          industry: string;
          seniority: string;
          topics?: string[];
          tone: string;
          writing_sample?: string | null;
          style_guide?: string | null;
          style_guide_model?: string | null;
          is_active?: boolean;
          created_at?: Ts;
          updated_at?: Ts;
        };
        Update: Partial<Database['public']['Tables']['voice_profiles']['Insert']>;
        Relationships: [];
      };
      drafts: {
        Row: {
          id: string;
          user_id: string;
          source: string;
          input_text: string | null;
          transcription_id: string | null;
          angle: 'story' | 'insight' | 'opinion';
          body: string;
          watermarked: boolean;
          ai_labelled: boolean;
          gen_request_id: string;
          model: string;
          status: 'draft' | 'scheduled' | 'published' | 'discarded';
          created_at: Ts;
          updated_at: Ts;
        };
        Insert: {
          id?: string;
          user_id: string;
          source: string;
          input_text?: string | null;
          transcription_id?: string | null;
          angle: 'story' | 'insight' | 'opinion';
          body: string;
          watermarked?: boolean;
          ai_labelled?: boolean;
          gen_request_id: string;
          model: string;
          status?: 'draft' | 'scheduled' | 'published' | 'discarded';
          created_at?: Ts;
          updated_at?: Ts;
        };
        Update: Partial<Database['public']['Tables']['drafts']['Insert']>;
        Relationships: [];
      };
      published_posts: {
        Row: {
          id: string;
          draft_id: string;
          user_id: string;
          platform: string;
          external_id: string | null;
          scheduled_for: Ts | null;
          published_at: Ts | null;
          status: 'scheduled' | 'published' | 'failed';
          error: string | null;
          created_at: Ts;
        };
        Insert: {
          id?: string;
          draft_id: string;
          user_id: string;
          platform?: string;
          external_id?: string | null;
          scheduled_for?: Ts | null;
          published_at?: Ts | null;
          status?: 'scheduled' | 'published' | 'failed';
          error?: string | null;
          created_at?: Ts;
        };
        Update: Partial<Database['public']['Tables']['published_posts']['Insert']>;
        Relationships: [];
      };
      audits: {
        Row: {
          id: string;
          user_id: string;
          linkedin_url: string;
          data_source: string;
          scores: Json;
          overall: number;
          fixes: Json;
          share_id: string | null;
          is_makeover: boolean;
          created_at: Ts;
        };
        Insert: {
          id?: string;
          user_id: string;
          linkedin_url: string;
          data_source: string;
          scores: Json;
          overall: number;
          fixes: Json;
          share_id?: string | null;
          is_makeover?: boolean;
          created_at?: Ts;
        };
        Update: Partial<Database['public']['Tables']['audits']['Insert']>;
        Relationships: [];
      };
      linkedin_tokens: {
        Row: {
          user_id: string;
          access_token: string;
          refresh_token: string | null;
          member_urn: string | null;
          expires_at: Ts | null;
          scopes: string[] | null;
          created_at: Ts;
        };
        Insert: {
          user_id: string;
          access_token: string;
          refresh_token?: string | null;
          member_urn?: string | null;
          expires_at?: Ts | null;
          scopes?: string[] | null;
          created_at?: Ts;
        };
        Update: Partial<Database['public']['Tables']['linkedin_tokens']['Insert']>;
        Relationships: [];
      };
      // ── Reels (0003_reels.sql) ──
      bhasha_pieces: {
        Row: {
          id: string;
          user_id: string;
          team_id: string | null;
          kind: Kind;
          language_code: string;
          platform: string | null;
          style: string | null;
          input_text: string | null;
          output: Json;
          watermarked: boolean;
          ai_labelled: boolean;
          source: string;
          model: string;
          created_at: Ts;
        };
        Insert: {
          id?: string;
          user_id: string;
          team_id?: string | null;
          kind: Kind;
          language_code: string;
          platform?: string | null;
          style?: string | null;
          input_text?: string | null;
          output: Json;
          watermarked?: boolean;
          ai_labelled?: boolean;
          source?: string;
          model: string;
          created_at?: Ts;
        };
        Update: Partial<Database['public']['Tables']['bhasha_pieces']['Insert']>;
        Relationships: [];
      };
      hashtag_sets: {
        Row: {
          id: string;
          language_code: string;
          platform: string;
          week: string;
          tags: Json;
          source: string;
          curated: boolean;
          created_at: Ts;
        };
        Insert: {
          id?: string;
          language_code: string;
          platform: string;
          week: string;
          tags: Json;
          source?: string;
          curated?: boolean;
          created_at?: Ts;
        };
        Update: Partial<Database['public']['Tables']['hashtag_sets']['Insert']>;
        Relationships: [];
      };
      trending_audio: {
        Row: {
          id: string;
          language_code: string;
          region: string | null;
          platform: string;
          title: string;
          audio_url: string;
          mood: string | null;
          week: string;
          rank: number | null;
          curated: boolean;
          created_at: Ts;
        };
        Insert: {
          id?: string;
          language_code: string;
          region?: string | null;
          platform: string;
          title: string;
          audio_url: string;
          mood?: string | null;
          week: string;
          rank?: number | null;
          curated?: boolean;
          created_at?: Ts;
        };
        Update: Partial<Database['public']['Tables']['trending_audio']['Insert']>;
        Relationships: [];
      };
      credit_wallets: {
        Row: { user_id: string; balance: number; updated_at: Ts };
        Insert: { user_id: string; balance?: number; updated_at?: Ts };
        Update: Partial<Database['public']['Tables']['credit_wallets']['Insert']>;
        Relationships: [];
      };
      credit_ledger: {
        Row: { id: number; user_id: string; delta: number; reason: string; ref: string | null; created_at: Ts };
        Insert: { id?: number; user_id: string; delta: number; reason: string; ref?: string | null; created_at?: Ts };
        Update: Partial<Database['public']['Tables']['credit_ledger']['Insert']>;
        Relationships: [];
      };
      brand_presets: {
        Row: {
          id: string;
          team_id: string;
          name: string;
          brief: string | null;
          default_languages: string[];
          voice_notes: string | null;
          created_at: Ts;
        };
        Insert: {
          id?: string;
          team_id: string;
          name: string;
          brief?: string | null;
          default_languages?: string[];
          voice_notes?: string | null;
          created_at?: Ts;
        };
        Update: Partial<Database['public']['Tables']['brand_presets']['Insert']>;
        Relationships: [];
      };
      // ── Deals (0004_deals.sql) ──
      creator_profiles: {
        Row: {
          user_id: string;
          niche: string[];
          primary_language: string | null;
          content_style: string | null;
          city: string | null;
          follower_band: string | null;
          embedding: string | null;
          updated_at: Ts;
        };
        Insert: {
          user_id: string;
          niche?: string[];
          primary_language?: string | null;
          content_style?: string | null;
          city?: string | null;
          follower_band?: string | null;
          embedding?: string | null;
          updated_at?: Ts;
        };
        Update: Partial<Database['public']['Tables']['creator_profiles']['Insert']>;
        Relationships: [];
      };
      instagram_connections: {
        Row: {
          user_id: string;
          ig_user_id: string | null;
          ig_username: string | null;
          account_type: string | null;
          access_token: string;
          token_expires: Ts | null;
          connected_at: Ts;
        };
        Insert: {
          user_id: string;
          ig_user_id?: string | null;
          ig_username?: string | null;
          account_type?: string | null;
          access_token: string;
          token_expires?: Ts | null;
          connected_at?: Ts;
        };
        Update: Partial<Database['public']['Tables']['instagram_connections']['Insert']>;
        Relationships: [];
      };
      ig_metrics: {
        Row: {
          id: string;
          user_id: string;
          followers: number | null;
          engagement_rate: number | null;
          avg_likes: number | null;
          avg_comments: number | null;
          top_categories: Json;
          audience: Json;
          source: string;
          fetched_at: Ts;
        };
        Insert: {
          id?: string;
          user_id: string;
          followers?: number | null;
          engagement_rate?: number | null;
          avg_likes?: number | null;
          avg_comments?: number | null;
          top_categories?: Json;
          audience?: Json;
          source?: string;
          fetched_at?: Ts;
        };
        Update: Partial<Database['public']['Tables']['ig_metrics']['Insert']>;
        Relationships: [];
      };
      media_kits: {
        Row: { id: string; user_id: string; data: Json; pdf_path: string | null; share_id: string | null; ai_labelled: boolean; created_at: Ts };
        Insert: { id?: string; user_id: string; data: Json; pdf_path?: string | null; share_id?: string | null; ai_labelled?: boolean; created_at?: Ts };
        Update: Partial<Database['public']['Tables']['media_kits']['Insert']>;
        Relationships: [];
      };
      brands: {
        Row: {
          id: string;
          name: string;
          website: string | null;
          logo_url: string | null;
          niche: string[];
          target_audience: string | null;
          tier_focus: string | null;
          typical_creator_size: string | null;
          signals: Json;
          embedding: string | null;
          source: string;
          curated: boolean;
          created_at: Ts;
        };
        Insert: {
          id?: string;
          name: string;
          website?: string | null;
          logo_url?: string | null;
          niche?: string[];
          target_audience?: string | null;
          tier_focus?: string | null;
          typical_creator_size?: string | null;
          signals?: Json;
          embedding?: string | null;
          source?: string;
          curated?: boolean;
          created_at?: Ts;
        };
        Update: Partial<Database['public']['Tables']['brands']['Insert']>;
        Relationships: [];
      };
      brand_matches: {
        Row: { id: string; user_id: string; brand_id: string; fit_score: number; reasons: Json; created_at: Ts };
        Insert: { id?: string; user_id: string; brand_id: string; fit_score: number; reasons?: Json; created_at?: Ts };
        Update: Partial<Database['public']['Tables']['brand_matches']['Insert']>;
        Relationships: [];
      };
      pitches: {
        Row: {
          id: string;
          user_id: string;
          brand_id: string | null;
          subject: string | null;
          body: string;
          proposed_rate_paise: number | null;
          deliverables: Json;
          status: string;
          ai_labelled: boolean;
          created_at: Ts;
        };
        Insert: {
          id?: string;
          user_id: string;
          brand_id?: string | null;
          subject?: string | null;
          body: string;
          proposed_rate_paise?: number | null;
          deliverables?: Json;
          status?: string;
          ai_labelled?: boolean;
          created_at?: Ts;
        };
        Update: Partial<Database['public']['Tables']['pitches']['Insert']>;
        Relationships: [];
      };
      rate_benchmarks: {
        Row: {
          id: string;
          niche: string;
          follower_band: string;
          deliverable: string;
          region: string | null;
          p25_paise: number | null;
          p50_paise: number | null;
          p75_paise: number | null;
          sample_size: number | null;
          source: string;
          updated_at: Ts;
        };
        Insert: {
          id?: string;
          niche: string;
          follower_band: string;
          deliverable: string;
          region?: string | null;
          p25_paise?: number | null;
          p50_paise?: number | null;
          p75_paise?: number | null;
          sample_size?: number | null;
          source: string;
          updated_at?: Ts;
        };
        Update: Partial<Database['public']['Tables']['rate_benchmarks']['Insert']>;
        Relationships: [];
      };
      deals: {
        Row: {
          id: string;
          user_id: string;
          brand_id: string | null;
          brand_name: string | null;
          title: string | null;
          value_paise: number | null;
          status: DealStatus;
          deliverables: Json;
          rzp_order_id: string | null;
          rzp_transfer_id: string | null;
          commission_paise: number | null;
          commission_status: CommissionStatus;
          created_at: Ts;
          closed_at: Ts | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          brand_id?: string | null;
          brand_name?: string | null;
          title?: string | null;
          value_paise?: number | null;
          status?: DealStatus;
          deliverables?: Json;
          rzp_order_id?: string | null;
          rzp_transfer_id?: string | null;
          commission_paise?: number | null;
          commission_status?: CommissionStatus;
          created_at?: Ts;
          closed_at?: Ts | null;
        };
        Update: Partial<Database['public']['Tables']['deals']['Insert']>;
        Relationships: [];
      };
      creator_payout_accounts: {
        Row: { user_id: string; rzp_account_id: string | null; kyc_status: string; created_at: Ts };
        Insert: { user_id: string; rzp_account_id?: string | null; kyc_status?: string; created_at?: Ts };
        Update: Partial<Database['public']['Tables']['creator_payout_accounts']['Insert']>;
        Relationships: [];
      };
      contracts: {
        Row: { id: string; deal_id: string | null; user_id: string; file_path: string | null; review: Json; created_at: Ts };
        Insert: { id?: string; deal_id?: string | null; user_id: string; file_path?: string | null; review?: Json; created_at?: Ts };
        Update: Partial<Database['public']['Tables']['contracts']['Insert']>;
        Relationships: [];
      };
      // ── Check (0005_check.sql) ──
      bot_users: {
        Row: {
          id: string;
          wa_id: string;
          user_id: string | null;
          language_pref: string;
          plan: string;
          state: Json;
          created_at: Ts;
          last_seen_at: Ts | null;
        };
        Insert: {
          id?: string;
          wa_id: string;
          user_id?: string | null;
          language_pref?: string;
          plan?: string;
          state?: Json;
          created_at?: Ts;
          last_seen_at?: Ts | null;
        };
        Update: Partial<Database['public']['Tables']['bot_users']['Insert']>;
        Relationships: [];
      };
      api_keys: {
        Row: { id: string; owner_id: string | null; org_name: string; key_hash: string; plan: string; monthly_quota: number; active: boolean; created_at: Ts };
        Insert: { id?: string; owner_id?: string | null; org_name: string; key_hash: string; plan?: string; monthly_quota?: number; active?: boolean; created_at?: Ts };
        Update: Partial<Database['public']['Tables']['api_keys']['Insert']>;
        Relationships: [];
      };
      checks: {
        Row: {
          id: string;
          bot_user_id: string | null;
          api_key_id: string | null;
          input_type: string;
          content_hash: string;
          language: string;
          trust_score: number | null;
          verdict_label: string | null;
          verdict_text: string | null;
          sources: Json;
          status: string;
          from_cache: boolean;
          latency_ms: number | null;
          created_at: Ts;
        };
        Insert: {
          id?: string;
          bot_user_id?: string | null;
          api_key_id?: string | null;
          input_type: string;
          content_hash: string;
          language: string;
          trust_score?: number | null;
          verdict_label?: string | null;
          verdict_text?: string | null;
          sources?: Json;
          status?: string;
          from_cache?: boolean;
          latency_ms?: number | null;
          created_at?: Ts;
        };
        Update: Partial<Database['public']['Tables']['checks']['Insert']>;
        Relationships: [];
      };
      claims: {
        Row: { id: string; check_id: string; claim_text: string; verdict: string; confidence: number | null; sources: Json };
        Insert: { id?: string; check_id: string; claim_text: string; verdict: string; confidence?: number | null; sources?: Json };
        Update: Partial<Database['public']['Tables']['claims']['Insert']>;
        Relationships: [];
      };
      media_analyses: {
        Row: {
          id: string;
          check_id: string;
          media_type: string;
          signals: Json;
          verdict: string | null;
          confidence: number | null;
          earliest_source: string | null;
        };
        Insert: {
          id?: string;
          check_id: string;
          media_type: string;
          signals?: Json;
          verdict?: string | null;
          confidence?: number | null;
          earliest_source?: string | null;
        };
        Update: Partial<Database['public']['Tables']['media_analyses']['Insert']>;
        Relationships: [];
      };
      corpus_docs: {
        Row: {
          id: string;
          source: string;
          title: string | null;
          url: string | null;
          published_at: Ts | null;
          lang: string | null;
          chunk: string;
          embedding: string | null;
          fetched_at: Ts;
        };
        Insert: {
          id?: string;
          source: string;
          title?: string | null;
          url?: string | null;
          published_at?: Ts | null;
          lang?: string | null;
          chunk: string;
          embedding?: string | null;
          fetched_at?: Ts;
        };
        Update: Partial<Database['public']['Tables']['corpus_docs']['Insert']>;
        Relationships: [];
      };
      verdict_cache: {
        Row: { content_hash: string; language: string; payload: Json; corpus_version: number; hits: number; created_at: Ts; expires_at: Ts | null };
        Insert: { content_hash: string; language: string; payload: Json; corpus_version: number; hits?: number; created_at?: Ts; expires_at?: Ts | null };
        Update: Partial<Database['public']['Tables']['verdict_cache']['Insert']>;
        Relationships: [];
      };
      source_registry: {
        Row: { domain: string; rating: string; updated_at: Ts };
        Insert: { domain: string; rating: string; updated_at?: Ts };
        Update: Partial<Database['public']['Tables']['source_registry']['Insert']>;
        Relationships: [];
      };
      verdict_reviews: {
        Row: { id: string; check_id: string; human_label: string; agrees: boolean; reviewer: string | null; note: string | null; created_at: Ts };
        Insert: { id?: string; check_id: string; human_label: string; agrees: boolean; reviewer?: string | null; note?: string | null; created_at?: Ts };
        Update: Partial<Database['public']['Tables']['verdict_reviews']['Insert']>;
        Relationships: [];
      };
      check_usage: {
        Row: { bot_user_id: string; period: string; checks: number };
        Insert: { bot_user_id: string; period: string; checks?: number };
        Update: Partial<Database['public']['Tables']['check_usage']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      increment_usage: {
        Args: { p_user_id: string; p_period: string; p_metric: UsageMetric; p_by: number };
        Returns: number;
      };
      grant_credits: { Args: { p_user_id: string; p_amount: number; p_reason: string; p_ref: string }; Returns: number };
      consume_credit: { Args: { p_user_id: string; p_amount: number; p_ref: string }; Returns: number };
      match_brands: { Args: { p_user_id: string; p_limit: number }; Returns: { brand_id: string; distance: number }[] };
      search_corpus: {
        Args: { p_embedding: string; p_limit: number; p_lang: string | null };
        Returns: { id: string; source: string; title: string | null; url: string | null; chunk: string; distance: number }[];
      };
      increment_check_usage: {
        Args: { p_bot_user_id: string; p_period: string; p_by: number };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// Convenience row aliases used across the app.
type T = Database['public']['Tables'];
// Core
export type ProfileRow = T['profiles']['Row'];
export type TeamRow = T['teams']['Row'];
export type TeamInviteRow = T['team_invites']['Row'];
export type SubscriptionRow = T['subscriptions']['Row'];
export type OneTimePurchaseRow = T['one_time_purchases']['Row'];
export type UsageCounterRow = T['usage_counters']['Row'];
export type TranscriptionRow = T['transcriptions']['Row'];
export type WhatsappMessageRow = T['whatsapp_messages']['Row'];
export type WhatsappSessionRow = T['whatsapp_sessions']['Row'];
export type LanguageRow = T['languages']['Row'];
// Post
export type VoiceProfileRow = T['voice_profiles']['Row'];
export type DraftRow = T['drafts']['Row'];
export type PublishedPostRow = T['published_posts']['Row'];
export type AuditRow = T['audits']['Row'];
export type LinkedinTokenRow = T['linkedin_tokens']['Row'];
// Reels
export type BhashaPieceRow = T['bhasha_pieces']['Row'];
export type HashtagSetRow = T['hashtag_sets']['Row'];
export type TrendingAudioRow = T['trending_audio']['Row'];
export type CreditWalletRow = T['credit_wallets']['Row'];
export type BrandPresetRow = T['brand_presets']['Row'];
// Deals
export type CreatorProfileRow = T['creator_profiles']['Row'];
export type IgMetricsRow = T['ig_metrics']['Row'];
export type MediaKitRow = T['media_kits']['Row'];
export type BrandRow = T['brands']['Row'];
export type BrandMatchRow = T['brand_matches']['Row'];
export type PitchRow = T['pitches']['Row'];
export type RateBenchmarkRow = T['rate_benchmarks']['Row'];
export type DealRow = T['deals']['Row'];
// Check
export type BotUserRow = T['bot_users']['Row'];
export type CheckRow = T['checks']['Row'];
export type ClaimRow = T['claims']['Row'];
export type CorpusDocRow = T['corpus_docs']['Row'];
export type MediaAnalysisRow = T['media_analyses']['Row'];
export type VerdictCacheRow = T['verdict_cache']['Row'];
export type ApiKeyRow = T['api_keys']['Row'];
export type VerdictReviewRow = T['verdict_reviews']['Row'];
export type SourceRegistryRow = T['source_registry']['Row'];
export type CheckUsageRow = T['check_usage']['Row'];
