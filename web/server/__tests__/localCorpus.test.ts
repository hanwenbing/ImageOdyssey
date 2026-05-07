import { describe, expect, it } from "vitest";
import { getLocalCaseByNumber, loadLocalCaseIndex } from "../localCorpus";

describe("local corpus", () => {
  it("builds a case index with category names and the expected gaps", () => {
    const caseIndex = loadLocalCaseIndex();
    const caseNumbers = caseIndex.map((caseItem) => caseItem.case_number);
    const missingCaseNumbers: number[] = [];

    for (let caseNumber = 1; caseNumber <= Math.max(...caseNumbers); caseNumber += 1) {
      if (!caseNumbers.includes(caseNumber)) {
        missingCaseNumbers.push(caseNumber);
      }
    }

    expect(caseIndex).toHaveLength(352);
    expect(caseIndex.every((caseItem) => caseItem.category_name.trim().length > 0)).toBe(true);
    expect(missingCaseNumbers).toEqual([12, 169, 170]);
  });

  it("looks up a full case record by number", () => {
    const caseRecord = getLocalCaseByNumber(1);

    expect(caseRecord.case_number).toBe(1);
    expect(caseRecord.image_storage_path).toBe("cases/case1.jpg");
    expect(caseRecord.local_image_path).toBe("assets/case1.jpg");
    expect(caseRecord.category_name.trim().length).toBeGreaterThan(0);
    expect(caseRecord.prompt_text.trim().length).toBeGreaterThan(0);
  });
});
