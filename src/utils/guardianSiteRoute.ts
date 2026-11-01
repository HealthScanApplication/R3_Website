/** The Site builder and "Build your site" (setup step 05) are one page; the old workspace Profile tab sends people there. */
export const SITE_BUILDER_HREF = '/guardians/workspace?step=5';
export const openSiteBuilder = (): void => { window.location.replace(SITE_BUILDER_HREF); };
