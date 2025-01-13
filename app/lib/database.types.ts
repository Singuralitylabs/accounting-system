export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
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
          id?: number;
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
          id?: number;
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
          }
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
          id?: number;
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
          id?: number;
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
          }
        ];
      };
      matters: {
        Row: {
          accounting_memo: string | null;
          amount: number;
          business_count: number | null;
          category: string;
          cost_count: number | null;
          description: string | null;
          id: number;
          inserted_at: string;
          is_completed: boolean | null;
          is_fixed: boolean | null;
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
          amount?: number;
          business_count?: number | null;
          category: string;
          cost_count?: number | null;
          description?: string | null;
          id?: number;
          inserted_at?: string;
          is_completed?: boolean | null;
          is_fixed?: boolean | null;
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
          amount?: number;
          business_count?: number | null;
          category?: string;
          cost_count?: number | null;
          description?: string | null;
          id?: number;
          inserted_at?: string;
          is_completed?: boolean | null;
          is_fixed?: boolean | null;
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
            foreignKeyName: "matters_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
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
          id: number;
          name: string;
          updated_at: string;
        };
        Insert: {
          category: Database["public"]["Enums"]["information_category"];
          created_at?: string;
          description?: string | null;
          display_name: string;
          display_order?: number | null;
          id?: number;
          name: string;
          updated_at?: string;
        };
        Update: {
          category?: Database["public"]["Enums"]["information_category"];
          created_at?: string;
          description?: string | null;
          display_name?: string;
          display_order?: number | null;
          id?: number;
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
          type_id: number | null;
          updated_at: string;
          value: string;
        };
        Insert: {
          created_at?: string;
          display_order?: number | null;
          id?: number;
          is_active?: boolean | null;
          type_id?: number | null;
          updated_at?: string;
          value: string;
        };
        Update: {
          created_at?: string;
          display_order?: number | null;
          id?: number;
          is_active?: boolean | null;
          type_id?: number | null;
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
          }
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

type PublicSchema = Database[Extract<keyof Database, "public">];

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
      PublicSchema["Views"])
  ? (PublicSchema["Tables"] &
      PublicSchema["Views"])[PublicTableNameOrOptions] extends {
      Row: infer R;
    }
    ? R
    : never
  : never;

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
  ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
      Insert: infer I;
    }
    ? I
    : never
  : never;

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
  ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
      Update: infer U;
    }
    ? U
    : never
  : never;

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
  ? PublicSchema["Enums"][PublicEnumNameOrOptions]
  : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
  ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never;
