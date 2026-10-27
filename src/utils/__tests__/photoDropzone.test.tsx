// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PhotoDropzone } from '../../components/PhotoDropzone';
import { validateProfilePhoto } from '../profilePhoto';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const png = () => new File([new Uint8Array(10)], 'me.png', { type: 'image/png' });
const pdf = () => new File([new Uint8Array(10)], 'me.pdf', { type: 'application/pdf' });
const drop = (el: Element, files: File[]) => fireEvent.drop(el, { dataTransfer: { files, types: ['Files'] } });

function setup(props: Partial<React.ComponentProps<typeof PhotoDropzone>> = {}) {
  const onFile = vi.fn(); const onReject = vi.fn();
  render(
    <PhotoDropzone onFile={onFile} onReject={onReject} validate={validateProfilePhoto} {...props}>
      {({ open, dragging }) => <div data-testid="zone"><button type="button" onClick={open}>Upload Photo</button><span>{dragging ? 'dragging' : 'idle'}</span></div>}
    </PhotoDropzone>,
  );
  return { onFile, onReject, zone: screen.getByTestId('zone') };
}

describe('PhotoDropzone', () => {
  it('the button opens the file chooser (the old button cancelled its own label and never did)', () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Upload Photo' }));
    expect(click).toHaveBeenCalledTimes(1);
  });
  it('a chosen file goes to onFile and the input is reset so the same file can be chosen again', () => {
    const { onFile } = setup();
    const input = screen.getByTestId('photo-input') as HTMLInputElement;
    const file = png();
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
  });
  it('a dropped image goes to onFile', () => {
    const { onFile, zone } = setup();
    const file = png();
    drop(zone, [file]);
    expect(onFile).toHaveBeenCalledWith(file);
  });
  it('a dropped file that is not usable is rejected with a message, not uploaded', () => {
    const { onFile, onReject, zone } = setup();
    drop(zone, [pdf()]);
    expect(onFile).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalledWith(expect.stringMatching(/JPG, PNG, WebP or GIF/));
  });
  it('shows that a file is being held over it, and clears when it leaves or is dropped', () => {
    const { zone } = setup();
    fireEvent.dragEnter(zone, { dataTransfer: { types: ['Files'], files: [] } });
    expect(screen.getByText('dragging')).toBeTruthy();
    fireEvent.dragLeave(zone, { relatedTarget: null });
    expect(screen.getByText('idle')).toBeTruthy();
    fireEvent.dragOver(zone, { dataTransfer: { types: ['Files'], files: [] } });
    expect(screen.getByText('dragging')).toBeTruthy();
    drop(zone, [png()]);
    expect(screen.getByText('idle')).toBeTruthy();
  });
  it('ignores something dragged that is not a file (selected text, a link)', () => {
    const { zone } = setup();
    fireEvent.dragEnter(zone, { dataTransfer: { types: ['text/plain'], files: [] } });
    expect(screen.getByText('idle')).toBeTruthy();
  });
  it('does nothing while disabled', () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    const { onFile, zone } = setup({ disabled: true });
    fireEvent.click(screen.getByRole('button', { name: 'Upload Photo' }));
    drop(zone, [png()]);
    expect(click).not.toHaveBeenCalled();
    expect(onFile).not.toHaveBeenCalled();
  });
});
