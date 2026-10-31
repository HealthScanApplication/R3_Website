/* The picture controls under an offer's card in the Guardian portal: sets or clears `guide_offers.cover_url`. */
import { CoverImageActions } from './CoverImageActions';
import { updateGuideOfferCover, type GuideOffer } from '../../utils/guidePortal';

export function OfferCoverControls({ offer, title, guideId, onUpdated, onOpenContentBuilder }: { offer: GuideOffer; title: string; guideId: string; onUpdated: (offer: GuideOffer) => void; onOpenContentBuilder?: () => void }) {
  return <CoverImageActions
    userId={guideId}
    title={title}
    description={offer.description}
    kind={offer.kind}
    imageUrl={offer.cover_url}
    onOpenContentBuilder={onOpenContentBuilder}
    hint="The picture on this offer’s card. Drop an image here, or upload one."
    onChange={async (url) => { onUpdated(await updateGuideOfferCover(guideId, offer.id, url)); }}
  />;
}
