export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      alias_words: {
        Row: {
          kind: string;
          word: string;
        };
        Insert: {
          kind: string;
          word: string;
        };
        Update: {
          kind?: string;
          word?: string;
        };
        Relationships: [];
      };
      banned_phones: {
        Row: {
          created_at: string;
          phone_hash: string;
        };
        Insert: {
          created_at?: string;
          phone_hash: string;
        };
        Update: {
          created_at?: string;
          phone_hash?: string;
        };
        Relationships: [];
      };
      blocks: {
        Row: {
          blocked_alias: string;
          blocked_id: string;
          blocker_id: string;
          created_at: string;
          id: string;
        };
        Insert: {
          blocked_alias: string;
          blocked_id: string;
          blocker_id: string;
          created_at?: string;
          id?: string;
        };
        Update: {
          blocked_alias?: string;
          blocked_id?: string;
          blocker_id?: string;
          created_at?: string;
          id?: string;
        };
        Relationships: [];
      };
      cards: {
        Row: {
          deck: string;
          forbidden: string[] | null;
          id: string;
          is_active: boolean;
          prompt: string | null;
          source_key: string;
          theme: string | null;
          word: string | null;
        };
        Insert: {
          deck: string;
          forbidden?: string[] | null;
          id?: string;
          is_active?: boolean;
          prompt?: string | null;
          source_key: string;
          theme?: string | null;
          word?: string | null;
        };
        Update: {
          deck?: string;
          forbidden?: string[] | null;
          id?: string;
          is_active?: boolean;
          prompt?: string | null;
          source_key?: string;
          theme?: string | null;
          word?: string | null;
        };
        Relationships: [];
      };
      dm_messages: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          sender_user_id: string;
          thread_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          sender_user_id: string;
          thread_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          sender_user_id?: string;
          thread_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'dm_messages_thread_id_fkey';
            columns: ['thread_id'];
            isOneToOne: false;
            referencedRelation: 'dm_threads';
            referencedColumns: ['id'];
          },
        ];
      };
      dm_reads: {
        Row: {
          last_delivered_at: string | null;
          last_read_at: string;
          thread_id: string;
          user_id: string;
        };
        Insert: {
          last_delivered_at?: string | null;
          last_read_at?: string;
          thread_id: string;
          user_id: string;
        };
        Update: {
          last_delivered_at?: string | null;
          last_read_at?: string;
          thread_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'dm_reads_thread_id_fkey';
            columns: ['thread_id'];
            isOneToOne: false;
            referencedRelation: 'dm_threads';
            referencedColumns: ['id'];
          },
        ];
      };
      dm_threads: {
        Row: {
          created_at: string;
          id: string;
          last_message_at: string | null;
          user_a: string;
          user_b: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          last_message_at?: string | null;
          user_a: string;
          user_b: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          last_message_at?: string | null;
          user_a?: string;
          user_b?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'dm_threads_user_a_user_b_fkey';
            columns: ['user_a', 'user_b'];
            isOneToOne: true;
            referencedRelation: 'friendships';
            referencedColumns: ['user_a', 'user_b'];
          },
        ];
      };
      friend_requests: {
        Row: {
          created_at: string;
          encounter_id: string | null;
          from_user_id: string;
          id: string;
          responded_at: string | null;
          source: string;
          status: string;
          to_user_id: string;
          venue_chat_context: Json | null;
        };
        Insert: {
          created_at?: string;
          encounter_id?: string | null;
          from_user_id: string;
          id?: string;
          responded_at?: string | null;
          source?: string;
          status?: string;
          to_user_id: string;
          venue_chat_context?: Json | null;
        };
        Update: {
          created_at?: string;
          encounter_id?: string | null;
          from_user_id?: string;
          id?: string;
          responded_at?: string | null;
          source?: string;
          status?: string;
          to_user_id?: string;
          venue_chat_context?: Json | null;
        };
        Relationships: [];
      };
      friendships: {
        Row: {
          created_at: string;
          source: string;
          user_a: string;
          user_b: string;
        };
        Insert: {
          created_at?: string;
          source: string;
          user_a: string;
          user_b: string;
        };
        Update: {
          created_at?: string;
          source?: string;
          user_a?: string;
          user_b?: string;
        };
        Relationships: [];
      };
      game_events: {
        Row: {
          created_at: string;
          id: string;
          payload: Json;
          room_id: string;
          session_id: string | null;
          turn_id: string | null;
          type: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          payload?: Json;
          room_id: string;
          session_id?: string | null;
          turn_id?: string | null;
          type: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          payload?: Json;
          room_id?: string;
          session_id?: string | null;
          turn_id?: string | null;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'game_events_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'game_events_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'table_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'game_events_turn_id_fkey';
            columns: ['turn_id'];
            isOneToOne: false;
            referencedRelation: 'tabu_turns';
            referencedColumns: ['id'];
          },
        ];
      };
      game_proposals: {
        Row: {
          concept: string;
          created_at: string;
          expires_at: string;
          proposer_players: number | null;
          proposer_session_id: string;
          room_id: string;
        };
        Insert: {
          concept: string;
          created_at?: string;
          expires_at: string;
          proposer_players?: number | null;
          proposer_session_id: string;
          room_id: string;
        };
        Update: {
          concept?: string;
          created_at?: string;
          expires_at?: string;
          proposer_players?: number | null;
          proposer_session_id?: string;
          room_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'game_proposals_proposer_session_id_fkey';
            columns: ['proposer_session_id'];
            isOneToOne: false;
            referencedRelation: 'table_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'game_proposals_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: true;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
        ];
      };
      game_results: {
        Row: {
          completed_at: string;
          concept: string;
          id: string;
          mode: string;
          room_id: string | null;
          score: number | null;
          user_id: string;
          won: boolean | null;
        };
        Insert: {
          completed_at?: string;
          concept: string;
          id?: string;
          mode: string;
          room_id?: string | null;
          score?: number | null;
          user_id: string;
          won?: boolean | null;
        };
        Update: {
          completed_at?: string;
          concept?: string;
          id?: string;
          mode?: string;
          room_id?: string | null;
          score?: number | null;
          user_id?: string;
          won?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: 'game_results_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
        ];
      };
      game_secrets: {
        Row: {
          concept: string;
          created_at: string;
          game_no: number;
          room_id: string;
          secret: Json;
        };
        Insert: {
          concept: string;
          created_at?: string;
          game_no: number;
          room_id: string;
          secret: Json;
        };
        Update: {
          concept?: string;
          created_at?: string;
          game_no?: number;
          room_id?: string;
          secret?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'game_secrets_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
        ];
      };
      join_requests: {
        Row: {
          created_at: string;
          expires_at: string;
          id: string;
          requester_alias: string;
          requester_headcount: number;
          requester_profiled: boolean;
          requester_session_id: string;
          responded_at: string | null;
          room_id: string;
          status: string;
        };
        Insert: {
          created_at?: string;
          expires_at: string;
          id?: string;
          requester_alias: string;
          requester_headcount: number;
          requester_profiled?: boolean;
          requester_session_id: string;
          responded_at?: string | null;
          room_id: string;
          status?: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          requester_alias?: string;
          requester_headcount?: number;
          requester_profiled?: boolean;
          requester_session_id?: string;
          responded_at?: string | null;
          room_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'join_requests_requester_session_id_fkey';
            columns: ['requester_session_id'];
            isOneToOne: false;
            referencedRelation: 'table_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'join_requests_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
        ];
      };
      messages: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          room_id: string;
          sender_alias: string;
          session_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          room_id: string;
          sender_alias: string;
          session_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          room_id?: string;
          sender_alias?: string;
          session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'messages_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'table_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      mutual_friend_intents: {
        Row: {
          created_at: string;
          encounter_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          encounter_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          encounter_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      play_history: {
        Row: {
          available_at: string;
          concept: string;
          encounter_id: string;
          friend_action_at: string | null;
          id: string;
          intent: string | null;
          mode: string;
          other_alias: string;
          other_headcount: number;
          other_profiled: boolean;
          other_user_id: string | null;
          own_alias: string;
          played_at: string;
          reveal_mutual: boolean;
          room_id: string | null;
          started_at: string | null;
          user_id: string;
        };
        Insert: {
          available_at: string;
          concept: string;
          encounter_id: string;
          friend_action_at?: string | null;
          id?: string;
          intent?: string | null;
          mode: string;
          other_alias: string;
          other_headcount: number;
          other_profiled?: boolean;
          other_user_id?: string | null;
          own_alias: string;
          played_at?: string;
          reveal_mutual?: boolean;
          room_id?: string | null;
          started_at?: string | null;
          user_id: string;
        };
        Update: {
          available_at?: string;
          concept?: string;
          encounter_id?: string;
          friend_action_at?: string | null;
          id?: string;
          intent?: string | null;
          mode?: string;
          other_alias?: string;
          other_headcount?: number;
          other_profiled?: boolean;
          other_user_id?: string | null;
          own_alias?: string;
          played_at?: string;
          reveal_mutual?: boolean;
          room_id?: string | null;
          started_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'play_history_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
        ];
      };
      profanity_terms: {
        Row: {
          term: string;
          whole_word: boolean;
        };
        Insert: {
          term: string;
          whole_word?: boolean;
        };
        Update: {
          term?: string;
          whole_word?: boolean;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          age_confirmed_at: string;
          bio: string | null;
          birth_date: string | null;
          created_at: string;
          default_participation: string;
          display_name: string | null;
          has_birth_date: boolean | null;
          id: string;
          kvkk_accepted_at: string;
          kvkk_version: string;
          location_consent_at: string | null;
          location_consent_version: string | null;
          notify_dm: boolean;
          notify_friend_requests: boolean;
          photo_hidden_at: string | null;
          photo_path: string | null;
          public_id: string;
          push_token: string | null;
          terms_accepted_at: string;
          terms_version: string;
        };
        Insert: {
          age_confirmed_at: string;
          bio?: string | null;
          birth_date?: string | null;
          created_at?: string;
          default_participation?: string;
          display_name?: string | null;
          has_birth_date?: boolean | null;
          id: string;
          kvkk_accepted_at: string;
          kvkk_version: string;
          location_consent_at?: string | null;
          location_consent_version?: string | null;
          notify_dm?: boolean;
          notify_friend_requests?: boolean;
          photo_hidden_at?: string | null;
          photo_path?: string | null;
          public_id?: string;
          push_token?: string | null;
          terms_accepted_at: string;
          terms_version: string;
        };
        Update: {
          age_confirmed_at?: string;
          bio?: string | null;
          birth_date?: string | null;
          created_at?: string;
          default_participation?: string;
          display_name?: string | null;
          has_birth_date?: boolean | null;
          id?: string;
          kvkk_accepted_at?: string;
          kvkk_version?: string;
          location_consent_at?: string | null;
          location_consent_version?: string | null;
          notify_dm?: boolean;
          notify_friend_requests?: boolean;
          photo_hidden_at?: string | null;
          photo_path?: string | null;
          public_id?: string;
          push_token?: string | null;
          terms_accepted_at?: string;
          terms_version?: string;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          context: Json | null;
          created_at: string;
          dm_thread_id: string | null;
          history_id: string | null;
          id: string;
          messages_snapshot: Json | null;
          photo_copy: string | null;
          profile_snapshot: Json | null;
          reason: string;
          reported_user_id: string | null;
          reporter_id: string | null;
          room_id: string | null;
          status: string;
          target_type: string;
          venue_chat_message_id: string | null;
        };
        Insert: {
          context?: Json | null;
          created_at?: string;
          dm_thread_id?: string | null;
          history_id?: string | null;
          id?: string;
          messages_snapshot?: Json | null;
          photo_copy?: string | null;
          profile_snapshot?: Json | null;
          reason: string;
          reported_user_id?: string | null;
          reporter_id?: string | null;
          room_id?: string | null;
          status?: string;
          target_type?: string;
          venue_chat_message_id?: string | null;
        };
        Update: {
          context?: Json | null;
          created_at?: string;
          dm_thread_id?: string | null;
          history_id?: string | null;
          id?: string;
          messages_snapshot?: Json | null;
          photo_copy?: string | null;
          profile_snapshot?: Json | null;
          reason?: string;
          reported_user_id?: string | null;
          reporter_id?: string | null;
          room_id?: string | null;
          status?: string;
          target_type?: string;
          venue_chat_message_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'reports_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_venue_chat_message_id_fkey';
            columns: ['venue_chat_message_id'];
            isOneToOne: false;
            referencedRelation: 'venue_chat_messages';
            referencedColumns: ['id'];
          },
        ];
      };
      reveal_decisions: {
        Row: {
          created_at: string;
          room_id: string;
          session_id: string;
          wants_meet: boolean;
        };
        Insert: {
          created_at?: string;
          room_id: string;
          session_id: string;
          wants_meet: boolean;
        };
        Update: {
          created_at?: string;
          room_id?: string;
          session_id?: string;
          wants_meet?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'reveal_decisions_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reveal_decisions_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'table_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      room_used_cards: {
        Row: {
          card_id: string;
          room_id: string;
        };
        Insert: {
          card_id: string;
          room_id: string;
        };
        Update: {
          card_id?: string;
          room_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'room_used_cards_card_id_fkey';
            columns: ['card_id'];
            isOneToOne: false;
            referencedRelation: 'cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'room_used_cards_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
        ];
      };
      rooms: {
        Row: {
          closed_at: string | null;
          concept: string | null;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_profiled: boolean;
          guest_session_id: string | null;
          id: string;
          intent: string | null;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_profiled: boolean;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
          spot_id: string | null;
          status: string;
          venue_id: string;
          visibility: string;
          waiting_since: string;
        };
        Insert: {
          closed_at?: string | null;
          concept?: string | null;
          created_at?: string;
          game_state?: Json;
          guest_alias?: string | null;
          guest_headcount?: number | null;
          guest_joined_at?: string | null;
          guest_profiled?: boolean;
          guest_session_id?: string | null;
          id?: string;
          intent?: string | null;
          last_activity_at?: string;
          owner_alias: string;
          owner_headcount: number;
          owner_profiled?: boolean;
          owner_session_id: string;
          reveal_ends_at?: string | null;
          reveal_result?: string | null;
          reveal_token?: Json | null;
          spot_id?: string | null;
          status?: string;
          venue_id: string;
          visibility: string;
          waiting_since?: string;
        };
        Update: {
          closed_at?: string | null;
          concept?: string | null;
          created_at?: string;
          game_state?: Json;
          guest_alias?: string | null;
          guest_headcount?: number | null;
          guest_joined_at?: string | null;
          guest_profiled?: boolean;
          guest_session_id?: string | null;
          id?: string;
          intent?: string | null;
          last_activity_at?: string;
          owner_alias?: string;
          owner_headcount?: number;
          owner_profiled?: boolean;
          owner_session_id?: string;
          reveal_ends_at?: string | null;
          reveal_result?: string | null;
          reveal_token?: Json | null;
          spot_id?: string | null;
          status?: string;
          venue_id?: string;
          visibility?: string;
          waiting_since?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rooms_guest_session_id_fkey';
            columns: ['guest_session_id'];
            isOneToOne: false;
            referencedRelation: 'table_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rooms_owner_session_id_fkey';
            columns: ['owner_session_id'];
            isOneToOne: false;
            referencedRelation: 'table_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rooms_spot_id_fkey';
            columns: ['spot_id'];
            isOneToOne: false;
            referencedRelation: 'venue_spots';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rooms_venue_id_fkey';
            columns: ['venue_id'];
            isOneToOne: false;
            referencedRelation: 'venues';
            referencedColumns: ['id'];
          },
        ];
      };
      table_sessions: {
        Row: {
          alias: string;
          alias_rerolls: number;
          created_at: string;
          ended_at: string | null;
          expires_at: string;
          gps_accuracy_m: number | null;
          headcount: number;
          id: string;
          participation: string;
          spot_id: string | null;
          status: string;
          user_id: string;
          venue_id: string;
        };
        Insert: {
          alias: string;
          alias_rerolls?: number;
          created_at?: string;
          ended_at?: string | null;
          expires_at: string;
          gps_accuracy_m?: number | null;
          headcount: number;
          id?: string;
          participation?: string;
          spot_id?: string | null;
          status?: string;
          user_id: string;
          venue_id: string;
        };
        Update: {
          alias?: string;
          alias_rerolls?: number;
          created_at?: string;
          ended_at?: string | null;
          expires_at?: string;
          gps_accuracy_m?: number | null;
          headcount?: number;
          id?: string;
          participation?: string;
          spot_id?: string | null;
          status?: string;
          user_id?: string;
          venue_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'table_sessions_spot_id_fkey';
            columns: ['spot_id'];
            isOneToOne: false;
            referencedRelation: 'venue_spots';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'table_sessions_venue_id_fkey';
            columns: ['venue_id'];
            isOneToOne: false;
            referencedRelation: 'venues';
            referencedColumns: ['id'];
          },
        ];
      };
      tabu_turns: {
        Row: {
          card_id: string;
          card_ids: string[];
          card_index: number;
          describer_session_id: string;
          ends_at: string | null;
          game_no: number;
          id: string;
          passes_used: number;
          ready_ends_at: string | null;
          room_id: string;
          score: number;
          started_at: string;
          turn_no: number;
        };
        Insert: {
          card_id: string;
          card_ids?: string[];
          card_index?: number;
          describer_session_id: string;
          ends_at?: string | null;
          game_no: number;
          id?: string;
          passes_used?: number;
          ready_ends_at?: string | null;
          room_id: string;
          score?: number;
          started_at?: string;
          turn_no: number;
        };
        Update: {
          card_id?: string;
          card_ids?: string[];
          card_index?: number;
          describer_session_id?: string;
          ends_at?: string | null;
          game_no?: number;
          id?: string;
          passes_used?: number;
          ready_ends_at?: string | null;
          room_id?: string;
          score?: number;
          started_at?: string;
          turn_no?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'tabu_turns_card_id_fkey';
            columns: ['card_id'];
            isOneToOne: false;
            referencedRelation: 'cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tabu_turns_describer_session_id_fkey';
            columns: ['describer_session_id'];
            isOneToOne: false;
            referencedRelation: 'table_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tabu_turns_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
        ];
      };
      venue_activity: {
        Row: {
          bucket: string;
          computed_at: string;
          venue_id: string;
        };
        Insert: {
          bucket: string;
          computed_at?: string;
          venue_id: string;
        };
        Update: {
          bucket?: string;
          computed_at?: string;
          venue_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'venue_activity_venue_id_fkey';
            columns: ['venue_id'];
            isOneToOne: true;
            referencedRelation: 'venues';
            referencedColumns: ['id'];
          },
        ];
      };
      venue_chat_friend_presses: {
        Row: {
          created_at: string;
          from_user_id: string;
          to_name: string | null;
          to_user_id: string;
          venue_name: string | null;
        };
        Insert: {
          created_at?: string;
          from_user_id: string;
          to_name?: string | null;
          to_user_id: string;
          venue_name?: string | null;
        };
        Update: {
          created_at?: string;
          from_user_id?: string;
          to_name?: string | null;
          to_user_id?: string;
          venue_name?: string | null;
        };
        Relationships: [];
      };
      venue_chat_messages: {
        Row: {
          body: string;
          created_at: string;
          hidden_at: string | null;
          id: string;
          profiled: boolean;
          sender_alias: string;
          sender_user_id: string;
          session_id: string;
          venue_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          hidden_at?: string | null;
          id?: string;
          profiled: boolean;
          sender_alias: string;
          sender_user_id: string;
          session_id: string;
          venue_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          hidden_at?: string | null;
          id?: string;
          profiled?: boolean;
          sender_alias?: string;
          sender_user_id?: string;
          session_id?: string;
          venue_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'venue_chat_messages_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'table_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'venue_chat_messages_venue_id_fkey';
            columns: ['venue_id'];
            isOneToOne: false;
            referencedRelation: 'venues';
            referencedColumns: ['id'];
          },
        ];
      };
      venue_chat_rate: {
        Row: {
          count: number;
          last_sent_at: string;
          user_id: string;
          window_started_at: string;
        };
        Insert: {
          count: number;
          last_sent_at: string;
          user_id: string;
          window_started_at: string;
        };
        Update: {
          count?: number;
          last_sent_at?: string;
          user_id?: string;
          window_started_at?: string;
        };
        Relationships: [];
      };
      venue_chat_reports: {
        Row: {
          created_at: string;
          message_id: string;
          reporter_user_id: string;
        };
        Insert: {
          created_at?: string;
          message_id: string;
          reporter_user_id: string;
        };
        Update: {
          created_at?: string;
          message_id?: string;
          reporter_user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'venue_chat_reports_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: false;
            referencedRelation: 'venue_chat_messages';
            referencedColumns: ['id'];
          },
        ];
      };
      venue_events: {
        Row: {
          created_at: string;
          ends_at: string;
          id: string;
          starts_at: string;
          title: string;
          venue_id: string;
        };
        Insert: {
          created_at?: string;
          ends_at: string;
          id?: string;
          starts_at: string;
          title: string;
          venue_id: string;
        };
        Update: {
          created_at?: string;
          ends_at?: string;
          id?: string;
          starts_at?: string;
          title?: string;
          venue_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'venue_events_venue_id_fkey';
            columns: ['venue_id'];
            isOneToOne: false;
            referencedRelation: 'venues';
            referencedColumns: ['id'];
          },
        ];
      };
      venue_spots: {
        Row: {
          id: string;
          is_active: boolean;
          name: string;
          ref: string;
          sort: number;
          venue_id: string;
        };
        Insert: {
          id?: string;
          is_active?: boolean;
          name: string;
          ref: string;
          sort?: number;
          venue_id: string;
        };
        Update: {
          id?: string;
          is_active?: boolean;
          name?: string;
          ref?: string;
          sort?: number;
          venue_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'venue_spots_venue_id_fkey';
            columns: ['venue_id'];
            isOneToOne: false;
            referencedRelation: 'venues';
            referencedColumns: ['id'];
          },
        ];
      };
      venues: {
        Row: {
          boundary: unknown;
          city: string;
          district: string;
          id: string;
          is_active: boolean;
          kind: string;
          location: unknown;
          name: string;
          source: string;
          source_ref: string;
        };
        Insert: {
          boundary?: unknown;
          city: string;
          district: string;
          id?: string;
          is_active?: boolean;
          kind?: string;
          location: unknown;
          name: string;
          source: string;
          source_ref: string;
        };
        Update: {
          boundary?: unknown;
          city?: string;
          district?: string;
          id?: string;
          is_active?: boolean;
          kind?: string;
          location?: unknown;
          name?: string;
          source?: string;
          source_ref?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      my_join_requests: {
        Row: {
          created_at: string | null;
          expires_at: string | null;
          id: string | null;
          room_id: string | null;
          status: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'join_requests_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      change_table_spot: {
        Args: { target_spot_id: string; target_user_id: string };
        Returns: {
          alias: string;
          alias_rerolls: number;
          created_at: string;
          ended_at: string | null;
          expires_at: string;
          gps_accuracy_m: number | null;
          headcount: number;
          id: string;
          participation: string;
          spot_id: string | null;
          status: string;
          user_id: string;
          venue_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'table_sessions';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      chat_send: {
        Args: {
          min_interval_ms: number;
          new_body: string;
          target_room_id: string;
          target_user_id: string;
        };
        Returns: {
          body: string;
          created_at: string;
          id: string;
          room_id: string;
          sender_alias: string;
          session_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'messages';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      dm_inbox: {
        Args: { viewer: string };
        Returns: {
          display_name: string;
          last_body: string;
          last_from_me: boolean;
          last_message_at: string;
          last_status: string;
          photo_path: string;
          public_id: string;
          thread_id: string;
          unread_count: number;
        }[];
      };
      dm_mark_delivered: { Args: { target_user_id: string }; Returns: string[] };
      dm_mark_read: {
        Args: { target_thread_id: string; target_user_id: string };
        Returns: boolean;
      };
      dm_messages_page: {
        Args: { before?: string; target_thread_id: string };
        Returns: {
          body: string;
          created_at: string;
          from_me: boolean;
          id: string;
          status: string;
        }[];
      };
      dm_send: {
        Args: {
          min_interval_ms: number;
          new_body: string;
          target_thread_id: string;
          target_user_id: string;
        };
        Returns: string;
      };
      end_table_session: { Args: { target_user_id: string }; Returns: boolean };
      explore_venues: {
        Args: { event_days?: number };
        Returns: {
          boundary: Json;
          bucket: string;
          district: string;
          events: Json;
          kind: string;
          lat: number;
          lng: number;
          name: string;
          venue_id: string;
        }[];
      };
      friends_add_from_room: {
        Args: { target_history_id: string; target_user_id: string };
        Returns: {
          other_user_id: string;
          outcome: string;
        }[];
      };
      friends_incoming_venue_chat: {
        Args: { target_user_id: string };
        Returns: {
          birth_date: string;
          created_at: string;
          display_name: string;
          photo_path: string;
          request_id: string;
          venue_name: string;
        }[];
      };
      friends_of: {
        Args: { viewer: string };
        Returns: {
          display_name: string;
          last_message_at: string;
          photo_path: string;
          public_id: string;
          since: string;
          thread_id: string;
          unread: boolean;
        }[];
      };
      friends_remove: {
        Args: {
          report_reason?: string;
          target_public_id: string;
          target_user_id: string;
        };
        Returns: undefined;
      };
      friends_request: {
        Args: { target_history_id: string; target_user_id: string };
        Returns: {
          other_user_id: string;
          outcome: string;
        }[];
      };
      friends_request_venue_chat: {
        Args: {
          daily_max: number;
          target_message_id: string;
          target_user_id: string;
        };
        Returns: {
          other_user_id: string;
          outcome: string;
        }[];
      };
      friends_respond: {
        Args: {
          accept: boolean;
          target_request_id: string;
          target_user_id: string;
        };
        Returns: {
          other_user_id: string;
          outcome: string;
        }[];
      };
      history_report_photo: {
        Args: { target_history_id: string; target_user_id: string };
        Returns: string;
      };
      ibre_advance: {
        Args: { target_room_id: string; target_user_id: string };
        Returns: {
          closed_at: string | null;
          concept: string | null;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_profiled: boolean;
          guest_session_id: string | null;
          id: string;
          intent: string | null;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_profiled: boolean;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
          spot_id: string | null;
          status: string;
          venue_id: string;
          visibility: string;
          waiting_since: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      ibre_begin: {
        Args: { target_room_id: string; target_user_id: string };
        Returns: {
          closed_at: string | null;
          concept: string | null;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_profiled: boolean;
          guest_session_id: string | null;
          id: string;
          intent: string | null;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_profiled: boolean;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
          spot_id: string | null;
          status: string;
          venue_id: string;
          visibility: string;
          waiting_since: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      ibre_local_deck: {
        Args: { target_room_id: string; target_user_id: string };
        Returns: Json;
      };
      ibre_lock: {
        Args: {
          round: number;
          target_room_id: string;
          target_user_id: string;
          value: number;
        };
        Returns: {
          closed_at: string | null;
          concept: string | null;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_profiled: boolean;
          guest_session_id: string | null;
          id: string;
          intent: string | null;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_profiled: boolean;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
          spot_id: string | null;
          status: string;
          venue_id: string;
          visibility: string;
          waiting_since: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      ibre_side: {
        Args: {
          round: number;
          side: string;
          target_room_id: string;
          target_user_id: string;
        };
        Returns: {
          closed_at: string | null;
          concept: string | null;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_profiled: boolean;
          guest_session_id: string | null;
          id: string;
          intent: string | null;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_profiled: boolean;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
          spot_id: string | null;
          status: string;
          venue_id: string;
          visibility: string;
          waiting_since: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      ibre_target: {
        Args: { round: number; target_room_id: string; target_user_id: string };
        Returns: Json;
      };
      my_incoming_requests: {
        Args: never;
        Returns: {
          concept: string;
          created_at: string;
          history_id: string;
          other_alias: string;
          other_headcount: number;
          played_at: string;
          request_id: string;
        }[];
      };
      my_sent_requests: {
        Args: never;
        Returns: {
          concept: string;
          created_at: string;
          history_id: string;
          other_alias: string;
          played_at: string;
          status: string;
        }[];
      };
      my_sent_venue_chat_requests: {
        Args: never;
        Returns: {
          created_at: string;
          status: string;
          to_name: string;
          venue_name: string;
        }[];
      };
      nearby_venues: {
        Args: { lat: number; lng: number };
        Returns: {
          distance_m: number;
          district: string;
          id: string;
          name: string;
        }[];
      };
      profile_view: {
        Args: { target_public_id: string; viewer: string };
        Returns: {
          bio: string;
          display_name: string;
          is_self: boolean;
          photo_hidden: boolean;
          photo_path: string;
          public_id: string;
          user_id: string;
        }[];
      };
      record_banned_phone: {
        Args: { target_user_id: string };
        Returns: undefined;
      };
      reroll_table_alias: {
        Args: { max_rerolls: number; new_alias: string; target_user_id: string };
        Returns: {
          alias: string;
          alias_rerolls: number;
          created_at: string;
          ended_at: string | null;
          expires_at: string;
          gps_accuracy_m: number | null;
          headcount: number;
          id: string;
          participation: string;
          spot_id: string | null;
          status: string;
          user_id: string;
          venue_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'table_sessions';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      reveal_decide: {
        Args: {
          target_room_id: string;
          target_user_id: string;
          token: Json;
          wants: boolean;
        };
        Returns: {
          closed_at: string | null;
          concept: string | null;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_profiled: boolean;
          guest_session_id: string | null;
          id: string;
          intent: string | null;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_profiled: boolean;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
          spot_id: string | null;
          status: string;
          venue_id: string;
          visibility: string;
          waiting_since: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      reveal_finalize: {
        Args: { target_room_id: string; target_user_id: string };
        Returns: string;
      };
      room_member_profile: { Args: { target_room_id: string }; Returns: string };
      rooms_answer_game: {
        Args: {
          accept: boolean;
          acceptor_players?: number;
          cards_per_turn: number;
          cooldown_ms: number;
          max_passes: number;
          target_room_id: string;
          target_user_id: string;
          total_turns: number;
          turn_seconds: number;
        };
        Returns: {
          closed_at: string | null;
          concept: string | null;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_profiled: boolean;
          guest_session_id: string | null;
          id: string;
          intent: string | null;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_profiled: boolean;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
          spot_id: string | null;
          status: string;
          venue_id: string;
          visibility: string;
          waiting_since: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rooms_create: {
        Args: { new_intent?: string; profiled: boolean; target_user_id: string };
        Returns: {
          closed_at: string | null;
          concept: string | null;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_profiled: boolean;
          guest_session_id: string | null;
          id: string;
          intent: string | null;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_profiled: boolean;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
          spot_id: string | null;
          status: string;
          venue_id: string;
          visibility: string;
          waiting_since: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rooms_create_solo: {
        Args: { target_user_id: string };
        Returns: {
          closed_at: string | null;
          concept: string | null;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_profiled: boolean;
          guest_session_id: string | null;
          id: string;
          intent: string | null;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_profiled: boolean;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
          spot_id: string | null;
          status: string;
          venue_id: string;
          visibility: string;
          waiting_since: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rooms_end: {
        Args: { decision_seconds: number; target_user_id: string };
        Returns: {
          closed_at: string | null;
          concept: string | null;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_profiled: boolean;
          guest_session_id: string | null;
          id: string;
          intent: string | null;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_profiled: boolean;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
          spot_id: string | null;
          status: string;
          venue_id: string;
          visibility: string;
          waiting_since: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rooms_end_game: {
        Args: { target_room_id: string; target_user_id: string };
        Returns: {
          closed_at: string | null;
          concept: string | null;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_profiled: boolean;
          guest_session_id: string | null;
          id: string;
          intent: string | null;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_profiled: boolean;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
          spot_id: string | null;
          status: string;
          venue_id: string;
          visibility: string;
          waiting_since: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rooms_lobby_held: { Args: { target_room_id: string }; Returns: boolean };
      rooms_propose_game: {
        Args: {
          new_concept: string;
          proposer_players?: number;
          target_room_id: string;
          target_user_id: string;
          ttl_seconds: number;
        };
        Returns: {
          concept: string;
          created_at: string;
          expires_at: string;
          proposer_players: number | null;
          proposer_session_id: string;
          room_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'game_proposals';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rooms_request_join: {
        Args: {
          max_per_hour: number;
          profiled: boolean;
          target_room_id: string;
          target_user_id: string;
          ttl_seconds: number;
        };
        Returns: {
          created_at: string;
          expires_at: string;
          id: string;
          requester_alias: string;
          requester_headcount: number;
          requester_profiled: boolean;
          requester_session_id: string;
          responded_at: string | null;
          room_id: string;
          status: string;
        };
        SetofOptions: {
          from: '*';
          to: 'join_requests';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rooms_respond: {
        Args: {
          accept: boolean;
          target_request_id: string;
          target_user_id: string;
        };
        Returns: {
          created_at: string;
          expires_at: string;
          id: string;
          requester_alias: string;
          requester_headcount: number;
          requester_profiled: boolean;
          requester_session_id: string;
          responded_at: string | null;
          room_id: string;
          status: string;
        };
        SetofOptions: {
          from: '*';
          to: 'join_requests';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      safety_block: {
        Args: { target_room_id: string; target_user_id: string };
        Returns: {
          closed_at: string | null;
          concept: string | null;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_profiled: boolean;
          guest_session_id: string | null;
          id: string;
          intent: string | null;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_profiled: boolean;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
          spot_id: string | null;
          status: string;
          venue_id: string;
          visibility: string;
          waiting_since: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      safety_block_friend: {
        Args: {
          report_reason?: string;
          target_public_id: string;
          target_user_id: string;
        };
        Returns: undefined;
      };
      safety_block_friend_request: {
        Args: { target_request_id: string; target_user_id: string };
        Returns: boolean;
      };
      safety_block_history: {
        Args: {
          photo?: string;
          report_reason?: string;
          reported_photo_path?: string;
          target_history_id: string;
          target_user_id: string;
        };
        Returns: boolean;
      };
      safety_block_venue_chat: {
        Args: { target_message_id: string; target_user_id: string };
        Returns: boolean;
      };
      safety_report: {
        Args: {
          new_reason: string;
          target_room_id: string;
          target_user_id: string;
        };
        Returns: string;
      };
      safety_report_dm: {
        Args: {
          new_reason: string;
          target_thread_id: string;
          target_user_id: string;
        };
        Returns: undefined;
      };
      safety_report_friend_request: {
        Args: {
          new_reason: string;
          target_request_id: string;
          target_user_id: string;
        };
        Returns: boolean;
      };
      safety_report_history: {
        Args: {
          new_reason: string;
          photo?: string;
          reported_photo_path?: string;
          target_history_id: string;
          target_user_id: string;
        };
        Returns: boolean;
      };
      safety_report_profile: {
        Args: {
          new_reason: string;
          photo?: string;
          reported_photo_path?: string;
          target_public_id: string;
          target_user_id: string;
        };
        Returns: boolean;
      };
      safety_report_venue_chat: {
        Args: {
          hide_after: number;
          new_reason: string;
          snapshot_size: number;
          target_message_id: string;
          target_user_id: string;
        };
        Returns: boolean;
      };
      safety_unblock: {
        Args: { target_block_id: string; target_user_id: string };
        Returns: boolean;
      };
      sahtekar_advance: {
        Args: { target_room_id: string; target_user_id: string };
        Returns: {
          closed_at: string | null;
          concept: string | null;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_profiled: boolean;
          guest_session_id: string | null;
          id: string;
          intent: string | null;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_profiled: boolean;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
          spot_id: string | null;
          status: string;
          venue_id: string;
          visibility: string;
          waiting_since: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      sahtekar_guess: {
        Args: { option: string; target_room_id: string; target_user_id: string };
        Returns: {
          closed_at: string | null;
          concept: string | null;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_profiled: boolean;
          guest_session_id: string | null;
          id: string;
          intent: string | null;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_profiled: boolean;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
          spot_id: string | null;
          status: string;
          venue_id: string;
          visibility: string;
          waiting_since: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      sahtekar_local_deck: {
        Args: { target_room_id: string; target_user_id: string };
        Returns: Json;
      };
      sahtekar_options: {
        Args: { target_room_id: string; target_user_id: string };
        Returns: Json;
      };
      sahtekar_said: {
        Args: { step: number; target_room_id: string; target_user_id: string };
        Returns: {
          closed_at: string | null;
          concept: string | null;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_profiled: boolean;
          guest_session_id: string | null;
          id: string;
          intent: string | null;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_profiled: boolean;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
          spot_id: string | null;
          status: string;
          venue_id: string;
          visibility: string;
          waiting_since: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      sahtekar_view: {
        Args: { seat: string; target_room_id: string; target_user_id: string };
        Returns: Json;
      };
      sahtekar_vote: {
        Args: {
          target: string;
          target_room_id: string;
          target_user_id: string;
          voter: string;
        };
        Returns: {
          closed_at: string | null;
          concept: string | null;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_profiled: boolean;
          guest_session_id: string | null;
          id: string;
          intent: string | null;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_profiled: boolean;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
          spot_id: string | null;
          status: string;
          venue_id: string;
          visibility: string;
          waiting_since: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      say_advance: {
        Args: { kind: string; target_room_id: string; target_user_id: string };
        Returns: {
          closed_at: string | null;
          concept: string | null;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_profiled: boolean;
          guest_session_id: string | null;
          id: string;
          intent: string | null;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_profiled: boolean;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
          spot_id: string | null;
          status: string;
          venue_id: string;
          visibility: string;
          waiting_since: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      say_begin: {
        Args: { kind: string; target_room_id: string; target_user_id: string };
        Returns: {
          closed_at: string | null;
          concept: string | null;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_profiled: boolean;
          guest_session_id: string | null;
          id: string;
          intent: string | null;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_profiled: boolean;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
          spot_id: string | null;
          status: string;
          venue_id: string;
          visibility: string;
          waiting_since: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      say_claim: {
        Args: {
          kind: string;
          letter: string;
          round: number;
          step: number;
          target_room_id: string;
          target_user_id: string;
        };
        Returns: {
          closed_at: string | null;
          concept: string | null;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_profiled: boolean;
          guest_session_id: string | null;
          id: string;
          intent: string | null;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_profiled: boolean;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
          spot_id: string | null;
          status: string;
          venue_id: string;
          visibility: string;
          waiting_since: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      say_local_deck: {
        Args: { kind: string; target_room_id: string; target_user_id: string };
        Returns: string[];
      };
      say_object: {
        Args: {
          kind: string;
          round: number;
          step: number;
          target_room_id: string;
          target_user_id: string;
        };
        Returns: {
          closed_at: string | null;
          concept: string | null;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_profiled: boolean;
          guest_session_id: string | null;
          id: string;
          intent: string | null;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_profiled: boolean;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
          spot_id: string | null;
          status: string;
          venue_id: string;
          visibility: string;
          waiting_since: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      sohbet_next: {
        Args: {
          cooldown_ms: number;
          target_room_id: string;
          target_user_id: string;
        };
        Returns: {
          closed_at: string | null;
          concept: string | null;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_profiled: boolean;
          guest_session_id: string | null;
          id: string;
          intent: string | null;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_profiled: boolean;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
          spot_id: string | null;
          status: string;
          venue_id: string;
          visibility: string;
          waiting_since: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      start_table_session: {
        Args: {
          accuracy_m?: number;
          consent_version: string;
          new_alias: string;
          new_headcount: number;
          new_participation?: string;
          new_spot_id?: string;
          target_user_id: string;
          target_venue_id: string;
        };
        Returns: {
          alias: string;
          alias_rerolls: number;
          created_at: string;
          ended_at: string | null;
          expires_at: string;
          gps_accuracy_m: number | null;
          headcount: number;
          id: string;
          participation: string;
          spot_id: string | null;
          status: string;
          user_id: string;
          venue_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'table_sessions';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      tabu_begin_turn: {
        Args: { target_room_id: string; target_user_id: string };
        Returns: {
          closed_at: string | null;
          concept: string | null;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_profiled: boolean;
          guest_session_id: string | null;
          id: string;
          intent: string | null;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_profiled: boolean;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
          spot_id: string | null;
          status: string;
          venue_id: string;
          visibility: string;
          waiting_since: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      tabu_end_turn: {
        Args: { target_room_id: string; target_user_id: string };
        Returns: {
          closed_at: string | null;
          concept: string | null;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_profiled: boolean;
          guest_session_id: string | null;
          id: string;
          intent: string | null;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_profiled: boolean;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
          spot_id: string | null;
          status: string;
          venue_id: string;
          visibility: string;
          waiting_since: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      tabu_local_deck: {
        Args: {
          deck_size: number;
          target_room_id: string;
          target_user_id: string;
        };
        Returns: {
          forbidden: string[];
          word: string;
        }[];
      };
      tabu_mark: {
        Args: {
          index: number;
          result: string;
          target_room_id: string;
          target_user_id: string;
          turn_number: number;
        };
        Returns: {
          closed_at: string | null;
          concept: string | null;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_profiled: boolean;
          guest_session_id: string | null;
          id: string;
          intent: string | null;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_profiled: boolean;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
          spot_id: string | null;
          status: string;
          venue_id: string;
          visibility: string;
          waiting_since: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      tabu_turn_cards: {
        Args: { target_room_id: string; target_user_id: string };
        Returns: {
          card_index: number;
          forbidden: string[];
          turn_no: number;
          word: string;
        }[];
      };
      user_stats: {
        Args: { target_user_id: string };
        Returns: {
          distinct_tables: number;
          games: number;
          voice_tabu_wins: number;
        }[];
      };
      venue_chat_page: {
        Args: { before?: string; page_size?: number; target_venue_id: string };
        Returns: {
          body: string;
          created_at: string;
          display_name: string;
          from_me: boolean;
          id: string;
          profiled: boolean;
          sender_alias: string;
        }[];
      };
      venue_chat_profile_owner: {
        Args: { target_message_id: string; target_user_id: string };
        Returns: string;
      };
      venue_chat_send: {
        Args: {
          min_interval_ms: number;
          new_body: string;
          profiled: boolean;
          target_user_id: string;
          target_venue_id: string;
          window_max: number;
          window_seconds: number;
        };
        Returns: {
          body: string;
          created_at: string;
          hidden_at: string | null;
          id: string;
          profiled: boolean;
          sender_alias: string;
          sender_user_id: string;
          session_id: string;
          venue_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'venue_chat_messages';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      venue_contains: {
        Args: {
          lat: number;
          lng: number;
          radius_m: number;
          target_venue_id: string;
          tolerance_m: number;
        };
        Returns: boolean;
      };
      venue_distance_m: {
        Args: { lat: number; lng: number; target_venue_id: string };
        Returns: number;
      };
      venue_lobby: {
        Args: { target_venue_id: string };
        Returns: {
          alias: string;
          headcount: number;
          intent: string;
          profiled: boolean;
          room_id: string;
          spot_id: string;
          spot_name: string;
          waiting_since: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
