export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          variables?: Json
          operationName?: string
          query?: string
          extensions?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      budget_declaration_items: {
        Row: {
          amount: number
          category: string
          declaration_id: number
          description: string
          display_order: number
          entry_type: string
          id: number
          inserted_at: string
          updated_at: string
        }
        Insert: {
          amount: number
          category: string
          declaration_id: number
          description: string
          display_order?: number
          entry_type: string
          id?: never
          inserted_at?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          declaration_id?: number
          description?: string
          display_order?: number
          entry_type?: string
          id?: never
          inserted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_declaration_items_declaration_id_fkey"
            columns: ["declaration_id"]
            isOneToOne: false
            referencedRelation: "budget_declarations"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_declarations: {
        Row: {
          comment: string | null
          declared_by: number
          id: number
          inserted_at: string
          target_month: string
          team: string
          updated_at: string
        }
        Insert: {
          comment?: string | null
          declared_by: number
          id?: never
          inserted_at?: string
          target_month: string
          team: string
          updated_at?: string
        }
        Update: {
          comment?: string | null
          declared_by?: number
          id?: never
          inserted_at?: string
          target_month?: string
          team?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_declarations_declared_by_fkey"
            columns: ["declared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business: {
        Row: {
          amount: number | null
          id: number
          inserted_at: string
          invoice_date: string | null
          is_completed: boolean
          matter_id: number
          name: string
          period_date: string | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          id?: never
          inserted_at?: string
          invoice_date?: string | null
          is_completed?: boolean
          matter_id: number
          name: string
          period_date?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          id?: never
          inserted_at?: string
          invoice_date?: string | null
          is_completed?: boolean
          matter_id?: number
          name?: string
          period_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
        ]
      }
      costs: {
        Row: {
          certificate: string
          comment: string | null
          id: number
          inserted_at: string
          is_completed: boolean
          item: string
          matter_id: number
          name: string
          payment_target: string
          period: string | null
          price: number
          updated_at: string
          withholding: boolean
        }
        Insert: {
          certificate: string
          comment?: string | null
          id?: never
          inserted_at?: string
          is_completed?: boolean
          item: string
          matter_id: number
          name: string
          payment_target: string
          period?: string | null
          price: number
          updated_at?: string
          withholding?: boolean
        }
        Update: {
          certificate?: string
          comment?: string | null
          id?: never
          inserted_at?: string
          is_completed?: boolean
          item?: string
          matter_id?: number
          name?: string
          payment_target?: string
          period?: string | null
          price?: number
          updated_at?: string
          withholding?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "costs_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
        ]
      }
      extra_entries: {
        Row: {
          billing_amount: number | null
          billing_target: string | null
          category: string
          description: string
          entry_date: string | null
          entry_type: string
          expense_amount: number | null
          id: number
          inserted_at: string
          invoice_number: string | null
          manager_id: number
          payment_method: string | null
          team: string | null
          updated_at: string
        }
        Insert: {
          billing_amount?: number | null
          billing_target?: string | null
          category: string
          description: string
          entry_date?: string | null
          entry_type: string
          expense_amount?: number | null
          id?: never
          inserted_at?: string
          invoice_number?: string | null
          manager_id: number
          payment_method?: string | null
          team?: string | null
          updated_at?: string
        }
        Update: {
          billing_amount?: number | null
          billing_target?: string | null
          category?: string
          description?: string
          entry_date?: string | null
          entry_type?: string
          expense_amount?: number | null
          id?: never
          inserted_at?: string
          invoice_number?: string | null
          manager_id?: number
          payment_method?: string | null
          team?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "extra_entries_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matters: {
        Row: {
          accounting_memo: string | null
          business_count: number | null
          category: string
          cost_count: number | null
          description: string | null
          has_updates: boolean | null
          id: number
          inserted_at: string
          is_completed: boolean | null
          is_fixed: boolean | null
          parent_matter_id: number | null
          start_date: string | null
          team: string
          title: string
          total_amount: number | null
          total_cost: number | null
          unchecked_cost_count: number
          updated_at: string
          user_id: number
        }
        Insert: {
          accounting_memo?: string | null
          business_count?: number | null
          category: string
          cost_count?: number | null
          description?: string | null
          has_updates?: boolean | null
          id?: number
          inserted_at?: string
          is_completed?: boolean | null
          is_fixed?: boolean | null
          parent_matter_id?: number | null
          start_date?: string | null
          team: string
          title: string
          total_amount?: number | null
          total_cost?: number | null
          unchecked_cost_count?: number
          updated_at?: string
          user_id: number
        }
        Update: {
          accounting_memo?: string | null
          business_count?: number | null
          category?: string
          cost_count?: number | null
          description?: string | null
          has_updates?: boolean | null
          id?: number
          inserted_at?: string
          is_completed?: boolean | null
          is_fixed?: boolean | null
          parent_matter_id?: number | null
          start_date?: string | null
          team?: string
          title?: string
          total_amount?: number | null
          total_cost?: number | null
          unchecked_cost_count?: number
          updated_at?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "matters_parent_matter_id_fkey"
            columns: ["parent_matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          class: string | null
          email: string
          id: number
          inserted_at: string
          name: string
          slack_id: string | null
          team: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          class?: string | null
          email: string
          id?: number
          inserted_at?: string
          name: string
          slack_id?: string | null
          team?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          class?: string | null
          email?: string
          id?: number
          inserted_at?: string
          name?: string
          slack_id?: string | null
          team?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recurring_costs: {
        Row: {
          comment: string | null
          end_month: string | null
          id: number
          inserted_at: string
          item: string
          name: string
          payment_cycle: string
          price: number
          start_month: string
          team: string | null
          updated_at: string
        }
        Insert: {
          comment?: string | null
          end_month?: string | null
          id?: never
          inserted_at?: string
          item: string
          name: string
          payment_cycle?: string
          price: number
          start_month: string
          team?: string | null
          updated_at?: string
        }
        Update: {
          comment?: string | null
          end_month?: string | null
          id?: never
          inserted_at?: string
          item?: string
          name?: string
          payment_cycle?: string
          price?: number
          start_month?: string
          team?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      select_option_types: {
        Row: {
          category: Database["public"]["Enums"]["information_category"]
          created_at: string
          description: string | null
          display_name: string
          display_order: number | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["information_category"]
          created_at?: string
          description?: string | null
          display_name: string
          display_order?: number | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["information_category"]
          created_at?: string
          description?: string | null
          display_name?: string
          display_order?: number | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      select_options: {
        Row: {
          created_at: string
          display_order: number | null
          id: number
          is_active: boolean | null
          type_id: string | null
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          id?: number
          is_active?: boolean | null
          type_id?: string | null
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          id?: number
          is_active?: boolean | null
          type_id?: string | null
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "select_options_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "select_option_types"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_user_class: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      auth_user_team: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      custom_access_token_hook: {
        Args: { event: Json }
        Returns: Json
      }
    }
    Enums: {
      information_category: "basic_info" | "business_info" | "cost_info"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      information_category: ["basic_info", "business_info", "cost_info"],
    },
  },
} as const

