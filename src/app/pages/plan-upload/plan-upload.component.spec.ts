import { checkPlanFile, PLAN_MAX_BYTES } from './plan-upload.component';

describe('checkPlanFile', () => {
  it('accepts images and PDFs up to 15MB', () => {
    expect(checkPlanFile({ size: 1000, type: 'image/jpeg' })).toBeNull();
    expect(checkPlanFile({ size: 1000, type: 'image/png' })).toBeNull();
    expect(checkPlanFile({ size: 1000, type: 'image/webp' })).toBeNull();
    expect(checkPlanFile({ size: PLAN_MAX_BYTES, type: 'application/pdf' })).toBeNull();
  });

  it('rejects other types, oversized and empty files', () => {
    expect(checkPlanFile({ size: 1000, type: 'image/svg+xml' })).toContain('只接受');
    expect(checkPlanFile({ size: 1000, type: 'text/html' })).toContain('只接受');
    expect(checkPlanFile({ size: PLAN_MAX_BYTES + 1, type: 'image/png' })).toContain('15MB');
    expect(checkPlanFile({ size: 0, type: 'image/png' })).toContain('空的');
  });
});
