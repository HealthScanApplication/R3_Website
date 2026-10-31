import type * as React from 'react';

type ModelViewerProps = React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
  src?: string;
  poster?: string;
  alt?: string;
  'camera-controls'?: string | boolean;
  'auto-rotate'?: string | boolean;
  'rotation-per-second'?: string;
  'shadow-intensity'?: string | number;
  'interaction-prompt'?: string;
  loading?: string;
};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': ModelViewerProps;
    }
  }
}

// @types/react 19 removed the global JSX namespace.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': ModelViewerProps;
    }
  }
}

export {};
