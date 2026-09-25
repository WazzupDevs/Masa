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
          last_read_at: string;
          thread_id: string;
          user_id: string;
        };
        Insert: {
          last_read_at?: string;
          thread_id: string;
          user_id: string;
        };
        Update: {
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
          encounter_id: string;
          from_user_id: string;
          id: string;
          responded_at: string | null;
          status: string;
          to_user_id: string;
        };
        Insert: {
          created_at?: string;
          encounter_id: string;
          from_user_id: string;
          id?: string;
          responded_at?: string | null;
          status?: string;
          to_user_id: string;
        };
        Update: {
          created_at?: string;
          encounter_id?: string;
          from_user_id?: string;
          id?: string;
          responded_at?: string | null;
          status?: string;
          to_user_id?: string;
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
          created_at: string;
          default_participation: string;
          display_name: string | null;
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
          created_at?: string;
          default_participation?: string;
          display_name?: string | null;
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
          created_at?: string;
          default_participation?: string;
          display_name?: string | null;
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
        };
        Relationships: [
          {
            foreignKeyName: 'reports_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
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
          concept: string;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_session_id: string | null;
          id: string;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
          status: string;
          venue_id: string;
          visibility: string;
          waiting_since: string;
        };
        Insert: {
          closed_at?: string | null;
          concept: string;
          created_at?: string;
          game_state?: Json;
          guest_alias?: string | null;
          guest_headcount?: number | null;
          guest_joined_at?: string | null;
          guest_session_id?: string | null;
          id?: string;
          last_activity_at?: string;
          owner_alias: string;
          owner_headcount: number;
          owner_session_id: string;
          reveal_ends_at?: string | null;
          reveal_result?: string | null;
          reveal_token?: Json | null;
          status?: string;
          venue_id: string;
          visibility: string;
          waiting_since?: string;
        };
        Update: {
          closed_at?: string | null;
          concept?: string;
          created_at?: string;
          game_state?: Json;
          guest_alias?: string | null;
          guest_headcount?: number | null;
          guest_joined_at?: string | null;
          guest_session_id?: string | null;
          id?: string;
          last_activity_at?: string;
          owner_alias?: string;
          owner_headcount?: number;
          owner_session_id?: string;
          reveal_ends_at?: string | null;
          reveal_result?: string | null;
          reveal_token?: Json | null;
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
          created_at: string;
          ended_at: string | null;
          expires_at: string;
          gps_accuracy_m: number | null;
          headcount: number;
          id: string;
          participation: string;
          status: string;
          user_id: string;
          venue_id: string;
        };
        Insert: {
          alias: string;
          created_at?: string;
          ended_at?: string | null;
          expires_at: string;
          gps_accuracy_m?: number | null;
          headcount: number;
          id?: string;
          participation?: string;
          status?: string;
          user_id: string;
          venue_id: string;
        };
        Update: {
          alias?: string;
          created_at?: string;
          ended_at?: string | null;
          expires_at?: string;
          gps_accuracy_m?: number | null;
          headcount?: number;
          id?: string;
          participation?: string;
          status?: string;
          user_id?: string;
          venue_id?: string;
        };
        Relationships: [
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
          describer_session_id: string;
          ends_at: string;
          game_no: number;
          id: string;
          passes_used: number;
          room_id: string;
          score: number;
          started_at: string;
          turn_no: number;
        };
        Insert: {
          card_id: string;
          describer_session_id: string;
          ends_at: string;
          game_no: number;
          id?: string;
          passes_used?: number;
          room_id: string;
          score?: number;
          started_at?: string;
          turn_no: number;
        };
        Update: {
          card_id?: string;
          describer_session_id?: string;
          ends_at?: string;
          game_no?: number;
          id?: string;
          passes_used?: number;
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
      venues: {
        Row: {
          city: string;
          district: string;
          id: string;
          is_active: boolean;
          location: unknown;
          name: string;
          source: string;
          source_ref: string;
        };
        Insert: {
          city: string;
          district: string;
          id?: string;
          is_active?: boolean;
          location: unknown;
          name: string;
          source: string;
          source_ref: string;
        };
        Update: {
          city?: string;
          district?: string;
          id?: string;
          is_active?: boolean;
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
      dm_mark_read: {
        Args: { target_thread_id: string; target_user_id: string };
        Returns: undefined;
      };
      dm_messages_page: {
        Args: { before?: string; target_thread_id: string };
        Returns: {
          body: string;
          created_at: string;
          from_me: boolean;
          id: string;
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
          bucket: string;
          district: string;
          event_ends_at: string;
          event_starts_at: string;
          event_title: string;
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
      reveal_decide: {
        Args: {
          target_room_id: string;
          target_user_id: string;
          token: Json;
          wants: boolean;
        };
        Returns: {
          closed_at: string | null;
          concept: string;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_session_id: string | null;
          id: string;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
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
      rooms_create: {
        Args: {
          new_concept: string;
          new_visibility: string;
          target_user_id: string;
        };
        Returns: {
          closed_at: string | null;
          concept: string;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_session_id: string | null;
          id: string;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
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
          concept: string;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_session_id: string | null;
          id: string;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
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
      rooms_leave: {
        Args: { target_user_id: string };
        Returns: {
          closed_at: string | null;
          concept: string;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_session_id: string | null;
          id: string;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
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
      rooms_request_join: {
        Args: {
          max_per_hour: number;
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
          concept: string;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_session_id: string | null;
          id: string;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
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
      safety_unblock: {
        Args: { target_block_id: string; target_user_id: string };
        Returns: boolean;
      };
      sohbet_next: {
        Args: {
          cooldown_ms: number;
          target_room_id: string;
          target_user_id: string;
        };
        Returns: {
          closed_at: string | null;
          concept: string;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_session_id: string | null;
          id: string;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
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
          target_user_id: string;
          target_venue_id: string;
        };
        Returns: {
          alias: string;
          created_at: string;
          ended_at: string | null;
          expires_at: string;
          gps_accuracy_m: number | null;
          headcount: number;
          id: string;
          participation: string;
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
      tabu_add_clue: {
        Args: {
          checked_card_id: string;
          clue: string;
          target_room_id: string;
          target_user_id: string;
        };
        Returns: {
          created_at: string;
          id: string;
          payload: Json;
          room_id: string;
          session_id: string | null;
          turn_id: string | null;
          type: string;
        };
        SetofOptions: {
          from: '*';
          to: 'game_events';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      tabu_current_card: {
        Args: { target_room_id: string; target_user_id: string };
        Returns: {
          card_id: string;
          forbidden: string[];
          word: string;
        }[];
      };
      tabu_end_turn: {
        Args: { target_room_id: string; target_user_id: string };
        Returns: {
          closed_at: string | null;
          concept: string;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_session_id: string | null;
          id: string;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
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
      tabu_guess: {
        Args: {
          checked_card_id: string;
          correct: boolean;
          guess: string;
          target_room_id: string;
          target_user_id: string;
        };
        Returns: {
          closed_at: string | null;
          concept: string;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_session_id: string | null;
          id: string;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
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
      tabu_judge: {
        Args: {
          checked_card_id: string;
          result: string;
          target_room_id: string;
          target_user_id: string;
        };
        Returns: {
          closed_at: string | null;
          concept: string;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_session_id: string | null;
          id: string;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
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
      tabu_pass: {
        Args: { target_room_id: string; target_user_id: string };
        Returns: {
          closed_at: string | null;
          concept: string;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_session_id: string | null;
          id: string;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
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
      tabu_start: {
        Args: {
          max_passes: number;
          target_room_id: string;
          target_user_id: string;
          total_turns: number;
          turn_seconds: number;
        };
        Returns: {
          closed_at: string | null;
          concept: string;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_session_id: string | null;
          id: string;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
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
      tabu_start_voice: {
        Args: {
          max_passes: number;
          target_room_id: string;
          target_user_id: string;
          total_turns: number;
          turn_seconds: number;
        };
        Returns: {
          closed_at: string | null;
          concept: string;
          created_at: string;
          game_state: Json;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_session_id: string | null;
          id: string;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_session_id: string;
          reveal_ends_at: string | null;
          reveal_result: string | null;
          reveal_token: Json | null;
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
      user_stats: {
        Args: { target_user_id: string };
        Returns: {
          distinct_tables: number;
          games: number;
          voice_tabu_wins: number;
        }[];
      };
      venue_distance_m: {
        Args: { lat: number; lng: number; target_venue_id: string };
        Returns: number;
      };
      venue_lobby: {
        Args: { target_venue_id: string };
        Returns: {
          alias: string;
          concept: string;
          headcount: number;
          profiled: boolean;
          room_id: string;
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
