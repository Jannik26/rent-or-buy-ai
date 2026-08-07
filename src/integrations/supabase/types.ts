export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string;
          admin_user_id: string;
          company_id: string;
          created_at: string;
          id: number;
          new_values: Json | null;
          previous_values: Json | null;
        };
        Insert: {
          action: string;
          admin_user_id: string;
          company_id: string;
          created_at?: string;
          id?: number;
          new_values?: Json | null;
          previous_values?: Json | null;
        };
        Update: {
          action?: string;
          admin_user_id?: string;
          company_id?: string;
          created_at?: string;
          id?: number;
          new_values?: Json | null;
          previous_values?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      appointments: {
        Row: {
          company_id: string;
          created_at: string;
          created_by: string | null;
          ends_at: string | null;
          id: string;
          lead_id: string;
          location: string | null;
          notes: string | null;
          starts_at: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          ends_at?: string | null;
          id?: string;
          lead_id: string;
          location?: string | null;
          notes?: string | null;
          starts_at: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          ends_at?: string | null;
          id?: string;
          lead_id?: string;
          location?: string | null;
          notes?: string | null;
          starts_at?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      companies: {
        Row: {
          admin_notes: string | null;
          created_at: string;
          demo_expires_at: string | null;
          demo_started_at: string | null;
          greeting: string | null;
          id: string;
          name: string;
          owner_id: string | null;
          plan: string | null;
          primary_color: string | null;
          privacy_url: string | null;
          response_time: string;
          subscription_expires_at: string | null;
          subscription_started_at: string | null;
          subscription_status: string;
          terms_url: string | null;
          updated_at: string;
        };
        Insert: {
          admin_notes?: string | null;
          created_at?: string;
          demo_expires_at?: string | null;
          demo_started_at?: string | null;
          greeting?: string | null;
          id?: string;
          name: string;
          owner_id?: string | null;
          plan?: string | null;
          primary_color?: string | null;
          privacy_url?: string | null;
          response_time?: string;
          subscription_expires_at?: string | null;
          subscription_started_at?: string | null;
          subscription_status?: string;
          terms_url?: string | null;
          updated_at?: string;
        };
        Update: {
          admin_notes?: string | null;
          created_at?: string;
          demo_expires_at?: string | null;
          demo_started_at?: string | null;
          greeting?: string | null;
          id?: string;
          name?: string;
          owner_id?: string | null;
          plan?: string | null;
          primary_color?: string | null;
          privacy_url?: string | null;
          response_time?: string;
          subscription_expires_at?: string | null;
          subscription_started_at?: string | null;
          subscription_status?: string;
          terms_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      leads: {
        Row: {
          ai_summary: string | null;
          asking_price: string | null;
          budget: string | null;
          company_id: string;
          created_at: string;
          email: string | null;
          financing: string | null;
          household_size: string | null;
          id: string;
          income: string | null;
          intent: Database["public"]["Enums"]["lead_intent"];
          location: string | null;
          messages: Json;
          motivation: string | null;
          move_in_date: string | null;
          name: string | null;
          next_action: string | null;
          object_desc: string | null;
          ownership_status: string | null;
          phone: string | null;
          property_type: string | null;
          qualification_summary: string | null;
          score: Database["public"]["Enums"]["lead_score"];
          score_numeric: number;
          status: string;
          summary_generated_at: string | null;
          timeframe: string | null;
          updated_at: string;
          usage_type: string | null;
        };
        Insert: {
          ai_summary?: string | null;
          asking_price?: string | null;
          budget?: string | null;
          company_id: string;
          created_at?: string;
          email?: string | null;
          financing?: string | null;
          household_size?: string | null;
          id?: string;
          income?: string | null;
          intent?: Database["public"]["Enums"]["lead_intent"];
          location?: string | null;
          messages?: Json;
          motivation?: string | null;
          move_in_date?: string | null;
          name?: string | null;
          next_action?: string | null;
          object_desc?: string | null;
          ownership_status?: string | null;
          phone?: string | null;
          property_type?: string | null;
          qualification_summary?: string | null;
          score?: Database["public"]["Enums"]["lead_score"];
          score_numeric?: number;
          status?: string;
          summary_generated_at?: string | null;
          timeframe?: string | null;
          updated_at?: string;
          usage_type?: string | null;
        };
        Update: {
          ai_summary?: string | null;
          asking_price?: string | null;
          budget?: string | null;
          company_id?: string;
          created_at?: string;
          email?: string | null;
          financing?: string | null;
          household_size?: string | null;
          id?: string;
          income?: string | null;
          intent?: Database["public"]["Enums"]["lead_intent"];
          location?: string | null;
          messages?: Json;
          motivation?: string | null;
          move_in_date?: string | null;
          name?: string | null;
          next_action?: string | null;
          object_desc?: string | null;
          ownership_status?: string | null;
          phone?: string | null;
          property_type?: string | null;
          qualification_summary?: string | null;
          score?: Database["public"]["Enums"]["lead_score"];
          score_numeric?: number;
          status?: string;
          summary_generated_at?: string | null;
          timeframe?: string | null;
          updated_at?: string;
          usage_type?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "leads_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          company: string | null;
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          role: string;
          updated_at: string;
        };
        Insert: {
          company?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          role?: string;
          updated_at?: string;
        };
        Update: {
          company?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          role?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      system_events: {
        Row: {
          context: Json | null;
          created_at: string;
          id: number;
          kind: string;
          message: string;
          source: string;
        };
        Insert: {
          context?: Json | null;
          created_at?: string;
          id?: number;
          kind: string;
          message: string;
          source: string;
        };
        Update: {
          context?: Json | null;
          created_at?: string;
          id?: number;
          kind?: string;
          message?: string;
          source?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      widget_throttle: {
        Row: {
          bucket_key: string;
          company_id: string;
          count: number;
          minute_bucket: string;
        };
        Insert: {
          bucket_key: string;
          company_id: string;
          count?: number;
          minute_bucket: string;
        };
        Update: {
          bucket_key?: string;
          company_id?: string;
          count?: number;
          minute_bucket?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_company_overview: {
        Args: never;
        Returns: {
          admin_notes: string;
          contact_email: string;
          contact_name: string;
          created_at: string;
          demo_expires_at: string;
          demo_started_at: string;
          id: string;
          last_activity: string;
          lead_count: number;
          message_count: number;
          name: string;
          plan: string;
          subscription_expires_at: string;
          subscription_started_at: string;
          subscription_status: string;
        }[];
      };
      analytics_summary: {
        Args: {
          prev_end: string;
          prev_start: string;
          window_end: string;
          window_start: string;
        };
        Returns: {
          appt_currently_scheduled: number;
          appt_in_prev_window: number;
          appt_in_window: number;
          appt_in_window_cancelled: number;
          appt_in_window_completed: number;
          appt_in_window_scheduled: number;
          leads_avg_score_numeric: number;
          leads_in_prev_window: number;
          leads_in_window: number;
          leads_score_cold: number;
          leads_score_hot: number;
          leads_score_warm: number;
          leads_status_neu: number;
          leads_status_qualifiziert: number;
          leads_status_termin: number;
          leads_total: number;
          leads_with_real_appointment: number;
          legacy_termin_without_appointment_all_time: number;
        }[];
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      reject_plus_address_signup: { Args: { event: Json }; Returns: Json };
    };
    Enums: {
      app_role: "admin" | "moderator" | "user" | "super_admin";
      lead_intent: "kauf" | "miete" | "unbekannt" | "verkauf" | "bewertung" | "sonstiges";
      lead_score: "hot" | "warm" | "cold";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user", "super_admin"],
      lead_intent: ["kauf", "miete", "unbekannt", "verkauf", "bewertung", "sonstiges"],
      lead_score: ["hot", "warm", "cold"],
    },
  },
} as const;
