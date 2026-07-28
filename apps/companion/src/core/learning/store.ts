/**
 * Phase 3+ learning preparation — not implemented.
 * Keep shapes stable so field mappings / dropdowns / wizard steps can persist later.
 */

export type LearnedFieldMapping = {
  learningKey: string;
  role: string;
  selectors: string[];
  aliases: string[];
  updatedAt: string;
};

export type LearnedWizardStep = {
  learningKey: string;
  stepIndex: number;
  heading?: string;
  fieldRoles: string[];
};

export const learningStore = {
  async getMappings(_learningKey: string): Promise<LearnedFieldMapping[]> {
    return [];
  },
  async rememberMapping(_m: LearnedFieldMapping): Promise<void> {
    /* Phase 3 */
  },
  async getWizard(_learningKey: string): Promise<LearnedWizardStep[]> {
    return [];
  },
};
