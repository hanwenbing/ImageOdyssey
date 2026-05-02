export type Category = {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
  source_gallery_file: string;
};

export type PromptCaseWithCategory = {
  id: string;
  case_number: number;
  title: string;
  category_id: string;
  category_name: string;
  prompt_text: string;
  image_storage_path: string;
  image_public_url: string;
  summary: string;
  tags: string[];
  source_gallery_file: string;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: {
          id: string;
          slug: string;
          name: string;
          sort_order: number;
          source_gallery_file: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          sort_order: number;
          source_gallery_file: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          sort_order?: number;
          source_gallery_file?: string;
        };
      };
      prompt_cases: {
        Row: {
          id: string;
          case_number: number;
          title: string;
          category_id: string;
          prompt_text: string;
          image_storage_path: string;
          image_public_url: string;
          summary: string;
          tags: string[];
          source_gallery_file: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          case_number: number;
          title: string;
          category_id: string;
          prompt_text: string;
          image_storage_path: string;
          image_public_url: string;
          summary?: string;
          tags?: string[];
          source_gallery_file: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          case_number?: number;
          title?: string;
          category_id?: string;
          prompt_text?: string;
          image_storage_path?: string;
          image_public_url?: string;
          summary?: string;
          tags?: string[];
          source_gallery_file?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      experiments: {
        Row: {
          id: string;
          source_image_storage_path: string;
          result_image_storage_path: string;
          prompt_case_id: string;
          original_prompt_text: string;
          rewritten_prompt_text: string;
          recommendation_query: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          source_image_storage_path: string;
          result_image_storage_path: string;
          prompt_case_id: string;
          original_prompt_text: string;
          rewritten_prompt_text: string;
          recommendation_query?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          source_image_storage_path?: string;
          result_image_storage_path?: string;
          prompt_case_id?: string;
          original_prompt_text?: string;
          rewritten_prompt_text?: string;
          recommendation_query?: string | null;
          created_at?: string;
        };
      };
    };
  };
};

export type ExperimentInsert = {
  source_image_storage_path: string;
  result_image_storage_path: string;
  prompt_case_id: string;
  original_prompt_text: string;
  rewritten_prompt_text: string;
  recommendation_query: string | null;
};

export type Recommendation = {
  case_number: number;
  reason: string;
};

export type RewriteResult = {
  rewritten_prompt_text: string;
  preserved_parts: string[];
  changed_parts: string[];
};
