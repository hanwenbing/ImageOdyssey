export type CaseIndexItem = {
  case_number: number;
  title: string;
  category_name: string;
  summary: string;
  tags: string[];
  prompt_excerpt: string;
  image_storage_path: string;
};

export type RecommendRequest = {
  source_image_storage_path: string;
  user_query: string;
  category_filter: string | null;
  case_numbers: number[];
};

export type RecommendResponse = {
  recommendations: Array<{
    case_number: number;
    reason: string;
  }>;
};

export type RewriteRequest = {
  source_image_storage_path: string;
  case_number: number;
  original_prompt_text: string;
};

export type RewriteResponse = {
  rewritten_prompt_text: string;
  preserved_parts: string[];
  changed_parts: string[];
};
