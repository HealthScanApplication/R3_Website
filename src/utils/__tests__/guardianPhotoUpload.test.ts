import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const portal = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'guides', 'GuidePortal.tsx'), 'utf8');
const profile = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'ProfilePage.tsx'), 'utf8');

describe('photo upload wiring (a click and a drop must both work, in the Guardian portal and on the Profile page)', () => {
  it('both Guardian portrait uploads sit in a drop target and open the chooser from a real button', () => {
    expect(portal.match(/<PhotoDropzone onFile=\{uploadPortrait\}/g)).toHaveLength(2);
    expect(portal).toContain('validate={portraitProblem}');
    // The label-wrapped hidden input is gone: it gave a click target but no drop.
    expect(portal).not.toMatch(/<input type="file"[^>]*uploadPortrait/);
  });
  it('a portrait must be an image: the shared upload helper also takes videos, which a portrait cannot be', () => {
    expect(portal).toMatch(/portraitProblem = \(file: File\) => quickImageProblem\(file\)/);
    expect(portal).toContain('const PORTRAIT_ACCEPT = IMAGE_ACCEPT');
  });
  it('a portrait and every added photo go through the image validator before they are uploaded', () => {
    expect(portal).toMatch(/validateImageFile\(file\)[\s\S]{0,200}uploadGuideImage\(userId, file\)/);
    expect(portal).toMatch(/validateImageFiles\(chosenFiles\)[\s\S]{0,400}uploadGuideImage\(userId, file\)/);
  });
  it('the Profile page no longer calls server routes that are not in the deployed function', () => {
    expect(profile).not.toMatch(/update-user-profile|upload-profile-picture|remove-profile-picture/);
    expect(profile).not.toContain('onClick={(e: React.MouseEvent) => e.preventDefault()}'); // the click that cancelled the label's file chooser
  });
  it('the deployed function really has none of those three routes (this is why every Save answered 404)', () => {
    const fn = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'supabase', 'functions', 'make-server-ed0fe4c2', 'index.tsx'), 'utf8');
    expect(fn).not.toMatch(/update-user-profile|upload-profile-picture|remove-profile-picture/);
  });
});
