import type * as React from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        poster?: string;
        alt?: string;
        'camera-controls'?: string | boolean;
        'auto-rotate'?: string | boolean;
        'shadow-intensity'?: string | number;
        'interaction-prompt'?: string;
        loading?: string;
      };
    }
  }
}

export {};
