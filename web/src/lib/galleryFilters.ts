import type { PromptCaseWithCategory } from "../types";

const allCategoriesLabel = "全部";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function filterCases(
  cases: PromptCaseWithCategory[],
  query: string,
  selectedCategory: string
): PromptCaseWithCategory[] {
  const normalizedQuery = normalize(query);
  const hasCategoryFilter = selectedCategory !== allCategoriesLabel;

  return cases.filter((promptCase) => {
    if (hasCategoryFilter && promptCase.category_name !== selectedCategory) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const searchableText = [
      String(promptCase.case_number),
      promptCase.title,
      promptCase.category_name,
      promptCase.summary,
      promptCase.prompt_text,
      ...promptCase.tags
    ]
      .join(" ")
      .toLowerCase();

    return searchableText.includes(normalizedQuery);
  });
}

export function sortRecommendedCases(
  cases: PromptCaseWithCategory[],
  recommendedCaseNumbers: number[]
): PromptCaseWithCategory[] {
  if (recommendedCaseNumbers.length === 0) {
    return cases;
  }

  const recommendationOrder = new Map(
    recommendedCaseNumbers.map((caseNumber, index) => [caseNumber, index])
  );

  return [...cases].sort((left, right) => {
    const leftOrder = recommendationOrder.get(left.case_number);
    const rightOrder = recommendationOrder.get(right.case_number);

    if (leftOrder !== undefined && rightOrder !== undefined) {
      return leftOrder - rightOrder;
    }

    if (leftOrder !== undefined) {
      return -1;
    }

    if (rightOrder !== undefined) {
      return 1;
    }

    return left.case_number - right.case_number;
  });
}

export { allCategoriesLabel };
