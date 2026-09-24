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
      profiles: {
        Row: {
          age_confirmed_at: string;
          created_at: string;
          id: string;
          kvkk_accepted_at: string;
          kvkk_version: string;
          location_consent_at: string | null;
          location_consent_version: string | null;
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
          terms_accepted_at?: string;
          terms_version?: string;
        };
        Relationships: [];
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
      [_ in never]: never;
    };
    Functions: {
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
