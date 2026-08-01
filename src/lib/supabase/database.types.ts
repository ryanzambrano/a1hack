export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
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
      archive_cakes: {
        Row: {
          active: boolean
          bakery_id: string
          colors: string[]
          created_at: string
          embedding: Json | null
          has_name_text: boolean
          id: number
          labor_hours: number | null
          made_on: string | null
          occasion: string[]
          photo_url: string
          photos_represented: number
          price_cents: number | null
          servings: number | null
          shape: string | null
          source: string
          source_hash: string | null
          source_path: string | null
          spoken_description: string
          techniques: string[]
          themes: string[]
          thumbnail_url: string
          tiers: number
          title: string
        }
        Insert: {
          active?: boolean
          bakery_id: string
          colors?: string[]
          created_at?: string
          embedding?: Json | null
          has_name_text?: boolean
          id?: number
          labor_hours?: number | null
          made_on?: string | null
          occasion?: string[]
          photo_url?: string
          photos_represented?: number
          price_cents?: number | null
          servings?: number | null
          shape?: string | null
          source?: string
          source_hash?: string | null
          source_path?: string | null
          spoken_description?: string
          techniques?: string[]
          themes?: string[]
          thumbnail_url?: string
          tiers?: number
          title: string
        }
        Update: {
          active?: boolean
          bakery_id?: string
          colors?: string[]
          created_at?: string
          embedding?: Json | null
          has_name_text?: boolean
          id?: number
          labor_hours?: number | null
          made_on?: string | null
          occasion?: string[]
          photo_url?: string
          photos_represented?: number
          price_cents?: number | null
          servings?: number | null
          shape?: string | null
          source?: string
          source_hash?: string | null
          source_path?: string | null
          spoken_description?: string
          techniques?: string[]
          themes?: string[]
          thumbnail_url?: string
          tiers?: number
          title?: string
        }
        Relationships: []
      }
      bakeries: {
        Row: {
          address: string
          cake_types: string[]
          close_hour: number
          closed_weekdays: number[]
          currency: string
          description: string
          email: string
          fulfillment: Database["public"]["Enums"]["fulfillment"][]
          hours: string
          id: string
          location: string
          monthly_budget: number
          name: string
          open_hour: number
          order_cutoff_hour: number
          phone: string
          price_max: number
          price_min: number
          profile: Json
          slug: string
          updated_at: string
        }
        Insert: {
          address?: string
          cake_types?: string[]
          close_hour?: number
          closed_weekdays?: number[]
          currency?: string
          description?: string
          email?: string
          fulfillment?: Database["public"]["Enums"]["fulfillment"][]
          hours: string
          id?: string
          location: string
          monthly_budget: number
          name: string
          open_hour?: number
          order_cutoff_hour?: number
          phone: string
          price_max: number
          price_min: number
          profile?: Json
          slug?: string
          updated_at?: string
        }
        Update: {
          address?: string
          cake_types?: string[]
          close_hour?: number
          closed_weekdays?: number[]
          currency?: string
          description?: string
          email?: string
          fulfillment?: Database["public"]["Enums"]["fulfillment"][]
          hours?: string
          id?: string
          location?: string
          monthly_budget?: number
          name?: string
          open_hour?: number
          order_cutoff_hour?: number
          phone?: string
          price_max?: number
          price_min?: number
          profile?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      call_sessions: {
        Row: {
          call_sid: string
          done: boolean
          from_number: string
          lead_id: string
          started_at: string
        }
        Insert: {
          call_sid: string
          done?: boolean
          from_number: string
          lead_id: string
          started_at?: string
        }
        Update: {
          call_sid?: string
          done?: boolean
          from_number?: string
          lead_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_sessions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          audience: string
          bakery_id: string
          body: string
          cta: string
          daily_budget: number
          headline: string
          id: string
          launched_at: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          updated_at: string
        }
        Insert: {
          audience: string
          bakery_id: string
          body: string
          cta: string
          daily_budget: number
          headline: string
          id: string
          launched_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Update: {
          audience?: string
          bakery_id?: string
          body?: string
          cta?: string
          daily_budget?: number
          headline?: string
          id?: string
          launched_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_bakery_id_fkey"
            columns: ["bakery_id"]
            isOneToOne: false
            referencedRelation: "bakeries"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          cake_order: Json | null
          call_outcome: string | null
          created_at: string
          id: string
          name: string
          next_action: string | null
          phone: string
          source: string
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
        }
        Insert: {
          cake_order?: Json | null
          call_outcome?: string | null
          created_at?: string
          id: string
          name: string
          next_action?: string | null
          phone: string
          source: string
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Update: {
          cake_order?: Json | null
          call_outcome?: string | null
          created_at?: string
          id?: string
          name?: string
          next_action?: string | null
          phone?: string
          source?: string
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Relationships: []
      }
      order_lines: {
        Row: {
          cake_text: string
          id: number
          line_total_cents: number
          options_json: Json
          order_id: number
          product_id: number
          product_name: string
          qty: number
          unit_price_cents: number
        }
        Insert: {
          cake_text?: string
          id?: number
          line_total_cents: number
          options_json?: Json
          order_id: number
          product_id: number
          product_name: string
          qty: number
          unit_price_cents: number
        }
        Update: {
          cake_text?: string
          id?: number
          line_total_cents?: number
          options_json?: Json
          order_id?: number
          product_id?: number
          product_name?: string
          qty?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          assignment_state: Json
          bakery_id: string
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string
          delivery_address: string
          delivery_fee_cents: number
          delivery_miles: number | null
          fulfillment: string
          id: number
          lead_id: string | null
          note: string
          order_number: string
          payment_provider: string
          payment_reference: string
          payment_status: string
          pickup_date: string
          pickup_slot: string
          status: Database["public"]["Enums"]["order_status"]
          total_cents: number
        }
        Insert: {
          assignment_state?: Json
          bakery_id: string
          created_at?: string
          customer_email: string
          customer_name: string
          customer_phone: string
          delivery_address?: string
          delivery_fee_cents?: number
          delivery_miles?: number | null
          fulfillment?: string
          id?: number
          lead_id?: string | null
          note?: string
          order_number: string
          payment_provider: string
          payment_reference: string
          payment_status: string
          pickup_date: string
          pickup_slot: string
          status?: Database["public"]["Enums"]["order_status"]
          total_cents: number
        }
        Update: {
          assignment_state?: Json
          bakery_id?: string
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string
          delivery_address?: string
          delivery_fee_cents?: number
          delivery_miles?: number | null
          fulfillment?: string
          id?: number
          lead_id?: string | null
          note?: string
          order_number?: string
          payment_provider?: string
          payment_reference?: string
          payment_status?: string
          pickup_date?: string
          pickup_slot?: string
          status?: Database["public"]["Enums"]["order_status"]
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_bakery_id_fkey"
            columns: ["bakery_id"]
            isOneToOne: false
            referencedRelation: "bakeries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      pixero_connections: {
        Row: {
          access_token: string
          connected_at: string
          expires_at: string | null
          id: string
          refresh_token: string | null
          scope: string | null
          token_type: string
          updated_at: string
        }
        Insert: {
          access_token: string
          connected_at?: string
          expires_at?: string | null
          id: string
          refresh_token?: string | null
          scope?: string | null
          token_type?: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          connected_at?: string
          expires_at?: string | null
          id?: string
          refresh_token?: string | null
          scope?: string | null
          token_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_options: {
        Row: {
          group_name: string
          id: number
          is_default: boolean
          position: number
          price_delta_cents: number
          product_id: number
          value_name: string
        }
        Insert: {
          group_name: string
          id?: number
          is_default?: boolean
          position?: number
          price_delta_cents?: number
          product_id: number
          value_name: string
        }
        Update: {
          group_name?: string
          id?: number
          is_default?: boolean
          position?: number
          price_delta_cents?: number
          product_id?: number
          value_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          bakery_id: string
          base_price_cents: number
          cake_text_price_cents: number
          can_have_cake_text: boolean
          category: string
          created_at: string
          description: string
          id: number
          image_url: string
          lead_time_days: number
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          bakery_id: string
          base_price_cents: number
          cake_text_price_cents?: number
          can_have_cake_text?: boolean
          category?: string
          created_at?: string
          description?: string
          id?: number
          image_url?: string
          lead_time_days?: number
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          bakery_id?: string
          base_price_cents?: number
          cake_text_price_cents?: number
          can_have_cake_text?: boolean
          category?: string
          created_at?: string
          description?: string
          id?: number
          image_url?: string
          lead_time_days?: number
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_bakery_id_fkey"
            columns: ["bakery_id"]
            isOneToOne: false
            referencedRelation: "bakeries"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_options: {
        Row: {
          above_budget: boolean
          archive_cake_id: number
          id: number
          position: number
          price_high_cents: number
          price_low_cents: number
          proposal_id: number
          rationale: string
        }
        Insert: {
          above_budget?: boolean
          archive_cake_id: number
          id?: number
          position: number
          price_high_cents: number
          price_low_cents: number
          proposal_id: number
          rationale?: string
        }
        Update: {
          above_budget?: boolean
          archive_cake_id?: number
          id?: number
          position?: number
          price_high_cents?: number
          price_low_cents?: number
          proposal_id?: number
          rationale?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_options_archive_cake_id_fkey"
            columns: ["archive_cake_id"]
            isOneToOne: false
            referencedRelation: "archive_cakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_options_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          bakery_id: string
          brief: Json
          chosen_position: number | null
          code: string
          created_at: string
          estimate: Json | null
          id: number
          lead_id: string | null
          opened_at: string | null
        }
        Insert: {
          bakery_id: string
          brief?: Json
          chosen_position?: number | null
          code: string
          created_at?: string
          estimate?: Json | null
          id?: number
          lead_id?: string | null
          opened_at?: string | null
        }
        Update: {
          bakery_id?: string
          brief?: Json
          chosen_position?: number | null
          code?: string
          created_at?: string
          estimate?: Json | null
          id?: number
          lead_id?: string | null
          opened_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_bakery_id_fkey"
            columns: ["bakery_id"]
            isOneToOne: false
            referencedRelation: "bakeries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      transcript_messages: {
        Row: {
          created_at: string
          id: number
          lead_id: string
          speaker: Database["public"]["Enums"]["transcript_speaker"]
          text: string
        }
        Insert: {
          created_at?: string
          id?: never
          lead_id: string
          speaker: Database["public"]["Enums"]["transcript_speaker"]
          text: string
        }
        Update: {
          created_at?: string
          id?: never
          lead_id?: string
          speaker?: Database["public"]["Enums"]["transcript_speaker"]
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcript_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      campaign_status: "draft" | "active"
      fulfillment: "pickup" | "delivery"
      lead_status: "new" | "calling" | "qualified" | "follow_up" | "closed"
      order_status: "new" | "confirmed" | "ready" | "picked_up" | "cancelled"
      transcript_speaker: "agent" | "customer"
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
      campaign_status: ["draft", "active"],
      fulfillment: ["pickup", "delivery"],
      lead_status: ["new", "calling", "qualified", "follow_up", "closed"],
      order_status: ["new", "confirmed", "ready", "picked_up", "cancelled"],
      transcript_speaker: ["agent", "customer"],
    },
  },
} as const
