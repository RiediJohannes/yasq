import { render } from 'preact';
import '../../src/style.css';
import './style.css';

interface MountParams {
  story: string;
  props?: Record<string, unknown>;
}

declare global {
  interface Window {
    mount: (params: MountParams) => Promise<void>;
    unmount: () => Promise<void>;
  }
}

const storyModules = import.meta.glob('../stories/*.story.tsx', { eager: true });

window.mount = async ({ story, props }: MountParams) => {
  const root = document.getElementById('root');
  if (!root) throw new Error('Root element not found');

  // Find requested story file
  const parts = story.split('/');
  const scenario = parts.pop() || '';
  const storyPathFragment = parts.join('/');
  const match = Object.entries(storyModules).find(
    ([path]) => path.includes(`${storyPathFragment}.story`) || path.includes(storyPathFragment)
  );

  if (!match) {
    throw new Error(`Story "${story}" not found. Available modules: ${Object.keys(storyModules).join(', ')}`);
  }

  const storyModule = match[1] as Record<string, any>;
  const TestComponent = storyModule[scenario];

  if (!TestComponent) {
    throw new Error(
      `Export "${scenario}" not found in story "${story}". Available exports: ${Object.keys(storyModule).join(', ')}`
    );
  }

  // Clear previous state and render test component
  render(null, root);
  render(<TestComponent {...props} />, root);
};

window.unmount = async () => {
  const root = document.getElementById('root');
  if (root) render(null, root);
};
