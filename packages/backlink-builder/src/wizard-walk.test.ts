/**
 * Phase 14 — wizard-walk pure heuristics tests.
 */
import { describe, expect, it } from 'vitest';
import {
  classifyWizardStep,
  formatWizardStepSequence,
  htmlHasCoreContentFields,
  htmlHasNextControl,
  isFreeTierLabel,
  isIntermediateWizardStep,
  isPaidOnlyWizardStep,
  isPaidTierLabel,
  isPlaceholderOptionLabel,
  WIZARD_COULD_NOT_REACH_LABEL,
  WIZARD_PAID_ONLY_LABEL,
} from './wizard-walk.js';

const TAGSHUB_STEP1 = `
  <h1>Step One: Choose a Category</h1>
  <form>
    <select name="category" id="cat" required>
      <option value="">Select</option>
      <option>Business & Economy</option>
      <option>Computers & Internet</option>
    </select>
    <input type="submit" value="Go To Step Two" />
  </form>
`;

const TAGSHUB_STEP2 = `
  <h1>Step Two: Choose a Link Type</h1>
  <form>
    <label><input type="radio" name="LINK_TYPE" value="featured" /> Featured - $49</label>
    <label><input type="radio" name="LINK_TYPE" value="premium" /> Premium - $99</label>
    <label><input type="radio" name="LINK_TYPE" value="regular" /> Regular - free</label>
    <input type="submit" value="Go To Step Three" />
  </form>
`;

const TAGSHUB_STEP3 = `
  <h1>Step Three: Submit Your Site</h1>
  <form>
    <label for="TITLE">Title</label>
    <input id="TITLE" name="TITLE" type="text" required />
    <label for="URL">URL</label>
    <input id="URL" name="URL" type="text" required />
    <label for="DESC">Description</label>
    <textarea id="DESC" name="DESCRIPTION" required></textarea>
    <label for="META">META Description (limit 250)</label>
    <input id="META" name="META_DESCRIPTION" type="text" maxlength="250" />
    <label for="EMAIL">Owner Email</label>
    <input id="EMAIL" name="OWNER_EMAIL" type="email" />
    <label><input type="checkbox" name="AGREE" required /> I AGREE with submission rules</label>
    <button type="submit">Continue</button>
  </form>
`;

const PAID_ONLY = `
  <h1>Choose a plan</h1>
  <form>
    <label><input type="radio" name="plan" value="featured" /> Featured $49</label>
    <label><input type="radio" name="plan" value="premium" /> Premium $99</label>
    <button type="submit">Continue</button>
  </form>
`;

const OTHER_WIZARD_STEP1 = `
  <div class="wizard">Step 1 of 3</div>
  <form>
    <p>Pick your industry</p>
    <select name="industry">
      <option value="">Choose</option>
      <option>Software</option>
      <option>Retail</option>
    </select>
    <button type="button">Next</button>
  </form>
`;

describe('Phase 14 wizard-walk heuristics', () => {
  it('detects tagshub step 1 as intermediate (category + next)', () => {
    expect(htmlHasNextControl(TAGSHUB_STEP1)).toBe(true);
    expect(htmlHasCoreContentFields(TAGSHUB_STEP1)).toBe(false);
    expect(isIntermediateWizardStep(TAGSHUB_STEP1)).toBe(true);
    expect(classifyWizardStep(TAGSHUB_STEP1)).toBe('category');
  });

  it('classifies link-type step and free vs paid labels', () => {
    expect(classifyWizardStep(TAGSHUB_STEP2)).toBe('link_type');
    expect(isFreeTierLabel('Regular - free')).toBe(true);
    expect(isPaidTierLabel('Featured - $49')).toBe(true);
    expect(isPaidOnlyWizardStep(TAGSHUB_STEP2)).toBe(false);
  });

  it('recognizes step 3 as the real content form', () => {
    expect(htmlHasCoreContentFields(TAGSHUB_STEP3)).toBe(true);
    expect(isIntermediateWizardStep(TAGSHUB_STEP3)).toBe(false);
    expect(classifyWizardStep(TAGSHUB_STEP3)).toBe('content_form');
  });

  it('flags paid-only wizards with no free path', () => {
    expect(isPaidOnlyWizardStep(PAID_ONLY)).toBe(true);
    expect(classifyWizardStep(PAID_ONLY)).toBe('paid_only');
    expect(WIZARD_PAID_ONLY_LABEL).toMatch(/paid submission only/i);
  });

  it('generalizes to another directory wizard (not tagshub-specific)', () => {
    expect(isIntermediateWizardStep(OTHER_WIZARD_STEP1)).toBe(true);
    expect(classifyWizardStep(OTHER_WIZARD_STEP1)).toBe('category');
  });

  it('formats step sequence and could-not-reach label', () => {
    expect(formatWizardStepSequence(['Choose a category', 'choose Regular (free)', 'the form appears'])).toBe(
      'Choose a category → choose Regular (free) → the form appears'
    );
    expect(isPlaceholderOptionLabel('Select')).toBe(true);
    expect(WIZARD_COULD_NOT_REACH_LABEL).toMatch(/could not auto-reach/i);
  });
});
