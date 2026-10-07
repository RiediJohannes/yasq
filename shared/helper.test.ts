import { describe, expect, it } from 'vitest';

import { capitalize, getAvatarUrl } from './helper';
import { Participant } from './types';

describe('getAvatarUrl', () => {
  it('should return the correct avatar url when participant has an avatar', () => {
    const mockParticipant = {
      id: '123456789',
      avatar: 'abc',
    };

    const url = getAvatarUrl(mockParticipant as Participant);

    expect(url).toBe('https://cdn.discordapp.com/avatars/123456789/abc.png?size=64');
  });

  it('should return the correct default avatar url when participant has no avatar', () => {
    const mockParticipant = {
      id: '123456789',
    };

    const url = getAvatarUrl(mockParticipant as Participant);

    // 123456789 >> 22 = 29, which % 6 = 5, so the default avatar should be 5
    expect(url).toBe('https://cdn.discordapp.com/embed/avatars/5.png');
  });
});

describe('capitalize', () => {
  it('should properly capitalize snake_case strings', () => {
    expect(capitalize('hello_world')).toBe('Hello World');
  });

  it('should handle single words and casing correctly', () => {
    expect(capitalize('TEST_STRING_value')).toBe('Test String Value');
  });
});
