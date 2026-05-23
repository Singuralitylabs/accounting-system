export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      business: {
        Row: {
          amount: number | null;
          id: number;
          inserted_at: string;
          invoice_date: string | null;
          is_completed: boolean;
          matter_id: number;
          name: string;
          period_date: string | null;
          updated_at: string;
        };
        Insert: {
          amount?: number | null;
          id?: never;
          inserted_at?: string;
          invoice_date?: string | null;
          is_completed?: boolean;
          matter_id: number;
          name: string;
          period_date?: string | null;
          updated_at?: string;
        };
        Update: {
          amount?: number | null;
          id?: never;
          inserted_at?: string;
          invoice_date?: string | null;
          is_completed?: boolean;
          matter_id?: number;
          name?: string;
          period_date?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "business_matter_id_fkey";
            columns: ["matter_id"];
            isOneToOne: false;
            referencedRelation: "matters";
            referencedColumns: ["id"];
          },
        ];
      };
      costs: {
        Row: {
          certificate: string;
          comment: string | null;
          id: number;
          inserted_at: string;
          is_completed: boolean;
          item: string;
          matter_id: number;
          name: string;
          payment_target: string;
          period: string | null;
          price: number;
          updated_at: string;
          withholding: boolean;
        };
        Insert: {
          certificate: string;
          comment?: string | null;
          id?: never;
          inserted_at?: string;
          is_completed?: boolean;
          item: string;
          matter_id: number;
          name: string;
          payment_target: string;
          period?: string | null;
          price: number;
          updated_at?: string;
          withholding?: boolean;
        };
        Update: {
          certificate?: string;
          comment?: string | null;
          id?: never;
          inserted_at?: string;
          is_completed?: boolean;
          item?: string;
          matter_id?: number;
          name?: string;
          payment_target?: string;
          period?: string | null;
          price?: number;
          updated_at?: string;
          withholding?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "costs_matter_id_fkey";
            columns: ["matter_id"];
            isOneToOne: false;
            referencedRelation: "matters";
            referencedColumns: ["id"];
          },
        ];
      };
      matters: {
        Row: {
          accounting_memo: string | null;
          business_count: number | null;
          category: string;
          cost_count: number | null;
          description: string | null;
          has_updates: boolean | null;
          id: number;
          inserted_at: string;
          is_completed: boolean | null;
          is_fixed: boolean | null;
          parent_matter_id: number | null;
          start_date: string | null;
          team: string;
          title: string;
          total_amount: number | null;
          total_cost: number | null;
          unchecked_cost_count: number;
          updated_at: string;
          user_id: number;
        };
        Insert: {
          accounting_memo?: string | null;
          business_count?: number | null;
          category: string;
          cost_count?: number | null;
          description?: string | null;
          has_updates?: boolean | null;
          id?: number;
          inserted_at?: string;
          is_completed?: boolean | null;
          is_fixed?: boolean | null;
          parent_matter_id?: number | null;
          start_date?: string | null;
          team: string;
          title: string;
          total_amount?: number | null;
          total_cost?: number | null;
          unchecked_cost_count?: number;
          updated_at?: string;
          user_id: number;
        };
        Update: {
          accounting_memo?: string | null;
          business_count?: number | null;
          category?: string;
          cost_count?: number | null;
          description?: string | null;
          has_updates?: boolean | null;
          id?: number;
          inserted_at?: string;
          is_completed?: boolean | null;
          is_fixed?: boolean | null;
          parent_matter_id?: number | null;
          start_date?: string | null;
          team?: string;
          title?: string;
          total_amount?: number | null;
          total_cost?: number | null;
          unchecked_cost_count?: number;
          updated_at?: string;
          user_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "matters_parent_matter_id_fkey";
            columns: ["parent_matter_id"];
            isOneToOne: false;
            referencedRelation: "matters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matters_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          class: string | null;
          email: string;
          id: number;
          inserted_at: string;
          name: string;
          slack_id: string | null;
          team: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          class?: string | null;
          email: string;
          id?: number;
          inserted_at?: string;
          name: string;
          slack_id?: string | null;
          team?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          class?: string | null;
          email?: string;
          id?: number;
          inserted_at?: string;
          name?: string;
          slack_id?: string | null;
          team?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      select_option_types: {
        Row: {
          category: Database["public"]["Enums"]["information_category"];
          created_at: string;
          description: string | null;
          display_name: string;
          display_order: number | null;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          category: Database["public"]["Enums"]["information_category"];
          created_at?: string;
          description?: string | null;
          display_name: string;
          display_order?: number | null;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          category?: Database["public"]["Enums"]["information_category"];
          created_at?: string;
          description?: string | null;
          display_name?: string;
          display_order?: number | null;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      select_options: {
        Row: {
          created_at: string;
          display_order: number | null;
          id: number;
          is_active: boolean | null;
          type_id: string | null;
          updated_at: string;
          value: string;
        };
        Insert: {
          created_at?: string;
          display_order?: number | null;
          id?: number;
          is_active?: boolean | null;
          type_id?: string | null;
          updated_at?: string;
          value: string;
        };
        Update: {
          created_at?: string;
          display_order?: number | null;
          id?: number;
          is_active?: boolean | null;
          type_id?: string | null;
          updated_at?: string;
          value?: string;
        };
        Relationships: [
          {
            foreignKeyName: "select_options_type_id_fkey";
            columns: ["type_id"];
            isOneToOne: false;
            referencedRelation: "select_option_types";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      information_category: "basic_info" | "business_info" | "cost_info";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

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
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
      information_category: ["basic_info", "business_info", "cost_info"],
    },
  },
} as const;
