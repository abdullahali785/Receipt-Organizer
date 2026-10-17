import { resizeTarget } from '@/lib/resize';

describe('resizeTarget', () => {
  it('leaves small images alone', () => {
    expect(resizeTarget(1000, 2000, 2576)).toBeNull();
    expect(resizeTarget(2576, 2576, 2576)).toBeNull();
  });

  it('caps the long edge of a tall receipt photo', () => {
    expect(resizeTarget(3024, 4032, 2576)).toEqual({ width: null, height: 2576 });
  });

  it('caps the long edge of a wide photo', () => {
    expect(resizeTarget(4032, 3024, 2576)).toEqual({ width: 2576, height: null });
  });
});
