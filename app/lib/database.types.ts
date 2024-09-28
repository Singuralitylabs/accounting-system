export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      costs: {
        Row: {
          certificate: string
          comment: string | null
          id: number
          inserted_at: string
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
          id?: number
          inserted_at?: string
          item: string
          matter_id: number
          name: string
          payment_target: string
          period?: string | null
          price: number
          updated_at?: string
          withholding: boolean
        }
        Update: {
          certificate?: string
          comment?: string | null
          id?: number
          inserted_at?: string
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
      matters: {
        Row: {
          amount: number | null
          billing_address: string | null
          category: string
          id: number
          inserted_at: string
          invoice_date: string | null
          is_completed: boolean | null
          is_fixed: boolean | null
          period_date: string | null
          start_date: string | null
          team: string
          title: string
          updated_at: string
          user_id: number
        }
        Insert: {
          amount?: number | null
          billing_address?: string | null
          category: string
          id?: number
          inserted_at?: string
          invoice_date?: string | null
          is_completed?: boolean | null
          is_fixed?: boolean | null
          period_date?: string | null
          start_date?: string | null
          team: string
          title: string
          updated_at?: string
          user_id: number
        }
        Update: {
          amount?: number | null
          billing_address?: string | null
          category?: string
          id?: number
          inserted_at?: string
          invoice_date?: string | null
          is_completed?: boolean | null
          is_fixed?: boolean | null
          period_date?: string | null
          start_date?: string | null
          team?: string
          title?: string
          updated_at?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "matter_user_id_fkey"
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
          name: string
        }
        Insert: {
          class?: string | null
          email: string
          id?: never
          name: string
        }
        Update: {
          class?: string | null
          email?: string
          id?: never
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never
