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
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
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
          manager_id: number | null
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
          manager_id?: number | null
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
          manager_id?: number | null
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
          {
            foreignKeyName: "budget_declaration_items_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_declaration_reminder_settings: {
        Row: {
          id: number
          target_days: number[]
          updated_at: string
        }
        Insert: {
          id?: number
          target_days?: number[]
          updated_at?: string
        }
        Update: {
          id?: number
          target_days?: number[]
          updated_at?: string
        }
        Relationships: []
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
      budget_recurring_items: {
        Row: {
          amount: number
          category: string
          description: string
          display_order: number
          end_month: string | null
          entry_type: string
          id: number
          inserted_at: string
          manager_id: number | null
          start_month: string
          team: string
          updated_at: string
        }
        Insert: {
          amount: number
          category: string
          description: string
          display_order?: number
          end_month?: string | null
          entry_type: string
          id?: never
          inserted_at?: string
          manager_id?: number | null
          start_month: string
          team: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          description?: string
          display_order?: number
          end_month?: string | null
          entry_type?: string
          id?: never
          inserted_at?: string
          manager_id?: number | null
          start_month?: string
          team?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_recurring_items_manager_id_fkey"
            columns: ["manager_id"]
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
      profit_loss_adjustments: {
        Row: {
          adjusted_by: number
          adjustment_amount: number
          business_id: number | null
          cost_id: number | null
          id: number
          inserted_at: string
          reason: string
          recurring_cost_id: number | null
          source_amount_snapshot: number
          target_month: string
          updated_at: string
        }
        Insert: {
          adjusted_by: number
          adjustment_amount: number
          business_id?: number | null
          cost_id?: number | null
          id?: never
          inserted_at?: string
          reason: string
          recurring_cost_id?: number | null
          source_amount_snapshot: number
          target_month: string
          updated_at?: string
        }
        Update: {
          adjusted_by?: number
          adjustment_amount?: number
          business_id?: number | null
          cost_id?: number | null
          id?: never
          inserted_at?: string
          reason?: string
          recurring_cost_id?: number | null
          source_amount_snapshot?: number
          target_month?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profit_loss_adjustments_adjusted_by_fkey"
            columns: ["adjusted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profit_loss_adjustments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profit_loss_adjustments_cost_id_fkey"
            columns: ["cost_id"]
            isOneToOne: false
            referencedRelation: "costs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profit_loss_adjustments_recurring_cost_id_fkey"
            columns: ["recurring_cost_id"]
            isOneToOne: false
            referencedRelation: "recurring_costs"
            referencedColumns: ["id"]
          },
        ]
      }
      profit_loss_closing_dismissals: {
        Row: {
          closing_id: number
          dismissed_at: string
          dismissed_by: number
          dismissed_by_name: string
          id: number
          live_actual_amount: number | null
          live_category: string | null
          live_present: boolean
          live_team: string | null
          source_id: number
          source_type: string
        }
        Insert: {
          closing_id: number
          dismissed_at?: string
          dismissed_by: number
          dismissed_by_name: string
          id?: never
          live_actual_amount?: number | null
          live_category?: string | null
          live_present: boolean
          live_team?: string | null
          source_id: number
          source_type: string
        }
        Update: {
          closing_id?: number
          dismissed_at?: string
          dismissed_by?: number
          dismissed_by_name?: string
          id?: never
          live_actual_amount?: number | null
          live_category?: string | null
          live_present?: boolean
          live_team?: string | null
          source_id?: number
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "profit_loss_closing_dismissals_closing_id_fkey"
            columns: ["closing_id"]
            isOneToOne: false
            referencedRelation: "profit_loss_closings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profit_loss_closing_dismissals_dismissed_by_fkey"
            columns: ["dismissed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profit_loss_closing_lines: {
        Row: {
          actual_amount: number | null
          adjustment_amount: number | null
          adjustment_reason: string | null
          billing_amount: number | null
          category: string | null
          closing_id: number
          entry_date: string | null
          entry_type: string | null
          expense_amount: number | null
          id: number
          item: string | null
          matter_id: number | null
          matter_title: string | null
          matter_user_id: number | null
          name: string
          payment_cycle: string | null
          source_amount: number | null
          source_id: number
          source_type: string
          team: string | null
        }
        Insert: {
          actual_amount?: number | null
          adjustment_amount?: number | null
          adjustment_reason?: string | null
          billing_amount?: number | null
          category?: string | null
          closing_id: number
          entry_date?: string | null
          entry_type?: string | null
          expense_amount?: number | null
          id?: never
          item?: string | null
          matter_id?: number | null
          matter_title?: string | null
          matter_user_id?: number | null
          name: string
          payment_cycle?: string | null
          source_amount?: number | null
          source_id: number
          source_type: string
          team?: string | null
        }
        Update: {
          actual_amount?: number | null
          adjustment_amount?: number | null
          adjustment_reason?: string | null
          billing_amount?: number | null
          category?: string | null
          closing_id?: number
          entry_date?: string | null
          entry_type?: string | null
          expense_amount?: number | null
          id?: never
          item?: string | null
          matter_id?: number | null
          matter_title?: string | null
          matter_user_id?: number | null
          name?: string
          payment_cycle?: string | null
          source_amount?: number | null
          source_id?: number
          source_type?: string
          team?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profit_loss_closing_lines_closing_id_fkey"
            columns: ["closing_id"]
            isOneToOne: false
            referencedRelation: "profit_loss_closings"
            referencedColumns: ["id"]
          },
        ]
      }
      profit_loss_closings: {
        Row: {
          closed_at: string
          closed_by: number
          closed_by_name: string
          id: number
          inserted_at: string
          refreshed_at: string | null
          refreshed_by: number | null
          refreshed_by_name: string | null
          target_month: string
          updated_at: string
        }
        Insert: {
          closed_at?: string
          closed_by: number
          closed_by_name: string
          id?: never
          inserted_at?: string
          refreshed_at?: string | null
          refreshed_by?: number | null
          refreshed_by_name?: string | null
          target_month: string
          updated_at?: string
        }
        Update: {
          closed_at?: string
          closed_by?: number
          closed_by_name?: string
          id?: never
          inserted_at?: string
          refreshed_at?: string | null
          refreshed_by?: number | null
          refreshed_by_name?: string | null
          target_month?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profit_loss_closings_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profit_loss_closings_refreshed_by_fkey"
            columns: ["refreshed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profit_loss_labels: {
        Row: {
          business_id: number | null
          cost_id: number | null
          id: number
          inserted_at: string
          label: string
          matter_id: number | null
          recurring_cost_id: number | null
          updated_at: string
          updated_by: number
        }
        Insert: {
          business_id?: number | null
          cost_id?: number | null
          id?: never
          inserted_at?: string
          label: string
          matter_id?: number | null
          recurring_cost_id?: number | null
          updated_at?: string
          updated_by: number
        }
        Update: {
          business_id?: number | null
          cost_id?: number | null
          id?: never
          inserted_at?: string
          label?: string
          matter_id?: number | null
          recurring_cost_id?: number | null
          updated_at?: string
          updated_by?: number
        }
        Relationships: [
          {
            foreignKeyName: "profit_loss_labels_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profit_loss_labels_cost_id_fkey"
            columns: ["cost_id"]
            isOneToOne: false
            referencedRelation: "costs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profit_loss_labels_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profit_loss_labels_recurring_cost_id_fkey"
            columns: ["recurring_cost_id"]
            isOneToOne: false
            referencedRelation: "recurring_costs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profit_loss_labels_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      apply_profit_loss_closing_diffs: {
        Args: {
          p_target_month: string
          p_upsert_lines: Json
          p_delete_keys: Json
        }
        Returns: {
          applied_count: number
        }[]
      }
      auth_user_class: { Args: never; Returns: string }
      auth_user_team: { Args: never; Returns: string }
      can_access_team_budget: {
        Args: { target_team: string }
        Returns: boolean
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      dismiss_profit_loss_closing_diffs: {
        Args: {
          p_target_month: string
          p_dismissals: Json
        }
        Returns: {
          dismissed_count: number
        }[]
      }
      get_member_options: {
        Args: never
        Returns: {
          id: number
          name: string
        }[]
      }
      // p_declaration_id / p_comment は SQL 側で DEFAULT NULL を付けているため
      // 省略可能（supabase gen types は DEFAULT の有無だけを見て `?:` を付け、
      // `| null` は付与しない）。呼び出し側は null の代わりに undefined
      // （キー省略）を渡す（app/utils/supabase/budgetDeclarations.ts 参照）
      save_budget_declaration: {
        Args: {
          p_target_month: string
          p_team: string
          p_items: Json
          p_declaration_id?: number
          p_comment?: string
        }
        Returns: {
          id: number
        }[]
      }
      save_profit_loss_adjustment: {
        Args: {
          p_business_id: number | null
          p_cost_id: number | null
          p_recurring_cost_id: number | null
          p_target_month: string
          p_actual_amount: number
          p_reason: string
        }
        Returns: {
          deleted: boolean
          source_amount: number
          adjustment_amount: number
        }[]
      }
      save_profit_loss_closing: {
        Args: {
          p_target_month: string
          p_lines: Json
          p_closing_id?: number
        }
        Returns: {
          id: number
        }[]
      }
      save_profit_loss_label: {
        Args: {
          p_label: string
          p_matter_id?: number
          p_business_id?: number
          p_cost_id?: number
          p_recurring_cost_id?: number
        }
        Returns: {
          deleted: boolean
        }[]
      }
      undo_profit_loss_closing_dismissals: {
        Args: {
          p_target_month: string
          p_keys: Json
        }
        Returns: {
          undone_count: number
        }[]
      }
      validate_member_ids: {
        Args: { target_ids: number[] }
        Returns: {
          id: number
        }[]
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
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

