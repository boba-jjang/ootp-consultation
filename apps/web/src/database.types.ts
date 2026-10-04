
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "advisor_messages": {
                  Row: {
                    "answer": string,"citations": NonNullable<Json>,"created_at": string,"id": string,"model": string,"owner_id": string,"question": string,"snapshot_id": string
                  }
                  Insert: {
                    "answer": string,"citations"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"model": string,"owner_id"?: string,"question": string,"snapshot_id": string
                  }
                  Update: {
                    "answer"?: string,"citations"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"model"?: string,"owner_id"?: string,"question"?: string,"snapshot_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "advisor_messages_snapshot_id_owner_id_fkey"
      columns: ["snapshot_id","owner_id"]
isOneToOne: false
      referencedRelation: "snapshots"
      referencedColumns: ["id","owner_id"]
    }
                  ]
                },"import_events": {
                  Row: {
                    "code": string,"created_at": string,"details": NonNullable<Json>,"id": string,"level": string,"message": string,"owner_id": string,"view_file_id": string
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"details"?: NonNullable<Json>,"id"?: string,"level": string,"message": string,"owner_id"?: string,"view_file_id": string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"details"?: NonNullable<Json>,"id"?: string,"level"?: string,"message"?: string,"owner_id"?: string,"view_file_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_events_view_file_id_owner_id_fkey"
      columns: ["view_file_id","owner_id"]
isOneToOne: false
      referencedRelation: "view_files"
      referencedColumns: ["id","owner_id"]
    }
                  ]
                },"snapshots": {
                  Row: {
                    "created_at": string,"game_number": number,"id": string,"label": string,"owner_id": string,"team_id": string
                  }
                  Insert: {
                    "created_at"?: string,"game_number": number,"id"?: string,"label": string,"owner_id"?: string,"team_id": string
                  }
                  Update: {
                    "created_at"?: string,"game_number"?: number,"id"?: string,"label"?: string,"owner_id"?: string,"team_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "snapshots_team_id_owner_id_fkey"
      columns: ["team_id","owner_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id","owner_id"]
    }
                  ]
                },"teams": {
                  Row: {
                    "created_at": string,"dev_lab_slots": number,"dh_enabled": boolean,"games_per_season": number,"id": string,"league": string,"league_shows": string,"name": string,"owner_id": string,"rating_scale": string
                  }
                  Insert: {
                    "created_at"?: string,"dev_lab_slots": number,"dh_enabled": boolean,"games_per_season": number,"id"?: string,"league": string,"league_shows": string,"name": string,"owner_id"?: string,"rating_scale": string
                  }
                  Update: {
                    "created_at"?: string,"dev_lab_slots"?: number,"dh_enabled"?: boolean,"games_per_season"?: number,"id"?: string,"league"?: string,"league_shows"?: string,"name"?: string,"owner_id"?: string,"rating_scale"?: string
                  }
                  Relationships: [
                    
                  ]
                },"view_files": {
                  Row: {
                    "content": string,"created_at": string,"detected_view": string | null,"id": string,"importer_version": string,"original_filename": string,"owner_id": string,"routing": string,"scope": string | null,"sha256": string,"side": string | null,"snapshot_id": string
                  }
                  Insert: {
                    "content": string,"created_at"?: string,"detected_view"?: string | null,"id"?: string,"importer_version": string,"original_filename": string,"owner_id"?: string,"routing": string,"scope"?: string | null,"sha256": string,"side"?: string | null,"snapshot_id": string
                  }
                  Update: {
                    "content"?: string,"created_at"?: string,"detected_view"?: string | null,"id"?: string,"importer_version"?: string,"original_filename"?: string,"owner_id"?: string,"routing"?: string,"scope"?: string | null,"sha256"?: string,"side"?: string | null,"snapshot_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "view_files_snapshot_id_owner_id_fkey"
      columns: ["snapshot_id","owner_id"]
isOneToOne: false
      referencedRelation: "snapshots"
      referencedColumns: ["id","owner_id"]
    }
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
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
