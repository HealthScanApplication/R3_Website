// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Workspace, GuardianWebsite, GuardianHeader } from '../../components/guides/GuidePortal';
import { useGuardianPage } from '../../components/guides/useGuardianPage';

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user:{id:'owner',app_metadata:{}},accessToken:null,signOut:()=>{} }) }));
const fixtures = vi.hoisted(() => ({
  profile:{id:'owner',user_id:'owner',slug:'test-guide',display_name:'Test Guide',specialties:[],social_links:{},headline:'Guidance',status:'published'},
  ramps:[{id:'one',slug:'first-path',name:'First path',status:'published',offer_ids:['offer-one'],audience:'Everyone',problem:'First problem'}, {id:'two',slug:'second-path',name:'Second path',status:'published',offer_ids:['offer-two'],audience:'Everyone',problem:'Second problem'}],
  offers:[{id:'offer-one',title:'First offer',kind:'routine',access_model:'free',status:'published',description:'First description'}, {id:'offer-two',title:'Second offer',kind:'routine',access_model:'free',status:'published',description:'Second description'}],
}));
vi.mock('../../utils/guidePortal', async importOriginal => ({
  ...await importOriginal<any>(),
  listGuideLeads:async()=>[],listGuideRecipes:async()=>[{id:'recipe',title:'Test recipe',meal_slot:'breakfast',status:'draft',servings:1,ingredients:[],instructions:[]}],listGuideOffers:async()=>fixtures.offers,
  listGuideValueRamps:async()=>fixtures.ramps,listRoutineOwners:async()=>new Map(),listPersonalProtocolPeople:async()=>new Map(),
  getGuideProfileBySlug:async()=>fixtures.profile,listGuardianReviews:async()=>[],
  createGuideLead:async()=>{ throw new Error('Could not save lead'); },
}));
beforeEach(()=>{ window.history.replaceState({},'','/guardians/workspace?tab=leads'); });
afterEach(cleanup);
const workspace = () => render(<Workspace profile={fixtures.profile as any} onProfile={()=>{}} />);

