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
        };
        Insert: {
          blocked_alias: string;
          blocked_id: string;
          blocker_id: string;
          created_at?: string;
        };
        Update: {
          blocked_alias?: string;
          blocked_id?: string;
          blocker_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      join_requests: {
        Row: {
          created_at: string;
          expires_at: string;
          id: string;
          requester_alias: string;
          requester_headcount: number;
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
      profanity_terms: {
        Row: {
          term: string;
        };
        Insert: {
          term: string;
        };
        Update: {
          term?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          age_confirmed_at: string;
          created_at: string;
          id: string;
          kvkk_accepted_at: string;
          kvkk_version: string;
          location_consent_at: string | null;
          location_consent_version: string | null;
          push_token: string | null;
          terms_accepted_at: string;
          terms_version: string;
        };
        Insert: {
          age_confirmed_at: string;
          created_at?: string;
          id: string;
          kvkk_accepted_at: string;
          kvkk_version: string;
          location_consent_at?: string | null;
          location_consent_version?: string | null;
          push_token?: string | null;
          terms_accepted_at: string;
          terms_version: string;
        };
        Update: {
          age_confirmed_at?: string;
          created_at?: string;
          id?: string;
          kvkk_accepted_at?: string;
          kvkk_version?: string;
          location_consent_at?: string | null;
          location_consent_version?: string | null;
          push_token?: string | null;
          terms_accepted_at?: string;
          terms_version?: string;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          created_at: string;
          id: string;
          messages_snapshot: Json;
          reason: string;
          reported_user_id: string | null;
          reporter_id: string | null;
          room_id: string | null;
          status: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          messages_snapshot: Json;
          reason: string;
          reported_user_id?: string | null;
          reporter_id?: string | null;
          room_id?: string | null;
          status?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          messages_snapshot?: Json;
          reason?: string;
          reported_user_id?: string | null;
          reporter_id?: string | null;
          room_id?: string | null;
          status?: string;
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
      rooms: {
        Row: {
          closed_at: string | null;
          concept: string;
          created_at: string;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_session_id: string | null;
          id: string;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_session_id: string;
          status: string;
          venue_id: string;
          visibility: string;
          waiting_since: string;
        };
        Insert: {
          closed_at?: string | null;
          concept: string;
          created_at?: string;
          guest_alias?: string | null;
          guest_headcount?: number | null;
          guest_joined_at?: string | null;
          guest_session_id?: string | null;
          id?: string;
          last_activity_at?: string;
          owner_alias: string;
          owner_headcount: number;
          owner_session_id: string;
          status?: string;
          venue_id: string;
          visibility: string;
          waiting_since?: string;
        };
        Update: {
          closed_at?: string | null;
          concept?: string;
          created_at?: string;
          guest_alias?: string | null;
          guest_headcount?: number | null;
          guest_joined_at?: string | null;
          guest_session_id?: string | null;
          id?: string;
          last_activity_at?: string;
          owner_alias?: string;
          owner_headcount?: number;
          owner_session_id?: string;
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
      end_table_session: { Args: { target_user_id: string }; Returns: boolean };
      nearby_venues: {
        Args: { lat: number; lng: number };
        Returns: {
          distance_m: number;
          district: string;
          id: string;
          name: string;
        }[];
      };
      record_banned_phone: {
        Args: { target_user_id: string };
        Returns: undefined;
      };
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
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_session_id: string | null;
          id: string;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_session_id: string;
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
        Args: { target_user_id: string };
        Returns: {
          closed_at: string | null;
          concept: string;
          created_at: string;
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_session_id: string | null;
          id: string;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_session_id: string;
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
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_session_id: string | null;
          id: string;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_session_id: string;
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
          guest_alias: string | null;
          guest_headcount: number | null;
          guest_joined_at: string | null;
          guest_session_id: string | null;
          id: string;
          last_activity_at: string;
          owner_alias: string;
          owner_headcount: number;
          owner_session_id: string;
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
      safety_report: {
        Args: {
          new_reason: string;
          target_room_id: string;
          target_user_id: string;
        };
        Returns: string;
      };
      safety_unblock: {
        Args: { target_blocked_id: string; target_user_id: string };
        Returns: boolean;
      };
      start_table_session: {
        Args: {
          accuracy_m?: number;
          consent_version: string;
          new_alias: string;
          new_headcount: number;
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
