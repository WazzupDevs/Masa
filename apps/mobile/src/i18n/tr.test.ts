import { describe, expect, it } from 'vitest';

import { tr } from './tr';

describe('seat suffixes (Sahtekar)', () => {
  it('follow how the seat number is read', () => {
    expect(tr.sahtekar.passTo('A1')).toBe("Telefonu A1'e ver");
    expect(tr.sahtekar.passTo('A2')).toBe("Telefonu A2'ye ver");
    expect(tr.sahtekar.passTo('B3')).toBe("Telefonu B3'e ver");
    expect(tr.sahtekar.turnOf('A3')).toBe("Sıra A3'te");
    expect(tr.sahtekar.turnOf('B2')).toBe("Sıra B2'de");
    expect(tr.sahtekar.ready('A2')).toBe("Ben A2'yim, kartımı göster");
    expect(tr.sahtekar.ready('A4')).toBe("Ben A4'üm, kartımı göster");
  });
});
