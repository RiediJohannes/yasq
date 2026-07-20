export const generatePlayers = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    id: `${i}`,
    username: `MockPlayer${i}`
  }));
};

export interface Player {
  id: string,
  username: string
}

declare global {
  interface Window {
    __MOCK_PARTICIPANTS__: {
      id: string,
      username: string
    }[];
    __MOCK_USER_ID__: string;
    __MOCK_USER_NAME__: string;
    __MOCK_INSTANCE_ID__: string;
  }
}