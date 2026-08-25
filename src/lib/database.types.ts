/**
 * Tipos de la base de datos. Escritos a mano para reflejar el esquema de
 * supabase/migrations. En un proyecto real puedes regenerarlos con:
 *   supabase gen types typescript --local > src/lib/database.types.ts
 */

export type PromptBlockCategory =
  | 'accion'
  | 'expresion'
  | 'encuadre'
  | 'locacion'
  | 'iluminacion'
  | 'outfit'
  | 'estilo';

export type ApiKeyProvider = 'fal' | 'higgsfield' | 'replicate';

export type GenerationStatus = 'pending' | 'processing' | 'succeeded' | 'failed';

export interface Database {
  public: {
    Tables: {
      prompt_blocks: {
        Row: {
          id: string;
          category: PromptBlockCategory;
          label: string;
          prompt_fragment: string;
          is_custom: boolean;
          user_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          category: PromptBlockCategory;
          label: string;
          prompt_fragment: string;
          is_custom?: boolean;
          user_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          category?: PromptBlockCategory;
          label?: string;
          prompt_fragment?: string;
          is_custom?: boolean;
          user_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      saved_presets: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          block_ids: string[];
          final_prompt_text: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          block_ids?: string[];
          final_prompt_text?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          block_ids?: string[];
          final_prompt_text?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      avatars: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          reference_image_url: string | null;
          provider_reference_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          reference_image_url?: string | null;
          provider_reference_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          reference_image_url?: string | null;
          provider_reference_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      user_api_keys: {
        Row: {
          id: string;
          user_id: string;
          provider: ApiKeyProvider;
          api_key_encrypted: string;
          is_valid: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: ApiKeyProvider;
          api_key_encrypted: string;
          is_valid?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider?: ApiKeyProvider;
          api_key_encrypted?: string;
          is_valid?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      generations: {
        Row: {
          id: string;
          user_id: string;
          avatar_id: string | null;
          provider: ApiKeyProvider;
          model: string | null;
          prompt: string;
          status: GenerationStatus;
          output_path: string | null;
          provider_job_id: string | null;
          error: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          avatar_id?: string | null;
          provider: ApiKeyProvider;
          model?: string | null;
          prompt: string;
          status?: GenerationStatus;
          output_path?: string | null;
          provider_job_id?: string | null;
          error?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          avatar_id?: string | null;
          provider?: ApiKeyProvider;
          model?: string | null;
          prompt?: string;
          status?: GenerationStatus;
          output_path?: string | null;
          provider_job_id?: string | null;
          error?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      prompt_block_category: PromptBlockCategory;
      api_key_provider: ApiKeyProvider;
      generation_status: GenerationStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
