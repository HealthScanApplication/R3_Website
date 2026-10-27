import React, { useRef, useState } from 'react';

/**
 * A photo target that works two ways: call `open()` (from a button) to choose a file, or drop a file anywhere on it.
 *
 * The file input is hidden and opened with `input.click()` from a real button. The Profile page used a button inside a
 * `<label>` whose click handler called `preventDefault()`, which cancels the label's own activation, so the file chooser
 * never opened; and nothing handled a dropped file. `validate` returns a message for a file that cannot be used (the
 * caller decides the rules), and `onReject` shows it; a valid file goes to `onFile`.
 */
export interface PhotoDropzoneProps {
  onFile: (file: File) => void;
  onReject?: (message: string) => void;
  validate?: (file: File) => string | null;
  accept?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Receives `open` (shows the file chooser) and `dragging` (a file is being held over the target). */
  children: React.ReactNode | ((state: { open: () => void; dragging: boolean }) => React.ReactNode);
}

const hasFiles = (event: React.DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files');

export function PhotoDropzone({ onFile, onReject, validate, accept = 'image/jpeg,image/png,image/webp,image/gif', disabled, className, style, children }: PhotoDropzoneProps) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const take = (file: File | null | undefined) => {
    if (!file || disabled) return;
    const problem = validate?.(file) ?? null;
    if (problem) { onReject?.(problem); return; }
    onFile(file);
  };
  const open = () => { if (!disabled) input.current?.click(); };

  return (
    <div
      className={className}
      style={style}
      data-dragging={dragging ? 'true' : undefined}
      onDragEnter={(event) => { if (disabled || !hasFiles(event)) return; event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => { if (disabled || !hasFiles(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDragging(true); }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); take(event.dataTransfer?.files?.[0]); }}
    >
      <input
        ref={input}
        type="file"
        accept={accept}
        disabled={disabled}
        data-testid="photo-input"
        style={{ display: 'none' }}
        onChange={(event) => { take(event.target.files?.[0]); event.target.value = ''; }}
      />
      {typeof children === 'function' ? children({ open, dragging }) : children}
    </div>
  );
}