it('keeps sidebar navigation in the URL so reload opens the selected page', async()=>{
  workspace();
  fireEvent.click(screen.getByRole('button',{name:'Profile',exact:true}));
  expect(screen.getByRole('heading',{name:'Site builder'})).toBeTruthy();
  expect(window.location.search).toBe('?tab=profile');
});
it('restores the page on browser history navigation', async()=>{
  workspace();
  fireEvent.click(screen.getByRole('button',{name:'Profile',exact:true}));
  window.history.replaceState({},'','/guardians/workspace?tab=leads');
  fireEvent(window,new PopStateEvent('popstate'));
  expect(screen.getByRole('heading',{name:'Leads',exact:true})).toBeTruthy();
});
it('does not carry an open lead form or its values into another section',async()=>{
  workspace();
  fireEvent.click(screen.getByRole('button',{name:'Add lead'}));
  fireEvent.change(screen.getByPlaceholderText('Name'),{target:{value:'Unsaved lead'}});
  fireEvent.click(screen.getByRole('button',{name:'Protocols',exact:true}));
  expect(screen.queryByRole('button',{name:'Create',exact:true})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Add Protocol'}));
  expect((screen.getByPlaceholderText('Title') as HTMLInputElement).value).toBe('');
});
it('closes the active recipe editor when history returns to another tool',async()=>{
  workspace();
  fireEvent.click(screen.getByRole('button',{name:'Recipes',exact:true}));
  fireEvent.click(await screen.findByRole('link',{name:'Open builder',exact:true}));
  expect(screen.getByRole('button',{name:'← Recipes',exact:true})).toBeTruthy();
  window.history.replaceState({},'','/guardians/workspace?tab=leads');
  fireEvent(window,new PopStateEvent('popstate'));
  expect(screen.getByRole('heading',{name:'Leads',exact:true})).toBeTruthy();
});
it('provides an openable link for every existing offer path',async()=>{
  window.history.replaceState({},'','/guardians/workspace?tab=value_ramps');
  workspace();
  await screen.findByRole('heading',{name:'Second path'});
  expect(screen.getByRole('link',{name:/Open.*Second path/i}).getAttribute('href')).toBe('/guardians/test-guide/value-ramp/second-path');
});
it('opens the requested public path instead of silently using the first path',async()=>{
  window.history.replaceState({},'','/guardians/test-guide/value-ramp/second-path');
  render(<GuardianWebsite slug="test-guide" isSignedIn />);
  await screen.findByRole('heading',{name:'Guidance'});
  await waitFor(()=>expect(screen.getByRole('heading',{name:'Second offer',exact:true})).toBeTruthy());
  expect(screen.getByRole('link',{name:'Guardian workspace →'}).getAttribute('href')).toBe('/guardians/workspace');
});
it('does not display a different funnel for a nonexistent public path',async()=>{
  window.history.replaceState({},'','/guardians/test-guide/value-ramp/missing-path');
  render(<GuardianWebsite slug="test-guide" isSignedIn />);
  expect(await screen.findByText('This page is not published yet.')).toBeTruthy();
  expect(screen.queryByRole('heading',{name:'First offer',exact:true})).toBeNull();
});
it('links each public path card to that path, not a shared first-funnel anchor',async()=>{
  window.history.replaceState({},'','/guardians/test-guide');
  render(<GuardianWebsite slug="test-guide" isSignedIn />);
  await screen.findByRole('heading',{name:'Guidance'});
  expect(screen.getAllByRole('link',{name:'Get it free'}).map(link=>link.getAttribute('href'))).toContain('/guardians/test-guide/value-ramp/second-path');
});
it('scrolls to the current funnel rather than reloading the same path',async()=>{
  window.history.replaceState({},'','/guardians/test-guide/value-ramp/first-path');
  render(<GuardianWebsite slug="test-guide" isSignedIn />);
  await screen.findByRole('heading',{name:'Guidance'});
  expect(screen.getAllByRole('link',{name:'Get it free'})[0].getAttribute('href')).toBe('#offers');
});
it('keeps a failed Add form editable and shows its save error',async()=>{
  workspace();
  fireEvent.click(screen.getByRole('button',{name:'Add lead'}));
  fireEvent.change(screen.getByPlaceholderText('Name'),{target:{value:'QA lead'}});
  fireEvent.click(screen.getByRole('button',{name:'Create',exact:true}));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent','Could not save lead');
  expect((screen.getByPlaceholderText('Name') as HTMLInputElement).value).toBe('QA lead');
  expect((screen.getByRole('button',{name:'Create',exact:true}) as HTMLButtonElement).disabled).toBe(false);
});
const steps=[1,2,3,4,5];
function SetupNavigation(){ const [step,setStep]=useGuardianPage('step',steps,1);return <><span>Step {step}</span><button onClick={()=>setStep(n=>n+1)}>Next step</button></>; }
it('keeps setup step clicks and browser history in sync',()=>{
  window.history.replaceState({},'','/guardians/workspace?step=2');
  render(<SetupNavigation />);
  fireEvent.click(screen.getByRole('button',{name:'Next step'}));
  expect(window.location.search).toBe('?step=3');
  window.history.replaceState({},'','/guardians/workspace?step=2');
  fireEvent(window,new PopStateEvent('popstate'));
  expect(screen.getByText('Step 2')).toBeTruthy();
});

it('locks the builder links while setup is unsaved, so they cannot reload the setup and drop answers', ()=>{
  const onNavigate = vi.fn();
  render(<GuardianHeader isSignedIn locked="finish setup to open the builders" onNavigate={onNavigate} />);
  // Without an href a locked builder is no longer a link, so find it by its label.
  const diet = screen.getByLabelText('Diet planner · finish setup to open the builders');
  expect(screen.queryByRole('link',{name:/Diet planner/})).toBeNull();
  expect(diet.getAttribute('aria-disabled')).toBe('true');
  expect(diet.getAttribute('href')).toBeNull();
  fireEvent.click(diet);
  expect(onNavigate).not.toHaveBeenCalled();
  expect(document.querySelector('.g-builder-menu')).toBeNull();
});
it('navigates in-app from an unlocked builder link', ()=>{
  const onNavigate = vi.fn();
  render(<GuardianHeader isSignedIn activeTab="leads" onNavigate={onNavigate} />);
  // The chip comes first; its dropdown also has a plain "Diet planner" link.
  fireEvent.click(screen.getAllByRole('link',{name:'Diet planner'})[0]);
  expect(onNavigate).toHaveBeenCalledWith('diet');
  expect(screen.getAllByRole('link',{name:'Offer builder'})[0].getAttribute('aria-current')).toBe('page');
});
it('keeps a long display name readable as a tooltip when it is truncated', ()=>{
  render(<GuardianHeader isSignedIn displayName="Dr Maximiliana Featherstonehaugh-Worthington" />);
  expect(screen.getByText('Dr Maximiliana Featherstonehaugh-Worthington').getAttribute('title')).toBe('Dr Maximiliana Featherstonehaugh-Worthington');
  expect(screen.getByRole('button',{name:'Sign out'})).toBeTruthy();
});
