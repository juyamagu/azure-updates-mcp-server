import { describe, it, expect } from 'vitest';
import { VERSION } from '../src/placeholder.js';

describe('Setup Validation', () => {
    it('should have correct version', () => {
        expect(VERSION).toBe('0.1.0');
    });
});
