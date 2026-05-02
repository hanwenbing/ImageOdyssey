export type Category = {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
  source_gallery_file: string;
};

export type PromptCase = {
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
