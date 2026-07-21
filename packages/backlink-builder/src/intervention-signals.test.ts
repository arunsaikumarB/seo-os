import { describe, expect, it } from 'vitest';
import {
  detectInterventionSignals,
  detectLoginForm,
  interventionCopyForPauseReason,
  workflowStepLabel,
} from '../src/intervention-signals.js';

describe('intervention signals', () => {
  it('does not treat password-only submission forms as login', () => {
    const html =
      '<form><input name="title" required /><input type="password" name="admin_pin" /><button>Submit</button></form>';
    expect(detectLoginForm(html)).toBe(false);
    expect(detectInterventionSignals(html).primaryGate).toBeNull();
  });

  it('detects a real login form', () => {
    const html =
      '<form action="/login"><h1>Sign in</h1><input type="email" name="email" /><input type="password" /><button>Log in</button></form>';
    expect(detectLoginForm(html, 'https://directory6.org/login')).toBe(true);
    const s = detectInterventionSignals(html, 'https://directory6.org/login');
    expect(s.primaryGate).toBe('login');
    expect(s.reason).toMatch(/Login form detected/i);
  });

  it('detects registration instead of login', () => {
    const html =
      '<form action="/register"><h1>Create account</h1><input type="email" /><input type="password" name="password" /><input type="password" name="password_confirmation" /><button>Sign up</button></form>';
    expect(detectLoginForm(html, 'https://example.com/register')).toBe(false);
    const s = detectInterventionSignals(html, 'https://example.com/register');
    expect(s.primaryGate).toBe('signup');
    expect(s.reason).toMatch(/Registration is required/i);
  });

  it('detects category manual input', () => {
    const html =
      '<form><label>Category</label><select name="category" required><option value="">Select category</option><option value="1">Tech</option></select></form>';
    const s = detectInterventionSignals(html);
    expect(s.primaryGate).toBe('category');
    expect(s.reason).toMatch(/Category selection requires manual input/i);
  });

  it('never labels login when loginFormDetected is false', () => {
    const copy = interventionCopyForPauseReason('login', {
      loginFormDetected: false,
      explanation: 'Category selection requires manual input.',
    });
    expect(copy.reason).not.toMatch(/Login Required/i);
    expect(copy.gate).toBe('unknown');
  });

  it('maps workflow steps', () => {
    expect(workflowStepLabel('submit')).toBe('Submit Listing');
    expect(workflowStepLabel('select')).toBe('Select Category');
  });
});
